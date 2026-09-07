import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { Repository } from 'typeorm';

import { SentryCronMonitor } from 'src/engine/core-modules/cron/sentry-cron-monitor.decorator';
import { ExceptionHandlerService } from 'src/engine/core-modules/exception-handler/exception-handler.service';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AUDIT_LOG_RETENTION_CRON_PATTERN } from 'src/modules/sales-crm/audit-log/constants/audit-log-retention.constant';
import {
  AuditLogRetentionJob,
  type AuditLogRetentionJobData,
} from 'src/modules/sales-crm/audit-log/jobs/audit-log-retention.job';

@Injectable()
@Processor(MessageQueue.cronQueue)
export class AuditLogRetentionCronJob {
  private readonly logger = new Logger(AuditLogRetentionCronJob.name);

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    @InjectMessageQueue(MessageQueue.workspaceQueue)
    private readonly messageQueueService: MessageQueueService,
    private readonly exceptionHandlerService: ExceptionHandlerService,
  ) {}

  @Process(AuditLogRetentionCronJob.name)
  @SentryCronMonitor(
    AuditLogRetentionCronJob.name,
    AUDIT_LOG_RETENTION_CRON_PATTERN,
  )
  async handle(): Promise<void> {
    const workspaces = await this.workspaceRepository.find({
      where: { activationStatus: WorkspaceActivationStatus.ACTIVE },
      select: ['id'],
      order: { id: 'ASC' },
    });

    if (workspaces.length === 0) {
      this.logger.log('No active workspaces found for audit log retention');

      return;
    }

    for (const workspace of workspaces) {
      try {
        await this.messageQueueService.add<AuditLogRetentionJobData>(
          AuditLogRetentionJob.name,
          { workspaceId: workspace.id },
        );
      } catch (error) {
        // One workspace failing to enqueue must not stop the rest.
        this.exceptionHandlerService.captureExceptions([error], {
          workspace: { id: workspace.id },
        });
      }
    }

    this.logger.log(
      `Enqueued audit log retention for ${workspaces.length} workspace(s)`,
    );
  }
}
