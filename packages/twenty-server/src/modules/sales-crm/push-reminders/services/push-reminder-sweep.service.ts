import { Injectable, Logger } from '@nestjs/common';

import { Between, In } from 'typeorm';

import { SalesPushSubscriptionEntity } from 'src/engine/core-modules/sales-push/sales-push-subscription.entity';
import { SalesReminderDispatchEntity } from 'src/engine/core-modules/sales-push/sales-reminder-dispatch.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import {
  PUSH_REMINDER_LOOKBACK_MS,
  PUSH_REMINDER_MAX_TASKS_PER_SWEEP,
} from 'src/modules/sales-crm/push-reminders/constants/push-reminders.constant';
import {
  PushSenderService,
  type ReminderPushPayload,
} from 'src/modules/sales-crm/push-reminders/services/push-sender.service';
import {
  dispatchKey,
  isMissingReminderFieldError,
  selectDueReminders,
  type DueReminder,
  type DueReminderCandidate,
} from 'src/modules/sales-crm/push-reminders/utils/select-due-reminders.util';

export type SweepSummary = {
  due: number;
  sent: number;
  gone: number;
  failed: number;
};

type LeadRef = { id: string; name: string };

/**
 * One workspace's minute: find reminders whose time has come, push each to
 * the assignee's devices, and write the ledger row so the next minute does
 * not ring them again.
 *
 * The ledger row is written BEFORE the send. A crash between the two loses
 * one notification (the in-app bell still shows it); the other order would
 * turn any repeated failure into a notification every minute until someone
 * noticed.
 */
