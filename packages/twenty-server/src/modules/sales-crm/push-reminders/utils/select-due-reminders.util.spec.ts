import {
  dispatchKey,
  isMissingReminderFieldError,
  selectDueReminders,
  type DueReminderCandidate,
} from 'src/modules/sales-crm/push-reminders/utils/select-due-reminders.util';

const candidate = (
  over: Partial<DueReminderCandidate> = {},
): DueReminderCandidate => ({
  id: 'task-1',
  title: 'Call back',
  assigneeId: 'member-1',
  remindAt: '2026-09-12T09:00:00.000Z',
  reminderDismissedAt: null,
  ...over,
});

describe('selectDueReminders', () => {
  it('keeps a live reminder and returns it with a Date remindAt', () => {
    const due = selectDueReminders([candidate()], new Set());

    expect(due).toHaveLength(1);
    expect(due[0].taskId).toBe('task-1');
    expect(due[0].remindAt.toISOString()).toBe('2026-09-12T09:00:00.000Z');
  });

  it('drops a reminder dismissed after its time but keeps one dismissed before (rescheduled)', () => {
    const due = selectDueReminders(
      [
        candidate({
          id: 'dismissed',
          reminderDismissedAt: '2026-09-12T09:05:00.000Z',
        }),
        candidate({
          id: 'stale-dismissal',
          reminderDismissedAt: '2026-09-11T09:05:00.000Z',
        }),
      ],
      new Set(),
    );

    expect(due.map((reminder) => reminder.taskId)).toEqual(['stale-dismissal']);
  });

  it('drops pairs already in the dispatch ledger, but a new remindAt for the same task re-arms', () => {
    const ledger = new Set([
      dispatchKey('task-1', new Date('2026-09-12T09:00:00.000Z')),
    ]);
    const due = selectDueReminders(
      [
        candidate(),
        candidate({ id: 'task-1', remindAt: '2026-09-12T10:00:00.000Z' }),
      ],
      ledger,
    );

    expect(due.map((reminder) => reminder.remindAt.toISOString())).toEqual([
      '2026-09-12T10:00:00.000Z',
    ]);
  });

  it('skips unassigned tasks and unparsable times, and sorts by remindAt', () => {
    const due = selectDueReminders(
      [
        candidate({ id: 'later', remindAt: '2026-09-12T09:30:00.000Z' }),
        candidate({ id: 'nobody', assigneeId: null }),
        candidate({ id: 'garbage', remindAt: 'not-a-date' }),
        candidate({
          id: 'earlier',
          remindAt: new Date('2026-09-12T08:30:00.000Z'),
        }),
      ],
      new Set(),
    );

    expect(due.map((reminder) => reminder.taskId)).toEqual([
      'earlier',
      'later',
    ]);
  });
});

describe('isMissingReminderFieldError', () => {
  it('recognises an unprovisioned workspace and nothing else', () => {
    expect(
      isMissingReminderFieldError(
        new Error('column task.remindAt does not exist'),
      ),
    ).toBe(true);
    expect(
      isMissingReminderFieldError(
        new Error('Unknown field "remindAt" on task'),
      ),
    ).toBe(true);
    expect(isMissingReminderFieldError(new Error('connection refused'))).toBe(
      false,
    );
  });
});
