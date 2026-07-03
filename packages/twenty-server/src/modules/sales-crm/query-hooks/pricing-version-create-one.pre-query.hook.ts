import { Injectable } from '@nestjs/common';

import { assertIsDefinedOrThrow, isDefined } from 'twenty-shared/utils';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type CreateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceNotFoundDefaultError } from 'src/engine/core-modules/workspace/workspace.exception';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';

@Injectable()
@WorkspaceQueryHook(`pricingVersion.createOne`)
export class PricingVersionCreateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CreateOneResolverArgs,
  ): Promise<CreateOneResolverArgs> {
    const workspace = authContext.workspace;

    assertIsDefinedOrThrow(workspace, WorkspaceNotFoundDefaultError);

    const packageId = payload.data.packageId as string | null | undefined;

    if (!isDefined(packageId)) {
      return payload;
    }

    const systemAuthContext = buildSystemAuthContext(workspace.id);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const pricingVersionRepository =
        await this.globalWorkspaceOrmManager.getRepository(
          workspace.id,
          'pricingVersion',
          { shouldBypassPermissionChecks: true },
        );

      const existingVersions = await pricingVersionRepository.find({
        where: { packageId },
      });

      const nextVersionNumber =
        existingVersions.reduce(
          (max, version) =>
            Math.max(max, (version.versionNumber as number) ?? 0),
          0,
        ) + 1;

      payload.data.versionNumber = nextVersionNumber;

      const isActive = payload.data.isActive as boolean | null | undefined;

      if (isActive !== true) {
        return;
      }

      const previouslyActiveVersions = existingVersions.filter(
        (version) => version.isActive === true,
      );

      for (const previouslyActiveVersion of previouslyActiveVersions) {
        await pricingVersionRepository.update(
          { id: previouslyActiveVersion.id as string },
          { isActive: false, deactivatedAt: new Date() },
        );
      }
    }, systemAuthContext);

    return payload;
  }
}
