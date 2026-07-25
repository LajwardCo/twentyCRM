import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type CurrencyValue } from 'src/modules/sales-crm/types/currency-value.type';
import {
  applyFactorRateOverridesToProductFactors,
  applyFactorRateOverridesToTierSchedule,
  impliedDiscountPercent,
  type LinePriceOverrides,
  parseLinePriceOverrides,
  parseProductPriceBook,
  resolveLineFixedAmounts,
} from 'src/modules/sales-crm/utils/deal-line-price-overrides.util';
import {
  computeFixedPlusMetricsPrice,
  type ProductPricingFactor,
} from 'src/modules/sales-crm/utils/product-fixed-plus-metrics-price.util';
import {
  computePriceFromTierSchedule,
  type FactorTierSchedule,
  mergeProductFactorsIntoTierSchedule,
} from 'src/modules/sales-crm/utils/pricing-tier-schedule.util';

type FactorQuantities = Record<string, number>;

const readPricingFactors = (product: {
  pricingFactors?: unknown;
}): ProductPricingFactor[] =>
  Array.isArray(product.pricingFactors)
    ? (product.pricingFactors as ProductPricingFactor[])
    : [];

// Both pricing paths report how far below the catalog the seller restated the
// line, so the hook can hold it to the Product's discount ceiling. It is 0
// whenever nothing was overridden, and also whenever the line is in a
// different currency than the catalog price -- comparing ؋ to $ would produce
// a meaningless "discount".
export type CalculatedLinePrice = {
  installPrice: CurrencyValue;
  annualPrice?: CurrencyValue;
  overrideDiscountPercent: number;
};

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
// employee, accounting priced per user + per inventory item -- plus whatever
// fixed amounts the product carries (baseInstallPrice as a one-time fee,
// baseAnnualPrice as a fixed annual fee). The actual rates are entered by
// whoever manages the Product catalog; this service has no hardcoded
// business numbers.
//
// Only runs when pricingModel === 'PER_FACTOR' -- FLAT-priced products are
// left untouched (installPrice is set directly by whoever creates the Deal
// Product line).
@Injectable()
export class DealProductPriceCalculationService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async calculateInstallPrice({
    workspaceId,
    productId,
    factorQuantities,
    priceOverrides: rawPriceOverrides,
    quantity,
    hasExplicitInstallPrice = false,
  }: {
    workspaceId: string;
    productId: string | null | undefined;
    factorQuantities: FactorQuantities | null | undefined;
    priceOverrides?: unknown;
    quantity?: number | null;
    hasExplicitInstallPrice?: boolean;
  }): Promise<CalculatedLinePrice | undefined> {
    if (!isDefined(productId)) {
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

    if (!isDefined(product)) {
      return undefined;
    }

    const overrides = parseLinePriceOverrides(rawPriceOverrides);
    // installPrice/annualPrice are CURRENCY composite fields ({amountMicros,
    // currencyCode}), not plain numbers -- writing a raw number is silently
    // dropped. The line's currency is whichever one the seller picked, else
    // the one the product's own base prices are denominated in.
    const baseInstallPrice = product.baseInstallPrice as CurrencyValue | null;
    const baseAnnualPrice = product.baseAnnualPrice as CurrencyValue | null;
    const priceBook = parseProductPriceBook(product.priceBook);

    const resolved = resolveLineFixedAmounts({
      priceBook,
      overrides,
      baseInstallPrice,
      baseAnnualPrice,
      fallbackCurrencyCode: FALLBACK_CURRENCY_CODE,
    });

    if (product.pricingModel !== 'PER_FACTOR') {
      return this.priceFixedProductLine({
        resolved,
        quantity,
        hasExplicitInstallPrice,
      });
    }

    const pricingFactors = readPricingFactors(product);

    // Nothing to price off: no fixed amounts and no metric quantities on this
    // line. Returning undefined leaves whatever installPrice the caller set
    // untouched, rather than stamping a meaningless 0 over it.
    const hasFixedAmount =
      resolved.baseInstallMicros !== 0 || resolved.baseAnnualMicros !== 0;
    const hasFactorQuantities =
      isDefined(factorQuantities) && Object.keys(factorQuantities).length > 0;

    if (!hasFixedAmount && !hasFactorQuantities) {
      return undefined;
    }

    const { installMicros, annualMicros } = computeFixedPlusMetricsPrice({
      pricingFactors: applyFactorRateOverridesToProductFactors(
        pricingFactors,
        overrides.factorRates,
      ),
      factorQuantities,
      baseInstallMicros: resolved.baseInstallMicros,
      baseAnnualMicros: resolved.baseAnnualMicros,
    });

    const catalogPrice = computeFixedPlusMetricsPrice({
      pricingFactors,
      factorQuantities,
      baseInstallMicros: Number(baseInstallPrice?.amountMicros ?? 0),
      baseAnnualMicros: Number(baseAnnualPrice?.amountMicros ?? 0),
    });

    return {
      installPrice: {
        amountMicros: installMicros,
        currencyCode: resolved.currencyCode,
      },
      annualPrice:
        annualMicros > 0
          ? { amountMicros: annualMicros, currencyCode: resolved.currencyCode }
          : undefined,
      overrideDiscountPercent: this.overrideDiscountPercent({
        overrides,
        lineCurrencyCode: resolved.currencyCode,
        catalogCurrencyCode:
          baseInstallPrice?.currencyCode ??
          baseAnnualPrice?.currencyCode ??
          FALLBACK_CURRENCY_CODE,
        catalogMicros: catalogPrice.installMicros + catalogPrice.annualMicros,
        lineMicros: installMicros + annualMicros,
      }),
    };
  }

  // A product that isn't priced per metric still has fixed amounts, and those
  // are now per-currency -- so picking USD on a FLAT product has to reach the
  // line. Only fills a price the caller left blank: a line whose installPrice
  // was set by hand (in the CRM UI) keeps it.
  private priceFixedProductLine({
    resolved,
    quantity,
    hasExplicitInstallPrice,
  }: {
    resolved: ReturnType<typeof resolveLineFixedAmounts>;
    quantity: number | null | undefined;
    hasExplicitInstallPrice: boolean;
  }): CalculatedLinePrice | undefined {
    if (hasExplicitInstallPrice) {
      return undefined;
    }

    const lineQuantity =
      isDefined(quantity) && Number.isFinite(quantity) && quantity > 0
        ? quantity
        : 1;
    const installMicros = resolved.baseInstallMicros * lineQuantity;
    const annualMicros = resolved.baseAnnualMicros * lineQuantity;

    if (installMicros === 0 && annualMicros === 0) {
      return undefined;
    }

    return {
      installPrice: {
        amountMicros: installMicros,
        currencyCode: resolved.currencyCode,
      },
      annualPrice:
        annualMicros > 0
          ? { amountMicros: annualMicros, currencyCode: resolved.currencyCode }
          : undefined,
      overrideDiscountPercent: 0,
    };
  }

  // Only a like-for-like comparison counts: a line switched to another
  // currency has no catalog price in that currency to be a discount against.
  private overrideDiscountPercent({
    overrides,
    lineCurrencyCode,
    catalogCurrencyCode,
    catalogMicros,
    lineMicros,
  }: {
    overrides: LinePriceOverrides;
    lineCurrencyCode: string;
    catalogCurrencyCode: string;
    catalogMicros: number;
    lineMicros: number;
  }): number {
    if (
      Object.keys(overrides).length === 0 ||
      lineCurrencyCode !== catalogCurrencyCode
    ) {
      return 0;
    }

    return impliedDiscountPercent(catalogMicros, lineMicros);
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
    priceOverrides: rawPriceOverrides,
  }: {
    workspaceId: string;
    pricingVersionId: string | null | undefined;
    factorQuantities: FactorQuantities | null | undefined;
    priceOverrides?: unknown;
  }): Promise<
    | {
        installPrice: CurrencyValue;
        annualPrice: CurrencyValue;
        priceSnapshot: PriceSnapshot;
        overrideDiscountPercent: number;
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

    const overrides = parseLinePriceOverrides(rawPriceOverrides);
    const { breakdown, totalMonthly, totalHourly, totalAnnual } =
      computePriceFromTierSchedule(
        applyFactorRateOverridesToTierSchedule(
          mergedSchedule,
          overrides.factorRates,
        ),
        factorQuantities,
      );

    const catalogTotals = computePriceFromTierSchedule(
      mergedSchedule,
      factorQuantities,
    );

    const catalogCurrencyCode =
      (pricingVersion.currencyCode as string | null | undefined) ??
      (product?.baseInstallPrice as CurrencyValue | null | undefined)
        ?.currencyCode ??
      FALLBACK_CURRENCY_CODE;
    const currencyCode = overrides.currencyCode ?? catalogCurrencyCode;

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
      overrideDiscountPercent: this.overrideDiscountPercent({
        overrides,
        lineCurrencyCode: currencyCode,
        catalogCurrencyCode,
        catalogMicros: Math.round(
          (catalogTotals.totalMonthly +
            catalogTotals.totalHourly +
            catalogTotals.totalAnnual) *
            1_000_000,
        ),
        lineMicros: Math.round(
          (totalMonthly + totalHourly + totalAnnual) * 1_000_000,
        ),
      }),
    };
  }
}
