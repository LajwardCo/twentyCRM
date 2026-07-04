import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';

type CurrencyValue = {
  amountMicros: number | null;
  currencyCode: string | null;
};

// Computes the discount effect of an already-validated Discount Rule --
// PERCENTAGE rules set discountPercent (still subject to the existing
// maxDiscountPercent ceiling check, run by the caller afterward); FIXED_AMOUNT
// rules reduce the already-computed installPrice directly, floored at 0.
// Assumes DealProductDiscountRuleValidationService.validate() already ran
// and passed -- this service does not re-validate, only computes.
@Injectable()
export class DealProductDiscountRuleApplicationService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async apply({
    workspaceId,
    discountRuleId,
    installPrice,
  }: {
    workspaceId: string;
    discountRuleId: string | null | undefined;
    installPrice: CurrencyValue | null | undefined;
  }): Promise<
    | { discountPercent: number; installPrice?: never }
    | { discountPercent?: never; installPrice: CurrencyValue }
    | undefined
  > {
    if (!isDefined(discountRuleId)) {
      return undefined;
    }

    const authContext = buildSystemAuthContext(workspaceId);

    const discountRule =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const discountRuleRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              'discountRule',
              { shouldBypassPermissionChecks: true },
            );

          return discountRuleRepository.findOne({
            where: { id: discountRuleId },
          });
        },
        authContext,
      );

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
