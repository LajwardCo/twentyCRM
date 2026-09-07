import { Command } from 'nest-commander';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

// Applies the manifest's `canDestroyAllObjectRecords: false` to workspaces that
// already exist.
//
// The manifest change alone is not enough: the standard application is only
// reconciled into a workspace when that workspace is created
// (workspace-manager.service.ts), so an instance that has been running keeps
// whatever its Admin role row already says. Nothing reconciles it on boot or on
// deploy.
//
// It cannot be done through the API either -- Admin is isEditable: false and
// updateOneRole is rejected with ROLE_NOT_EDITABLE -- which is why this is a
// command against the row rather than a call to the permissions service.
//
// Every other role is handled by tools/sales-crm/provision-no-hard-delete.mjs.
// Admin is the one that needs code.
@RegisteredWorkspaceCommand('2.15.0', 1800000011000)
@Command({
  name: 'upgrade:2-15:deny-admin-hard-delete',
  description:
    'Deny destroy (irreversible delete) to the Admin role in existing workspaces; soft delete is unaffected',
})
export class DenyAdminHardDeleteCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    @InjectWorkspaceScopedRepository(RoleEntity)
    private readonly roleRepository: WorkspaceScopedRepository<RoleEntity>,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    const isDryRun = options.dryRun ?? false;

    // Matched on the universal identifier rather than the label: a workspace
    // may have renamed the role, and the label is not what identifies it.
    const adminRole = await this.roleRepository.findOne(workspaceId, {
      where: { universalIdentifier: STANDARD_ROLE.admin.universalIdentifier },
    });

    if (!adminRole) {
      this.logger.log(
        `[${workspaceId}] no standard Admin role found — nothing to do`,
      );

      return;
    }

    if (!adminRole.canDestroyAllObjectRecords) {
      this.logger.log(`[${workspaceId}] Admin already cannot hard delete`);

      return;
    }

    if (isDryRun) {
      this.logger.log(
        `[${workspaceId}] would deny destroy to Admin role ${adminRole.id}`,
      );

      return;
    }

    await this.roleRepository.update(
      workspaceId,
      { id: adminRole.id },
      { canDestroyAllObjectRecords: false },
    );

    // The permissions the API enforces are read from cache, so without this the
    // running server keeps granting destroy until something else evicts it.
    await this.workspaceCacheService.invalidateAndRecompute(workspaceId, [
      'rolesPermissions',
      'flatRoleMaps',
    ]);

    this.logger.log(
      `[${workspaceId}] Admin can no longer hard delete (soft delete unchanged)`,
    );
  }
}
