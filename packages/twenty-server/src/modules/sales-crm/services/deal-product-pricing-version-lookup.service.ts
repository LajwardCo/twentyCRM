import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';

// Single point of truth for fetching a Pricing Version together with its
// Package by id -- shared by DealProductPricingVersionValidationService and
// DealProductPriceCalculationService.calculateFromPricingVersion so a Deal
// Product create/update looks them up once instead of each service querying
// independently.
@Injectable()
export class DealProductPricingVersionLookupService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async findWithPackage({
    workspaceId,
    pricingVersionId,
  }: {
    workspaceId: string;
    pricingVersionId: string | null | undefined;
  }) {
    if (!isDefined(pricingVersionId)) {
      return { pricingVersion: undefined, packageRecord: undefined };
    }

    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
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
          return { pricingVersion: undefined, packageRecord: undefined };
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

        return {
          pricingVersion: foundPricingVersion,
          packageRecord: foundPackage,
        };
      },
      authContext,
    );
  }
}
