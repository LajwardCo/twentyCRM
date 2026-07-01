import { Injectable } from '@nestjs/common';

import { msg } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import {
  CommonQueryRunnerException,
  CommonQueryRunnerExceptionCode,
} from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';

// Enforces the Product catalog's discount ceiling on Deal Product lines.
// Sellers cannot save a discount above what the Product allows -- this is
// the synchronous, hard-blocking half of "don't let sellers sign below the
// floor"; the reactive half (flagging out-of-policy contracts after the
// fact) is not needed once this exists.
@Injectable()
export class DealProductDiscountValidationService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async validate({
    workspaceId,
    productId,
    discountPercent,
  }: {
    workspaceId: string;
    productId: string | null | undefined;
    discountPercent: number | null | undefined;
  }): Promise<void> {
    if (!isDefined(discountPercent) || discountPercent <= 0) {
      return;
    }

    if (!isDefined(productId)) {
      throw new CommonQueryRunnerException(
        'A discount cannot be set without a linked Product (the discount ceiling comes from the Product).',
        CommonQueryRunnerExceptionCode.INVALID_ARGS_DATA,
        {
          userFriendlyMessage: msg`A discount cannot be set without a linked Product.`,
        },
      );
    }

    const authContext = buildSystemAuthContext(workspaceId);

    const maxDiscountPercent =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const productRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              'product',
              { shouldBypassPermissionChecks: true },
            );

          const product = await productRepository.findOne({
            where: { id: productId },
          });

          return product?.maxDiscountPercent as number | null | undefined;
        },
        authContext,
      );

    if (!isDefined(maxDiscountPercent)) {
      return;
    }

    if (discountPercent > maxDiscountPercent) {
      throw new CommonQueryRunnerException(
        `Discount ${discountPercent}% exceeds this product's maximum allowed discount of ${maxDiscountPercent}%.`,
        CommonQueryRunnerExceptionCode.INVALID_ARGS_DATA,
        {
          userFriendlyMessage: msg`This discount exceeds the maximum allowed for this product. Ask your team lead to adjust the product's discount ceiling if this is intentional.`,
        },
      );
    }
  }
}
