import { Injectable, Logger } from '@nestjs/common';

import webPush, { WebPushError } from 'web-push';

import { PUSH_REMINDER_TTL_SECONDS } from 'src/modules/sales-crm/push-reminders/constants/push-reminders.constant';
import {
  resolvePushConfig,
  type PushConfig,
} from 'src/modules/sales-crm/push-reminders/utils/resolve-push-config.util';

export type PushTarget = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

// What the service worker receives. Data only -- the worker formats the
// time in the seller's calendar and locale, which the server does not know.
export type ReminderPushPayload = {
  kind: 'reminder';
  taskId: string;
  title: string;
  leadId: string | null;
  leadName: string | null;
  remindAt: string;
  url: string;
};

export type PushSendResult = 'sent' | 'gone' | 'failed';

// Thin wrapper over web-push so the sweep can be tested without the network
// and so VAPID details are set exactly once.
@Injectable()
export class PushSenderService {
  private readonly logger = new Logger(PushSenderService.name);
  private config: PushConfig | null = null;

  getConfig(): PushConfig {
    if (this.config === null) {
      this.config = resolvePushConfig(process.env);

      if (this.config.enabled) {
        webPush.setVapidDetails(
          this.config.subject,
          this.config.publicKey,
          this.config.privateKey,
        );
      } else {
        this.logger.warn(`Web push disabled: ${this.config.reason}`);
      }
    }

    return this.config;
  }

  isEnabled(): boolean {
    return this.getConfig().enabled;
  }

  async send(
    target: PushTarget,
    payload: ReminderPushPayload,
  ): Promise<PushSendResult> {
    if (!this.isEnabled()) return 'failed';

    try {
      await webPush.sendNotification(
        {
          endpoint: target.endpoint,
          keys: { p256dh: target.p256dh, auth: target.auth },
        },
        JSON.stringify(payload),
        { TTL: PUSH_REMINDER_TTL_SECONDS, urgency: 'high' },
      );

      return 'sent';
    } catch (error) {
      // 404/410 is the push service saying the subscription no longer
      // exists (browser data cleared, permission revoked): drop it, do not
      // keep trying every minute forever.
      if (
        error instanceof WebPushError &&
        (error.statusCode === 404 || error.statusCode === 410)
      ) {
        return 'gone';
      }

      this.logger.warn(
        `Push to ${target.endpoint.slice(0, 60)}… failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return 'failed';
    }
  }
}
