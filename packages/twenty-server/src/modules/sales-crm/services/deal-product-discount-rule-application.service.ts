import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { type DealProductDiscountRuleLookupService } from 'src/modules/sales-crm/services/deal-product-discount-rule-lookup.service';
import { type CurrencyValue } from 'src/modules/sales-crm/types/currency-value.type';

// Computes the discount effect of an already-validated Discount Rule --
// PERCENTAGE rules set discountPercent (still subject to the existing
// maxDiscountPercent ceiling check, run by the caller afterward); FIXED_AMOUNT
// rules reduce the already-computed installPrice directly, floored at 0.
// Assumes DealProductDiscountRuleValidationService.validate() already ran
// and passed -- this service does not re-validate, only computes. Takes the
// Discount Rule already fetched by DealProductDiscountRuleLookupService
// rather than re-querying it.
@Injectable()
export class DealProductDiscountRuleApplicationService {
  async apply({
    discountRule,
    installPrice,
  }: {
    discountRule: Awaited<
      ReturnType<DealProductDiscountRuleLookupService['findById']>
    >;
    installPrice: CurrencyValue | null | undefined;
  }): Promise<
    | { discountPercent: number; installPrice?: never }
    | { discountPercent?: never; installPrice: CurrencyValue }
    | undefined
  > {
    if (!isDefined(discountRule)) {
      return undefined;
    }

    if (discountRule.discountType === 'PERCENTAGE') {
      const discountPercentValue = discountRule.discountPercentValue as
        | number
        | null
        | undefined;

      if (!isDefined(discountPercentValue)) {
        return undefined;
      }

      return { discountPercent: discountPercentValue };
    }

    if (discountRule.discountType === 'FIXED_AMOUNT') {
      const discountFixedAmount = discountRule.discountFixedAmount as
        | CurrencyValue
        | null
        | undefined;

      if (
        !isDefined(discountFixedAmount?.amountMicros) ||
        !isDefined(installPrice?.amountMicros)
      ) {
        return undefined;
      }

      const adjustedAmountMicros = Math.max(
        0,
        (installPrice.amountMicros as number) -
          (discountFixedAmount.amountMicros as number),
      );

      return {
        installPrice: {
          amountMicros: adjustedAmountMicros,
          currencyCode: installPrice?.currencyCode ?? null,
        },
      };
    }

    return undefined;
  }
}
