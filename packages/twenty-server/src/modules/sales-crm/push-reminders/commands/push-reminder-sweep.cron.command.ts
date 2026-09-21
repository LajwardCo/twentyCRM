import { Command, CommandRunner } from 'nest-commander';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { PUSH_REMINDER_SWEEP_CRON_PATTERN } from 'src/modules/sales-crm/push-reminders/constants/push-reminders.constant';
import { PushReminderSweepCronJob } from 'src/modules/sales-crm/push-reminders/crons/push-reminder-sweep.cron.job';

@Command({
  name: 'cron:sales:push-reminder-sweep',
  description:
    'Starts the every-minute cron that pushes due sales-app reminders to subscribed devices',
})
export class PushReminderSweepCronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.messageQueueService.addCron<undefined>({
      jobName: PushReminderSweepCronJob.name,
      data: undefined,
      options: {
        repeat: { pattern: PUSH_REMINDER_SWEEP_CRON_PATTERN },
      },
    });
  }
}
