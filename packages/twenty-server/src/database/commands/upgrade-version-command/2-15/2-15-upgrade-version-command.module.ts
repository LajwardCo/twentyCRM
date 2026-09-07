import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WorkspaceIteratorModule } from 'src/database/commands/command-runners/workspace-iterator.module';
import { AddWorkspaceMemberCalendarSystemCommand } from 'src/database/commands/upgrade-version-command/2-15/2-15-workspace-command-1800000010000-add-workspace-member-calendar-system.command';
import { MigrateManualTriggerVariablesToPayloadCommand } from 'src/database/commands/upgrade-version-command/2-15/2-15-workspace-command-1800000001000-migrate-manual-trigger-variables-to-payload.command';
import { SyncCalendarEventRecordPageCommand } from 'src/database/commands/upgrade-version-command/2-15/2-15-workspace-command-1800000002000-sync-calendar-event-record-page.command';
import { AddSendWhatsappCommandMenuItemsCommand } from 'src/database/commands/upgrade-version-command/2-15/2-15-workspace-command-1800000009000-add-send-whatsapp-command-menu-items.command';
import { DenyAdminHardDeleteCommand } from 'src/database/commands/upgrade-version-command/2-15/2-15-workspace-command-1800000011000-deny-admin-hard-delete.command';
import { ApplicationModule } from 'src/engine/core-modules/application/application.module';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';
import { WorkspaceMigrationModule } from 'src/engine/workspace-manager/workspace-migration/workspace-migration.module';

@Module({
  imports: [
    ApplicationModule,
    WorkspaceIteratorModule,
    WorkspaceCacheModule,
    WorkspaceMigrationModule,
    TypeOrmModule.forFeature([RoleEntity]),
  ],
  providers: [
    MigrateManualTriggerVariablesToPayloadCommand,
    SyncCalendarEventRecordPageCommand,
    AddSendWhatsappCommandMenuItemsCommand,
    AddWorkspaceMemberCalendarSystemCommand,
    DenyAdminHardDeleteCommand,
    provideWorkspaceScopedRepository(RoleEntity),
  ],
})
export class V2_15_UpgradeVersionCommandModule {}
