import { PushReminderSweepService } from 'src/modules/sales-crm/push-reminders/services/push-reminder-sweep.service';
import { type PushSenderService } from 'src/modules/sales-crm/push-reminders/services/push-sender.service';

const NOW = new Date('2026-09-12T09:01:00.000Z');

type Row = Record<string, unknown>;

const buildService = ({
  tasks,
  targets = [],
  opportunities = [],
  dispatched = [],
  subscriptions = [],
  sendResults = {},
  taskQueryError,
}: {
  tasks: Row[];
  targets?: Row[];
  opportunities?: Row[];
  dispatched?: Row[];
  subscriptions?: Row[];
  sendResults?: Record<string, 'sent' | 'gone' | 'failed'>;
  taskQueryError?: Error;
}) => {
  const repos: Record<string, { find: jest.Mock }> = {
    task: {
      find: jest.fn(async () => {
        if (taskQueryError) throw taskQueryError;

        return tasks;
      }),
    },
    taskTarget: { find: jest.fn(async () => targets) },
    opportunity: { find: jest.fn(async () => opportunities) },
  };
  const ormManager = {
    executeInWorkspaceContext: jest.fn(async (fn: () => Promise<unknown>) =>
      fn(),
    ),
    getRepository: jest.fn(
      async (_workspaceId: string, name: string) => repos[name],
    ),
  };
  const sender = {
    isEnabled: jest.fn(() => true),
    send: jest.fn(
      async (target: { endpoint: string }, _payload: unknown) =>
        sendResults[target.endpoint] ?? 'sent',
    ),
  };
  const subscriptionRepository = {
    find: jest.fn(async () => subscriptions),
    delete: jest.fn(async () => ({ affected: 1 })),
  };
  const dispatchRepository = {
    find: jest.fn(async () => dispatched),
    upsert: jest.fn(async () => undefined),
  };

  const service = new PushReminderSweepService(
    ormManager as never,
    sender as unknown as PushSenderService,
    subscriptionRepository as never,
    dispatchRepository as never,
  );

  return { service, repos, sender, subscriptionRepository, dispatchRepository };
};

const task = (over: Row = {}): Row => ({
  id: 'task-1',
  title: 'Call back',
  assigneeId: 'member-1',
  remindAt: new Date('2026-09-12T09:00:00.000Z'),
  reminderDismissedAt: null,
  ...over,
});

const subscription = (over: Row = {}): Row => ({
  id: 'sub-1',
  workspaceId: 'ws',
  workspaceMemberId: 'member-1',
  endpoint: 'https://push.example/a',
  p256dh: 'k',
  auth: 'a',
  ...over,
});

describe('PushReminderSweepService', () => {
  it('pushes a due reminder to every device of its assignee with the lead in the payload', async () => {
    const { service, sender, dispatchRepository } = buildService({
      tasks: [task()],
      targets: [{ taskId: 'task-1', targetOpportunityId: 'opp-1' }],
      opportunities: [{ id: 'opp-1', name: 'Noor Hospital' }],
      subscriptions: [
        subscription(),
        subscription({ id: 'sub-2', endpoint: 'https://push.example/b' }),
        subscription({
          id: 'other',
          workspaceMemberId: 'member-2',
          endpoint: 'https://push.example/c',
        }),
      ],
    });

    const summary = await service.sweepWorkspace('ws', NOW);

    expect(summary).toEqual({ due: 1, sent: 2, gone: 0, failed: 0 });
    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(sender.send.mock.calls[0][1]).toEqual({
      kind: 'reminder',
      taskId: 'task-1',
      title: 'Call back',
      leadId: 'opp-1',
      leadName: 'Noor Hospital',
      remindAt: '2026-09-12T09:00:00.000Z',
      url: '/sales/#/lead/opp-1',
    });
    expect(dispatchRepository.upsert).toHaveBeenCalledWith(
      'ws',
      expect.objectContaining({ taskId: 'task-1', sentAt: NOW }),
      ['taskId', 'remindAt'],
    );
  });

  it('records the ledger row even when the assignee has no devices, so it is not retried forever', async () => {
    const { service, sender, dispatchRepository } = buildService({
      tasks: [task()],
    });

    const summary = await service.sweepWorkspace('ws', NOW);

    expect(summary).toEqual({ due: 1, sent: 0, gone: 0, failed: 0 });
    expect(sender.send).not.toHaveBeenCalled();
    expect(dispatchRepository.upsert).toHaveBeenCalledTimes(1);
  });

  it('skips reminders already in the ledger and dismissed ones', async () => {
    const { service, sender } = buildService({
      tasks: [
        task(),
        task({
          id: 'task-2',
          reminderDismissedAt: new Date('2026-09-12T09:00:30.000Z'),
        }),
      ],
      dispatched: [
        { taskId: 'task-1', remindAt: new Date('2026-09-12T09:00:00.000Z') },
      ],
      subscriptions: [subscription()],
    });

    const summary = await service.sweepWorkspace('ws', NOW);

    expect(summary.due).toBe(0);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('deletes subscriptions the push service reports gone', async () => {
    const { service, subscriptionRepository } = buildService({
      tasks: [task()],
      subscriptions: [
        subscription(),
        subscription({ id: 'dead', endpoint: 'https://push.example/dead' }),
      ],
      sendResults: { 'https://push.example/dead': 'gone' },
    });

    const summary = await service.sweepWorkspace('ws', NOW);

    expect(summary).toEqual({ due: 1, sent: 1, gone: 1, failed: 0 });
    expect(subscriptionRepository.delete).toHaveBeenCalledWith('ws', {
      id: expect.objectContaining({ _value: ['dead'] }),
    });
  });

  it('treats a workspace without task.remindAt as having nothing to do', async () => {
    const { service, sender } = buildService({
      tasks: [],
      taskQueryError: new Error('column "remindAt" does not exist'),
    });

    await expect(service.sweepWorkspace('ws', NOW)).resolves.toEqual({
      due: 0,
      sent: 0,
      gone: 0,
      failed: 0,
    });
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('rethrows any other query failure', async () => {
    const { service } = buildService({
      tasks: [],
      taskQueryError: new Error('connection refused'),
    });

    await expect(service.sweepWorkspace('ws', NOW)).rejects.toThrow(
      'connection refused',
    );
  });

  it('does nothing when push is not configured', async () => {
    const { service, sender, repos } = buildService({ tasks: [task()] });

    sender.isEnabled.mockReturnValue(false);

    await service.sweepWorkspace('ws', NOW);

    expect(repos.task.find).not.toHaveBeenCalled();
  });
});
