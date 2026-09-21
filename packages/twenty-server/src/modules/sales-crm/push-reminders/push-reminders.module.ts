import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TokenModule } from 'src/engine/core-modules/auth/token/token.module';
import { SalesPushSubscriptionEntity } from 'src/engine/core-modules/sales-push/sales-push-subscription.entity';
import { SalesReminderDispatchEntity } from 'src/engine/core-modules/sales-push/sales-reminder-dispatch.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';
import { PushReminderSweepCronCommand } from 'src/modules/sales-crm/push-reminders/commands/push-reminder-sweep.cron.command';
import { PushRemindersController } from 'src/modules/sales-crm/push-reminders/controllers/push-reminders.controller';
import { PushReminderSweepCronJob } from 'src/modules/sales-crm/push-reminders/crons/push-reminder-sweep.cron.job';
import { PushReminderSweepJob } from 'src/modules/sales-crm/push-reminders/jobs/push-reminder-sweep.job';
import { PushReminderSweepService } from 'src/modules/sales-crm/push-reminders/services/push-reminder-sweep.service';
import { PushSenderService } from 'src/modules/sales-crm/push-reminders/services/push-sender.service';
import { PushSubscriptionService } from 'src/modules/sales-crm/push-reminders/services/push-subscription.service';

// TokenModule and WorkspaceCacheStorageModule are what JwtAuthGuard and
// WorkspaceAuthGuard resolve their dependencies from (see AuditLogModule).
@Module({
  imports: [
    TokenModule,
    WorkspaceCacheStorageModule,
    TypeOrmModule.forFeature([
      WorkspaceEntity,
      SalesPushSubscriptionEntity,
      SalesReminderDispatchEntity,
    ]),
  ],
  controllers: [PushRemindersController],
  providers: [
    provideWorkspaceScopedRepository(SalesPushSubscriptionEntity),
    provideWorkspaceScopedRepository(SalesReminderDispatchEntity),
    PushSenderService,
    PushSubscriptionService,
    PushReminderSweepService,
    PushReminderSweepJob,
    PushReminderSweepCronJob,
    PushReminderSweepCronCommand,
  ],
  exports: [PushReminderSweepCronCommand],
})
export class PushRemindersModule {}
