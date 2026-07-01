import { Injectable } from '@nestjs/common';

import { assertIsDefinedOrThrow, isDefined } from 'twenty-shared/utils';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type UpdateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceNotFoundDefaultError } from 'src/engine/core-modules/workspace/workspace.exception';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { DealProductDiscountValidationService } from 'src/modules/sales-crm/services/deal-product-discount-validation.service';
import { DealProductPriceCalculationService } from 'src/modules/sales-crm/services/deal-product-price-calculation.service';

@Injectable()
@WorkspaceQueryHook(`dealProduct.updateOne`)
export class DealProductUpdateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly discountValidationService: DealProductDiscountValidationService,
    private readonly priceCalculationService: DealProductPriceCalculationService,
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
    const factorQuantities = payload.data.factorQuantities as
      | Record<string, number>
      | null
      | undefined;

    // Neither a discount nor the pricing factors changed -- an unrelated
    // field edit (e.g. lineStatus) shouldn't require a Product lookup at all.
    if (!isDefined(discountPercent) && !isDefined(factorQuantities)) {
      return payload;
    }

    let productId = payload.data.productId as string | null | undefined;

    // Partial update payloads often omit unchanged fields -- if productId
    // isn't in THIS payload, it wasn't changed, so look up the existing record.
    if (!isDefined(productId)) {
      const authContextForLookup = buildSystemAuthContext(workspace.id);

      productId =
        await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
          async () => {
            const dealProductRepository =
              await this.globalWorkspaceOrmManager.getRepository(
                workspace.id,
                'dealProduct',
                { shouldBypassPermissionChecks: true },
              );

            const existing = await dealProductRepository.findOne({
              where: { id: payload.id },
            });

            return existing?.productId as string | null | undefined;
          },
          authContextForLookup,
        );
    }

    if (isDefined(factorQuantities)) {
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

    if (isDefined(discountPercent)) {
      await this.discountValidationService.validate({
        workspaceId: workspace.id,
        productId,
        discountPercent,
      });
    }

    return payload;
  }
}
