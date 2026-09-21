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
import { PUSH_REMINDER_SWEEP_CRON_PATTERN } from 'src/modules/sales-crm/push-reminders/constants/push-reminders.constant';
import {
  PushReminderSweepJob,
  type PushReminderSweepJobData,
} from 'src/modules/sales-crm/push-reminders/jobs/push-reminder-sweep.job';
import { PushSenderService } from 'src/modules/sales-crm/push-reminders/services/push-sender.service';

@Injectable()
@Processor(MessageQueue.cronQueue)
export class PushReminderSweepCronJob {
  private readonly logger = new Logger(PushReminderSweepCronJob.name);

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    @InjectMessageQueue(MessageQueue.workspaceQueue)
    private readonly messageQueueService: MessageQueueService,
    private readonly exceptionHandlerService: ExceptionHandlerService,
    private readonly pushSenderService: PushSenderService,
  ) {}

  @Process(PushReminderSweepCronJob.name)
  @SentryCronMonitor(
    PushReminderSweepCronJob.name,
    PUSH_REMINDER_SWEEP_CRON_PATTERN,
  )
  async handle(): Promise<void> {
    // Without VAPID keys there is nothing any workspace could do; skip the
    // fan-out rather than enqueue a no-op per workspace every minute.
    if (!this.pushSenderService.isEnabled()) return;

    const workspaces = await this.workspaceRepository.find({
      where: { activationStatus: WorkspaceActivationStatus.ACTIVE },
      select: ['id'],
      order: { id: 'ASC' },
    });

    for (const workspace of workspaces) {
      try {
        await this.messageQueueService.add<PushReminderSweepJobData>(
          PushReminderSweepJob.name,
          { workspaceId: workspace.id },
        );
      } catch (error) {
        // One workspace failing to enqueue must not stop the rest.
        this.exceptionHandlerService.captureExceptions([error], {
          workspace: { id: workspace.id },
        });
      }
    }

    this.logger.debug(
      `Enqueued push reminder sweep for ${workspaces.length} workspace(s)`,
    );
  }
}