@Injectable()
export class PushReminderSweepService {
  private readonly logger = new Logger(PushReminderSweepService.name);

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly pushSenderService: PushSenderService,
    @InjectWorkspaceScopedRepository(SalesPushSubscriptionEntity)
    private readonly subscriptionRepository: WorkspaceScopedRepository<SalesPushSubscriptionEntity>,
    @InjectWorkspaceScopedRepository(SalesReminderDispatchEntity)
    private readonly dispatchRepository: WorkspaceScopedRepository<SalesReminderDispatchEntity>,
  ) {}

  async sweepWorkspace(
    workspaceId: string,
    now: Date = new Date(),
  ): Promise<SweepSummary> {
    const summary: SweepSummary = { due: 0, sent: 0, gone: 0, failed: 0 };

    if (!this.pushSenderService.isEnabled()) return summary;

    let candidates: DueReminderCandidate[];

    try {
      candidates = await this.findCandidates(workspaceId, now);
    } catch (error) {
      if (isMissingReminderFieldError(error)) {
        this.logger.debug(
          `Workspace ${workspaceId} has no task.remindAt; nothing to push.`,
        );

        return summary;
      }

      throw error;
    }

    if (candidates.length === 0) return summary;

    const dispatched = await this.dispatchRepository.find(workspaceId, {
      where: { taskId: In(candidates.map((candidate) => candidate.id)) },
    });
    const alreadyDispatched = new Set(
      dispatched.map((row) => dispatchKey(row.taskId, row.remindAt)),
    );

    const due = selectDueReminders(candidates, alreadyDispatched);

    summary.due = due.length;

    if (due.length === 0) return summary;

    const [leadByTask, subscriptions] = await Promise.all([
      this.findLeads(
        workspaceId,
        due.map((reminder) => reminder.taskId),
      ),
      this.subscriptionRepository.find(workspaceId, {
        where: {
          workspaceMemberId: In([
            ...new Set(due.map((reminder) => reminder.assigneeId)),
          ]),
        },
      }),
    ]);

    const subscriptionsByMember = new Map<
      string,
      SalesPushSubscriptionEntity[]
    >();

    for (const subscription of subscriptions) {
      const list =
        subscriptionsByMember.get(subscription.workspaceMemberId) ?? [];

      list.push(subscription);
      subscriptionsByMember.set(subscription.workspaceMemberId, list);
    }

    const gone = new Set<string>();

    for (const reminder of due) {
      await this.dispatchRepository.upsert(
        workspaceId,
        { taskId: reminder.taskId, remindAt: reminder.remindAt, sentAt: now },
        ['taskId', 'remindAt'],
      );

      const targets = subscriptionsByMember.get(reminder.assigneeId) ?? [];

      if (targets.length === 0) continue;

      const payload = this.buildPayload(
        reminder,
        leadByTask.get(reminder.taskId) ?? null,
      );

      for (const target of targets) {
        if (gone.has(target.id)) continue;

        const result = await this.pushSenderService.send(target, payload);

        summary[result] += 1;

        if (result === 'gone') gone.add(target.id);
      }
    }

    if (gone.size > 0) {
      await this.subscriptionRepository.delete(workspaceId, {
        id: In([...gone]),
      });
    }

    this.logger.log(
      `Workspace ${workspaceId}: ${summary.due} reminder(s) due, ${summary.sent} pushed, ${summary.gone} dead subscription(s) removed, ${summary.failed} failed`,
    );

    return summary;
  }

  private buildPayload(
    reminder: DueReminder,
    lead: LeadRef | null,
  ): ReminderPushPayload {
    return {
      kind: 'reminder',
      taskId: reminder.taskId,
      title: reminder.title,
      leadId: lead?.id ?? null,
      leadName: lead?.name ?? null,
      remindAt: reminder.remindAt.toISOString(),
      // The sales app is hash-routed under /sales/ on the API origin.
      url: lead
        ? `/sales/#/lead/${lead.id}`
        : `/sales/#/task/${reminder.taskId}`,
    };
  }

  private async findCandidates(
    workspaceId: string,
    now: Date,
  ): Promise<DueReminderCandidate[]> {
    const authContext = buildSystemAuthContext(workspaceId);
    const from = new Date(now.getTime() - PUSH_REMINDER_LOOKBACK_MS);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const taskRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            'task',
            { shouldBypassPermissionChecks: true },
          );

        const rows = (await taskRepository.find({
          select: [
            'id',
            'title',
            'assigneeId',
            'remindAt',
            'reminderDismissedAt',
          ],
          where: {
            status: In(['TODO', 'IN_PROGRESS']),
            remindAt: Between(from, now),
          },
          order: { remindAt: 'ASC' },
          take: PUSH_REMINDER_MAX_TASKS_PER_SWEEP,
          loadEagerRelations: false,
        } as never)) as unknown as DueReminderCandidate[];

        return rows;
      },
      authContext,
    );
  }

  // Two plain lookups rather than a relation load: the opportunity is the
  // lead, and a task with several targets takes the first opportunity.
  private async findLeads(
    workspaceId: string,
    taskIds: string[],
  ): Promise<Map<string, LeadRef>> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const targetRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            'taskTarget',
            { shouldBypassPermissionChecks: true },
          );
        const targets = (await targetRepository.find({
          select: ['taskId', 'targetOpportunityId'],
          where: { taskId: In(taskIds) },
          loadEagerRelations: false,
        } as never)) as unknown as {
          taskId: string;
          targetOpportunityId: string | null;
        }[];

        const opportunityIdByTask = new Map<string, string>();

        for (const target of targets) {
          if (
            target.targetOpportunityId &&
            !opportunityIdByTask.has(target.taskId)
          ) {
            opportunityIdByTask.set(target.taskId, target.targetOpportunityId);
          }
        }

        const leadByTask = new Map<string, LeadRef>();

        if (opportunityIdByTask.size === 0) return leadByTask;

        const opportunityRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            'opportunity',
            { shouldBypassPermissionChecks: true },
          );
        const opportunities = (await opportunityRepository.find({
          select: ['id', 'name'],
          where: { id: In([...new Set(opportunityIdByTask.values())]) },
          loadEagerRelations: false,
        } as never)) as unknown as LeadRef[];
        const nameById = new Map(
          opportunities.map((row) => [row.id, row.name]),
        );

        for (const [taskId, opportunityId] of opportunityIdByTask) {
          const name = nameById.get(opportunityId);

          if (name !== undefined)
            leadByTask.set(taskId, { id: opportunityId, name });
        }

        return leadByTask;
      },
      authContext,
    );
  }
}
