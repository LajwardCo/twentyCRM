import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type CurrencyValue } from 'src/modules/sales-crm/types/currency-value.type';
import {
  type BillingFrequency,
  computePriceFromTierSchedule,
  type FactorTierSchedule,
  mergeProductFactorsIntoTierSchedule,
  productFactorToTierSchedule,
} from 'src/modules/sales-crm/utils/pricing-tier-schedule.util';

type PricingFactor = {
  name: string;
  unitPrice: number;
  billingFrequency?: BillingFrequency;
};
type FactorQuantities = Record<string, number>;

const readPricingFactors = (product: {
  pricingFactors?: unknown;
}): PricingFactor[] =>
  Array.isArray(product.pricingFactors)
    ? (product.pricingFactors as PricingFactor[])
    : [];

export type PriceSnapshot = {
  packageId: string | null;
  packageName: string | null;
  pricingVersionId: string;
  versionNumber: number;
  evaluatedAt: string;
  breakdown: ReturnType<typeof computePriceFromTierSchedule>['breakdown'];
  totalMonthly: number;
  totalHourly: number;
  totalAnnual: number;
};

const FALLBACK_CURRENCY_CODE = 'USD';

// Computes installPrice for a Deal Product line from the linked Product's
// per-factor rate table (Product.pricingFactors) and this line's quantities
// (DealProduct.factorQuantities) -- e.g. OPD priced per doctor + per
// employee, accounting priced per user + per inventory item. The actual
// rates are entered by whoever manages the Product catalog; this service has
// no hardcoded business numbers.
//
// Only runs when pricingModel === 'PER_FACTOR' and factorQuantities is
// present -- FLAT-priced products are left untouched (installPrice is set
// directly by whoever creates the Deal Product line).
@Injectable()
export class DealProductPriceCalculationService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async calculateInstallPrice({
    workspaceId,
    productId,
    factorQuantities,
  }: {
    workspaceId: string;
    productId: string | null | undefined;
    factorQuantities: FactorQuantities | null | undefined;
  }): Promise<
    { installPrice: CurrencyValue; annualPrice?: CurrencyValue } | undefined
  > {
    if (!isDefined(productId) || !isDefined(factorQuantities)) {
      return undefined;
    }

    const authContext = buildSystemAuthContext(workspaceId);

    const product =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const productRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              'product',
              { shouldBypassPermissionChecks: true },
            );

          return productRepository.findOne({ where: { id: productId } });
        },
        authContext,
      );

    if (product?.pricingModel !== 'PER_FACTOR') {
      return undefined;
    }

    const pricingFactors = readPricingFactors(product);

    if (pricingFactors.length === 0) {
      return undefined;
    }

    // Reuse the single pricing engine by treating each metric as a degenerate
    // single-band per-unit tier schedule -- keeps FLAT-per-metric pricing and
    // volume-tiered Package pricing on one code path. Each metric's
    // billingFrequency routes its subtotal to the right cadence bucket;
    // legacy rows without one default to MONTHLY.
    const schedule: FactorTierSchedule[] = pricingFactors.map(
      productFactorToTierSchedule,
    );

    const { totalMonthly, totalHourly, totalAnnual } =
      computePriceFromTierSchedule(schedule, factorQuantities);

    // installPrice/annualPrice are CURRENCY composite fields ({amountMicros,
    // currencyCode}), not plain numbers -- writing a raw number is silently
    // dropped. Reuse whichever currency the product's own base price is
    // already denominated in (set by whoever entered the catalog data),
    // falling back to USD only if that's also unset.
    const baseInstallPrice = product.baseInstallPrice as CurrencyValue | null;
    const currencyCode =
      baseInstallPrice?.currencyCode ?? FALLBACK_CURRENCY_CODE;

    // The deal line has no dedicated hourly field, so sub-annual cadences
    // (monthly + hourly) accumulate into installPrice while annual metrics
    // populate annualPrice -- no metric is dropped and no cadence is converted.
    return {
      installPrice: {
        amountMicros: Math.round((totalMonthly + totalHourly) * 1_000_000),
        currencyCode,
      },
      annualPrice:
        totalAnnual > 0
          ? {
              amountMicros: Math.round(totalAnnual * 1_000_000),
              currencyCode,
            }
          : undefined,
    };
  }

  // Computes installPrice/annualPrice from a Package's Pricing Version
  // (volume-tiered rate table) instead of the flat Product.pricingFactors
  // table -- see docs/superpowers/specs/2026-07-03-pricing-package-model-design.md.
  // Returns undefined if the version, its package, or its tierSchedule can't
  // be found -- callers should leave installPrice/annualPrice untouched in
  // that case (the pre-query hook's validation service is what rejects bad
  // input; this method only computes).
  async calculateFromPricingVersion({
    workspaceId,
    pricingVersionId,
    factorQuantities,
  }: {
    workspaceId: string;
    pricingVersionId: string | null | undefined;
    factorQuantities: FactorQuantities | null | undefined;
  }): Promise<
    | {
        installPrice: CurrencyValue;
        annualPrice: CurrencyValue;
        priceSnapshot: PriceSnapshot;
      }
    | undefined
  > {
    if (!isDefined(pricingVersionId) || !isDefined(factorQuantities)) {
      return undefined;
    }

    const authContext = buildSystemAuthContext(workspaceId);

    const { pricingVersion, packageRecord, product } =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const pricingVersionRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              'pricingVersion',
              { shouldBypassPermissionChecks: true },
            );

          const foundPricingVersion = await pricingVersionRepository.findOne({
            where: { id: pricingVersionId },
          });

          if (!isDefined(foundPricingVersion)) {
            return {
              pricingVersion: undefined,
              packageRecord: undefined,
              product: undefined,
            };
          }

          const packageRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              'package',
              { shouldBypassPermissionChecks: true },
            );

          const foundPackage = await packageRepository.findOne({
            where: { id: foundPricingVersion.packageId as string },
          });

          const productRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              'product',
              { shouldBypassPermissionChecks: true },
            );

          const foundProduct = isDefined(foundPackage)
            ? await productRepository.findOne({
                where: { id: foundPackage.productId as string },
              })
            : undefined;

          return {
            pricingVersion: foundPricingVersion,
            packageRecord: foundPackage,
            product: foundProduct,
          };
        },
        authContext,
      );

    if (!isDefined(pricingVersion)) {
      return undefined;
    }

    const tierSchedule = pricingVersion.tierSchedule as
      | FactorTierSchedule[]
      | null;

    if (!isDefined(tierSchedule) || !Array.isArray(tierSchedule)) {
      return undefined;
    }

    // A Package tiers only the metrics it names. Every other metric priced on
    // the Product (e.g. OPD tiers doctors but employees stay at 70/year) is
    // billed on top -- otherwise selecting a package would silently zero out
    // the metrics it doesn't mention.
    const mergedSchedule = mergeProductFactorsIntoTierSchedule(
      tierSchedule,
      isDefined(product) ? readPricingFactors(product) : [],
    );

    const { breakdown, totalMonthly, totalHourly, totalAnnual } =
      computePriceFromTierSchedule(mergedSchedule, factorQuantities);

    const currencyCode =
      (pricingVersion.currencyCode as string | null | undefined) ??
      (product?.baseInstallPrice as CurrencyValue | null | undefined)
        ?.currencyCode ??
      FALLBACK_CURRENCY_CODE;

    const priceSnapshot: PriceSnapshot = {
      packageId: (packageRecord?.id as string | undefined) ?? null,
      packageName: (packageRecord?.name as string | null | undefined) ?? null,
      pricingVersionId: pricingVersion.id as string,
      versionNumber: pricingVersion.versionNumber as number,
      evaluatedAt: new Date().toISOString(),
      breakdown,
      totalMonthly,
      totalHourly,
      totalAnnual,
    };

    return {
      // Same cadence mapping as the product-only path: the deal line has no
      // hourly field, so monthly + hourly land in installPrice and annual
      // metrics populate annualPrice -- no metric is dropped, none converted.
      installPrice: {
        amountMicros: Math.round((totalMonthly + totalHourly) * 1_000_000),
        currencyCode,
      },
      annualPrice: {
        amountMicros: Math.round(totalAnnual * 1_000_000),
        currencyCode,
      },
      priceSnapshot,
    };
  }
}
