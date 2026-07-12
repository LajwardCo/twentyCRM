import { Injectable } from '@nestjs/common';

import { msg } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import {
  CommonQueryRunnerException,
  CommonQueryRunnerExceptionCode,
} from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type DealProductDiscountRuleLookupService } from 'src/modules/sales-crm/services/deal-product-discount-rule-lookup.service';
import {
  evaluateDiscountRuleCondition,
  type DiscountRuleConditionType,
} from 'src/modules/sales-crm/utils/discount-rule-condition.util';

// Enforces that a Deal Product can only reference an ACTIVE Discount Rule
// belonging to the same Product as the line, whose condition (volume
// threshold, or a sibling Deal Product for a bundled Product) is actually
// satisfied -- the "seller can't invent a discount" guarantee. Mirrors
// DealProductPricingVersionValidationService's role for the Package path.
@Injectable()
export class DealProductDiscountRuleValidationService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async validate({
    workspaceId,
    productId,
    opportunityId,
    quantity,
    discountRuleId,
    discountRule,
  }: {
    workspaceId: string;
    productId: string | null | undefined;
    opportunityId: string | null | undefined;
    quantity: number | null | undefined;
    discountRuleId: string | null | undefined;
    discountRule: Awaited<
      ReturnType<DealProductDiscountRuleLookupService['findById']>
    >;
  }): Promise<void> {
    if (!isDefined(discountRuleId)) {
      return;
    }

    if (!isDefined(productId)) {
      throw new CommonQueryRunnerException(
        'A discount rule cannot be set without a linked Product.',
        CommonQueryRunnerExceptionCode.INVALID_ARGS_DATA,
        {
          userFriendlyMessage: msg`A discount rule cannot be set without a linked Product.`,
        },
      );
    }

    const siblingProductIds =
      isDefined(discountRule) &&
      discountRule.conditionType === 'SIBLING_PRODUCT_PURCHASED' &&
      isDefined(opportunityId)
        ? await this.findSiblingProductIds({ workspaceId, opportunityId })
        : [];

    if (!isDefined(discountRule)) {
      throw new CommonQueryRunnerException(
        'The linked discount rule does not exist.',
        CommonQueryRunnerExceptionCode.INVALID_ARGS_DATA,
        {
          userFriendlyMessage: msg`The selected discount rule could not be found.`,
        },
      );
    }

    if (discountRule.status !== 'ACTIVE') {
      throw new CommonQueryRunnerException(
        'The linked discount rule is not active.',
        CommonQueryRunnerExceptionCode.INVALID_ARGS_DATA,
        {
          userFriendlyMessage: msg`This discount rule has been archived. Select an active rule instead.`,
        },
      );
    }

    if ((discountRule.appliesToProductId as string | undefined) !== productId) {
      throw new CommonQueryRunnerException(
        'The linked discount rule applies to a different Product.',
        CommonQueryRunnerExceptionCode.INVALID_ARGS_DATA,
        {
          userFriendlyMessage: msg`This discount rule doesn't apply to this line's Product.`,
        },
      );
    }

    const evaluation = evaluateDiscountRuleCondition(
      {
        conditionType: discountRule.conditionType as DiscountRuleConditionType,
        conditionMinQuantity: discountRule.conditionMinQuantity as
          | number
          | null
          | undefined,
        conditionSiblingProduct: discountRule.conditionSiblingProductId as
          | string
          | null
          | undefined,
      },
      { quantity, siblingProductIds },
    );

    if (!evaluation.passed) {
      const userFriendlyMessage =
        evaluation.failureReason === 'BELOW_MIN_QUANTITY'
          ? msg`This discount rule requires a higher quantity on this line.`
          : evaluation.failureReason === 'SIBLING_PRODUCT_MISSING'
            ? msg`This discount rule requires another line for its linked product on the same Lead.`
            : evaluation.failureReason === 'MISSING_MIN_QUANTITY_CONFIG'
              ? msg`This discount rule is missing its minimum quantity setting. Ask an admin to fix it.`
              : msg`This discount rule is missing its linked product setting. Ask an admin to fix it.`;

      throw new CommonQueryRunnerException(
        `Discount rule condition not met (${evaluation.failureReason}).`,
        CommonQueryRunnerExceptionCode.INVALID_ARGS_DATA,
        { userFriendlyMessage },
      );
    }
  }

  private async findSiblingProductIds({
    workspaceId,
    opportunityId,
  }: {
    workspaceId: string;
    opportunityId: string;
  }): Promise<string[]> {
    const authContext = buildSystemAuthContext(workspaceId);

    const siblingDealProducts =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const dealProductRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              'dealProduct',
              { shouldBypassPermissionChecks: true },
            );

          return dealProductRepository.find({ where: { opportunityId } });
        },
        authContext,
      );

    return siblingDealProducts
      .map((dealProduct) => dealProduct.productId as string | null | undefined)
      .filter((id): id is string => isDefined(id));
  }
}
