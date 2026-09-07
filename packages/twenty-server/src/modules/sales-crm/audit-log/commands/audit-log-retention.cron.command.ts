import { Command, CommandRunner } from 'nest-commander';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { AUDIT_LOG_RETENTION_CRON_PATTERN } from 'src/modules/sales-crm/audit-log/constants/audit-log-retention.constant';
import { AuditLogRetentionCronJob } from 'src/modules/sales-crm/audit-log/crons/audit-log-retention.cron.job';

@Command({
  name: 'cron:sales:audit-log-retention',
  description: 'Starts a cron job to prune expired sales app audit events',
})
export class AuditLogRetentionCronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.messageQueueService.addCron<undefined>({
      jobName: AuditLogRetentionCronJob.name,
      data: undefined,
      options: {
        repeat: { pattern: AUDIT_LOG_RETENTION_CRON_PATTERN },
      },
    });
  }
}
