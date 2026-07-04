import { Injectable } from '@nestjs/common';

import { assertIsDefinedOrThrow, isDefined } from 'twenty-shared/utils';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type UpdateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceNotFoundDefaultError } from 'src/engine/core-modules/workspace/workspace.exception';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { DealProductDiscountRuleApplicationService } from 'src/modules/sales-crm/services/deal-product-discount-rule-application.service';
import { DealProductDiscountRuleValidationService } from 'src/modules/sales-crm/services/deal-product-discount-rule-validation.service';
import { DealProductDiscountValidationService } from 'src/modules/sales-crm/services/deal-product-discount-validation.service';
import { DealProductPriceCalculationService } from 'src/modules/sales-crm/services/deal-product-price-calculation.service';
import { DealProductPricingVersionValidationService } from 'src/modules/sales-crm/services/deal-product-pricing-version-validation.service';
import { type CurrencyValue } from 'src/modules/sales-crm/types/currency-value.type';

@Injectable()
@WorkspaceQueryHook(`dealProduct.updateOne`)
export class DealProductUpdateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly discountValidationService: DealProductDiscountValidationService,
    private readonly priceCalculationService: DealProductPriceCalculationService,
    private readonly pricingVersionValidationService: DealProductPricingVersionValidationService,
    private readonly discountRuleValidationService: DealProductDiscountRuleValidationService,
    private readonly discountRuleApplicationService: DealProductDiscountRuleApplicationService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: UpdateOneResolverArgs,
  ): Promise<UpdateOneResolverArgs> {
    const workspace = authContext.workspace;

    assertIsDefinedOrThrow(workspace, WorkspaceNotFoundDefaultError);

    const discountPercent = payload.data.discountPercent as
      | number
      | null
      | undefined;
    let factorQuantities = payload.data.factorQuantities as
      | Record<string, number>
      | null
      | undefined;
    const pricingVersionId = payload.data.pricingVersionId as
      | string
      | null
      | undefined;
    const discountRuleId = payload.data.discountRuleId as
      | string
      | null
      | undefined;
    let quantity = payload.data.quantity as number | null | undefined;
    let opportunityId = payload.data.opportunityId as string | null | undefined;

    // Neither pricing- nor discount-related field changed -- an unrelated
    // field edit (e.g. lineStatus) shouldn't require any Product/Package/
    // Discount Rule lookup at all.
    if (
      !isDefined(discountPercent) &&
      !isDefined(factorQuantities) &&
      !isDefined(pricingVersionId) &&
      payload.data.pricingVersionId !== null &&
      !isDefined(discountRuleId)
    ) {
      return payload;
    }

    let productId = payload.data.productId as string | null | undefined;

    // Partial update payloads often omit unchanged fields -- if productId
    // (or factorQuantities, when switching pricingVersion without re-sending
    // quantities, or quantity/opportunityId, when setting a discountRule
    // without re-sending them) isn't in THIS payload, it wasn't changed, so
    // look up the existing record.
    if (
      !isDefined(productId) ||
      (isDefined(pricingVersionId) && !isDefined(factorQuantities)) ||
      (isDefined(discountRuleId) &&
        (!isDefined(quantity) || !isDefined(opportunityId)))
    ) {
      const authContextForLookup = buildSystemAuthContext(workspace.id);

      const existing =
        await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
          async () => {
            const dealProductRepository =
              await this.globalWorkspaceOrmManager.getRepository(
                workspace.id,
                'dealProduct',
                { shouldBypassPermissionChecks: true },
              );

            return dealProductRepository.findOne({
              where: { id: payload.id },
            });
          },
          authContextForLookup,
        );

      if (!isDefined(productId)) {
        productId = existing?.productId as string | null | undefined;
      }

      if (isDefined(pricingVersionId) && !isDefined(factorQuantities)) {
        factorQuantities = existing?.factorQuantities as
          | Record<string, number>
          | null
          | undefined;
      }

      if (isDefined(discountRuleId) && !isDefined(quantity)) {
        quantity = existing?.quantity as number | null | undefined;
      }

      if (isDefined(discountRuleId) && !isDefined(opportunityId)) {
        opportunityId = existing?.opportunityId as string | null | undefined;
      }
    }

    await this.pricingVersionValidationService.validate({
      workspaceId: workspace.id,
      productId,
      pricingVersionId,
    });

    if (isDefined(pricingVersionId)) {
      const calculated =
        await this.priceCalculationService.calculateFromPricingVersion({
          workspaceId: workspace.id,
          pricingVersionId,
          factorQuantities,
        });

      if (isDefined(calculated)) {
        payload.data.installPrice = calculated.installPrice;
        payload.data.annualPrice = calculated.annualPrice;
        payload.data.priceSnapshot = calculated.priceSnapshot;
      }
    } else if (isDefined(factorQuantities)) {
      const calculatedInstallPrice =
        await this.priceCalculationService.calculateInstallPrice({
          workspaceId: workspace.id,
          productId,
          factorQuantities,
        });

      if (isDefined(calculatedInstallPrice)) {
        payload.data.installPrice = calculatedInstallPrice;
      }
    }

    // An explicit `pricingVersionId: null` detaches the line from its
    // Pricing Version -- the old priceSnapshot no longer reflects reality
    // and must be cleared, regardless of which branch above fired.
    if (payload.data.pricingVersionId === null) {
      payload.data.priceSnapshot = null;
    }

    await this.discountRuleValidationService.validate({
      workspaceId: workspace.id,
      productId,
      opportunityId,
      quantity,
      discountRuleId,
    });

    const discountRuleEffect = await this.discountRuleApplicationService.apply({
      workspaceId: workspace.id,
      discountRuleId,
      installPrice: payload.data.installPrice as
        | CurrencyValue
        | null
        | undefined,
    });

    if (isDefined(discountRuleEffect)) {
      if (isDefined(discountRuleEffect.discountPercent)) {
        payload.data.discountPercent = discountRuleEffect.discountPercent;
      }

      if (isDefined(discountRuleEffect.installPrice)) {
        payload.data.installPrice = discountRuleEffect.installPrice;
      }
    }

    await this.discountValidationService.validate({
      workspaceId: workspace.id,
      productId,
      discountPercent: payload.data.discountPercent as
        | number
        | null
        | undefined,
    });

    return payload;
  }
}
