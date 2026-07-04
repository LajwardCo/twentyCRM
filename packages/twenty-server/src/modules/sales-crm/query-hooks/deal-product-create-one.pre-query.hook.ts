import { Injectable } from '@nestjs/common';

import { assertIsDefinedOrThrow, isDefined } from 'twenty-shared/utils';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type CreateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceNotFoundDefaultError } from 'src/engine/core-modules/workspace/workspace.exception';
import { DealProductDiscountValidationService } from 'src/modules/sales-crm/services/deal-product-discount-validation.service';
import { DealProductPriceCalculationService } from 'src/modules/sales-crm/services/deal-product-price-calculation.service';
import { DealProductPricingVersionValidationService } from 'src/modules/sales-crm/services/deal-product-pricing-version-validation.service';

@Injectable()
@WorkspaceQueryHook(`dealProduct.createOne`)
export class DealProductCreateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly discountValidationService: DealProductDiscountValidationService,
    private readonly priceCalculationService: DealProductPriceCalculationService,
    private readonly pricingVersionValidationService: DealProductPricingVersionValidationService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CreateOneResolverArgs,
  ): Promise<CreateOneResolverArgs> {
    const workspace = authContext.workspace;

    assertIsDefinedOrThrow(workspace, WorkspaceNotFoundDefaultError);

    const productId = payload.data.productId as string | null | undefined;
    const pricingVersionId = payload.data.pricingVersionId as
      | string
      | null
      | undefined;
    const factorQuantities = payload.data.factorQuantities as
      | Record<string, number>
      | null
      | undefined;

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
    } else {
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
