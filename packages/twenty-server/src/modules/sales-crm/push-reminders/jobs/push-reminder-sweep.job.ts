import { Injectable, Logger } from '@nestjs/common';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { PushReminderSweepService } from 'src/modules/sales-crm/push-reminders/services/push-reminder-sweep.service';

export type PushReminderSweepJobData = {
  workspaceId: string;
};

@Injectable()
@Processor(MessageQueue.workspaceQueue)
export class PushReminderSweepJob {
  private readonly logger = new Logger(PushReminderSweepJob.name);

  constructor(
    private readonly pushReminderSweepService: PushReminderSweepService,
  ) {}

  @Process(PushReminderSweepJob.name)
  async handle(data: PushReminderSweepJobData): Promise<void> {
    const { workspaceId } = data;

    try {
      await this.pushReminderSweepService.sweepWorkspace(workspaceId);
    } catch (error) {
      this.logger.error(
        `Push reminder sweep failed for workspace ${workspaceId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
