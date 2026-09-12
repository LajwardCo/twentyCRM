import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

// Web Push for sales-app reminders: device subscriptions and the
// "already pushed" ledger. See docs/superpowers/specs/2026-09-12-push-reminders-design.md.
@RegisteredInstanceCommand('2.15.0', 1782100000000)
export class AddSalesPushTablesFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "core"."salesPushSubscription" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "workspaceMemberId" uuid NOT NULL,
        "endpoint" text NOT NULL,
        "p256dh" text NOT NULL,
        "auth" text NOT NULL,
        "userAgent" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "lastSeenAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_salesPushSubscription" PRIMARY KEY ("id"),
        CONSTRAINT "IDX_SALES_PUSH_SUBSCRIPTION_ENDPOINT_UNIQUE" UNIQUE ("endpoint"),
        CONSTRAINT "FK_salesPushSubscription_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "core"."workspace"("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_SALES_PUSH_SUBSCRIPTION_WORKSPACE_MEMBER"
        ON "core"."salesPushSubscription" ("workspaceId", "workspaceMemberId")`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "core"."salesReminderDispatch" (
        "taskId" uuid NOT NULL,
        "remindAt" timestamptz NOT NULL,
        "workspaceId" uuid NOT NULL,
        "sentAt" timestamptz NOT NULL,
        CONSTRAINT "PK_salesReminderDispatch" PRIMARY KEY ("taskId", "remindAt")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_SALES_REMINDER_DISPATCH_WORKSPACE_SENT_AT"
        ON "core"."salesReminderDispatch" ("workspaceId", "sentAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "core"."salesReminderDispatch"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "core"."salesPushSubscription"`,
    );
  }
}
