import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TokenModule } from 'src/engine/core-modules/auth/token/token.module';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';
import { AuditLogPruneCommand } from 'src/modules/sales-crm/audit-log/commands/audit-log-prune.command';
import { AuditLogRetentionCronCommand } from 'src/modules/sales-crm/audit-log/commands/audit-log-retention.cron.command';
import { AuditLogController } from 'src/modules/sales-crm/audit-log/controllers/audit-log.controller';
import { AuditLogRetentionCronJob } from 'src/modules/sales-crm/audit-log/crons/audit-log-retention.cron.job';
import { AuditLogRetentionJob } from 'src/modules/sales-crm/audit-log/jobs/audit-log-retention.job';
import { AuditLogIngestService } from 'src/modules/sales-crm/audit-log/services/audit-log-ingest.service';
import { AuditLogRetentionService } from 'src/modules/sales-crm/audit-log/services/audit-log-retention.service';

// TokenModule and WorkspaceCacheStorageModule are what JwtAuthGuard and
// WorkspaceAuthGuard resolve their dependencies from; without them the app
// fails to boot rather than failing at request time. GlobalWorkspaceOrmManager
// needs no import -- it comes from an @Global() module.
@Module({
  imports: [
    TokenModule,
    WorkspaceCacheStorageModule,
    TypeOrmModule.forFeature([WorkspaceEntity]),
  ],
  controllers: [AuditLogController],
  providers: [
    AuditLogIngestService,
    AuditLogRetentionService,
    AuditLogRetentionJob,
    AuditLogRetentionCronJob,
    AuditLogRetentionCronCommand,
    AuditLogPruneCommand,
  ],
  exports: [AuditLogIngestService, AuditLogRetentionCronCommand],
})
export class AuditLogModule {}
