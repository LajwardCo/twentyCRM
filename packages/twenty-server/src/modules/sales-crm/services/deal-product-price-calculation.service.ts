import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';

type PricingFactor = { name: string; unitPrice: number };
type FactorQuantities = Record<string, number>;
type CurrencyValue = {
  amountMicros: number | null;
  currencyCode: string | null;
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
  }): Promise<CurrencyValue | undefined> {
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

    const pricingFactors = product.pricingFactors as PricingFactor[] | null;

    if (!isDefined(pricingFactors) || !Array.isArray(pricingFactors)) {
      return undefined;
    }

    let total = 0;

    for (const factor of pricingFactors) {
      const quantity = factorQuantities[factor.name];

      if (isDefined(quantity) && typeof quantity === 'number') {
        total += factor.unitPrice * quantity;
      }
    }

    // installPrice/annualPrice are CURRENCY composite fields ({amountMicros,
    // currencyCode}), not plain numbers -- writing a raw number is silently
    // dropped. Reuse whichever currency the product's own base price is
    // already denominated in (set by whoever entered the catalog data),
    // falling back to USD only if that's also unset.
    const baseInstallPrice = product.baseInstallPrice as CurrencyValue | null;
    const currencyCode =
      baseInstallPrice?.currencyCode ?? FALLBACK_CURRENCY_CODE;

    return {
      amountMicros: Math.round(total * 1_000_000),
      currencyCode,
    };
  }
}
