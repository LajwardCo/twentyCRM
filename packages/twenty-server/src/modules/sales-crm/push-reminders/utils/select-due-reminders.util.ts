export type DueReminderCandidate = {
  id: string;
  title: string;
  assigneeId: string | null;
  remindAt: Date | string;
  reminderDismissedAt: Date | string | null;
};

export type DueReminder = {
  taskId: string;
  title: string;
  assigneeId: string;
  remindAt: Date;
};

const toDate = (value: Date | string | null): Date | null => {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

export const dispatchKey = (taskId: string, remindAt: Date): string =>
  `${taskId}:${remindAt.toISOString()}`;

// The same rule the sales app applies in lib/reminders.ts: a reminder is
// live when its time has come and no dismissal is newer than that time (a
// dismissal from before a reschedule must not silence the new time). Tasks
// nobody is assigned to have nobody to ring. Anything already in the
// dispatch ledger for this exact remindAt was pushed on an earlier sweep.
export const selectDueReminders = (
  candidates: readonly DueReminderCandidate[],
  alreadyDispatched: ReadonlySet<string>,
): DueReminder[] => {
  const due: DueReminder[] = [];

  for (const candidate of candidates) {
    const remindAt = toDate(candidate.remindAt);

    if (remindAt === null || candidate.assigneeId === null) continue;

    const dismissedAt = toDate(candidate.reminderDismissedAt);

    if (dismissedAt !== null && dismissedAt >= remindAt) continue;
    if (alreadyDispatched.has(dispatchKey(candidate.id, remindAt))) continue;

    due.push({
      taskId: candidate.id,
      title: candidate.title,
      assigneeId: candidate.assigneeId,
      remindAt,
    });
  }

  return due.sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime());
};

// A workspace that never ran provision-reminders.mjs has no remindAt column.
// The sweep visits every active workspace, so on a shared instance this is
// the normal case, not a failure.
export const isMissingReminderFieldError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);

  return (
    /remindAt/i.test(message) &&
    /(does not exist|missing|unknown|not found|invalid)/i.test(message)
  );
};
