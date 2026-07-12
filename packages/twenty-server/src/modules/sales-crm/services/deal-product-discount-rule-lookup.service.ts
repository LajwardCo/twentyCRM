import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';

// Single point of truth for fetching a Discount Rule by id -- shared by
// DealProductDiscountRuleValidationService and
// DealProductDiscountRuleApplicationService so a Deal Product create/update
// looks it up once instead of each service querying independently.
@Injectable()
export class DealProductDiscountRuleLookupService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async findById({
    workspaceId,
    discountRuleId,
  }: {
    workspaceId: string;
    discountRuleId: string | null | undefined;
  }) {
    if (!isDefined(discountRuleId)) {
      return undefined;
    }

    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
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
  }
}
