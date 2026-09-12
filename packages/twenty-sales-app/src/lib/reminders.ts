// Reminder semantics shared by the store, the Today card, the calendar and
// the editors. A reminder is a task with a remindAt; nothing here touches the
// network so every rule is unit-testable with a fixed clock.
//
// The two reminder fields are optional on the type because they are null on
// servers that predate provision-reminders.mjs (the record API answers an
// unknown selected field with null) -- undefined is treated as null.

export type ReminderTask = {
  id: string;
  title: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | null;
  dueAt: string | null;
  remindAt?: string | null;
  reminderDismissedAt?: string | null;
};

export type ReminderBuckets<TTask extends ReminderTask> = {
  fired: TTask[];
  upcomingToday: TTask[];
  later: TTask[];
};

const byRemindAt = <TTask extends ReminderTask>(a: TTask, b: TTask) =>
  (a.remindAt ?? '').localeCompare(b.remindAt ?? '');

const endOfLocalDay = (now: Date): Date => {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end;
};

const toMs = (iso: string | null | undefined): number | null => {
  if (iso === null || iso === undefined) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
};

// fired: due to alert and nobody has dealt with it yet. Done tasks never fire.
// A dismissal only counts if it happened after the remindAt: a snooze clears
// it anyway, but a dismissal left over from before a reschedule must not
// silence the new time.
export const classifyReminders = <TTask extends ReminderTask>(
  tasks: readonly TTask[],
  now: Date,
): ReminderBuckets<TTask> => {
  const fired: TTask[] = [];
  const upcomingToday: TTask[] = [];
  const later: TTask[] = [];
  const nowMs = now.getTime();
  const eodMs = endOfLocalDay(now).getTime();

  for (const task of tasks) {
    if (task.status === 'DONE') continue;
    const remindMs = toMs(task.remindAt);
    if (remindMs === null) continue;

    if (remindMs <= nowMs) {
      const dismissedMs = toMs(task.reminderDismissedAt);
      if (dismissedMs === null || dismissedMs < remindMs) fired.push(task);
      continue;
    }
    if (remindMs <= eodMs) upcomingToday.push(task);
    else later.push(task);
  }

  return {
    fired: fired.sort(byRemindAt),
    upcomingToday: upcomingToday.sort(byRemindAt),
    later: later.sort(byRemindAt),
  };
};

export type SnoozeKind = 'hour' | 'tomorrow';

export const snoozeTarget = (kind: SnoozeKind, now: Date): string => {
  if (kind === 'hour') return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return next.toISOString();
};

// When dueAt moves (calendar drag, editor), the reminder keeps its distance
// from it, and a moved reminder is a fresh promise -- any dismissal is gone.
export const shiftRemindAt = (
  task: Pick<ReminderTask, 'dueAt' | 'remindAt' | 'reminderDismissedAt'>,
  newDueIso: string,
): { remindAt: string | null; reminderDismissedAt: string | null } => {
  const remindMs = toMs(task.remindAt);
  if (remindMs === null) {
    return { remindAt: null, reminderDismissedAt: task.reminderDismissedAt ?? null };
  }
  const dueMs = toMs(task.dueAt);
  const offsetMs = dueMs === null ? 0 : dueMs - remindMs;
  return {
    remindAt: new Date(new Date(newDueIso).getTime() - offsetMs).toISOString(),
    reminderDismissedAt: null,
  };
};

export type ReminderPreset = 'none' | 'at' | '15m' | '1h' | '1d' | 'custom';

type OffsetPreset = Exclude<ReminderPreset, 'none' | 'custom'>;

const PRESET_OFFSET_MS: Record<OffsetPreset, number> = {
  at: 0,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

export const REMINDER_PRESETS: readonly ReminderPreset[] = [
  'none',
  'at',
  '15m',
  '1h',
  '1d',
  'custom',
];

export const offsetToRemindAt = (
  preset: ReminderPreset,
  dueIso: string | null,
): string | null => {
  if (preset === 'none' || preset === 'custom' || dueIso === null) return null;
  return new Date(new Date(dueIso).getTime() - PRESET_OFFSET_MS[preset]).toISOString();
};

export const presetFromRemindAt = (
  remindIso: string | null | undefined,
  dueIso: string | null,
): ReminderPreset => {
  const remindMs = toMs(remindIso);
  if (remindMs === null) return 'none';
  const dueMs = toMs(dueIso);
  if (dueMs === null) return 'custom';
  const offset = dueMs - remindMs;
  const match = (Object.keys(PRESET_OFFSET_MS) as OffsetPreset[]).find(
    (key) => PRESET_OFFSET_MS[key] === offset,
  );
  return match ?? 'custom';
};

// ---------- lead reference from task targets ----------

export type TaskLeadRef = { id: string | null; name: string };

type TaskWithTargets = {
  taskTargets?: {
    edges: {
      node: {
        opportunity: { id: string; name: string } | null;
        company: { id: string; name: string } | null;
      };
    }[];
  };
};

// The opportunity is the lead; a bare company target is only a name to show
// (no lead page to open), hence the null id.
export const taskLeadRef = (task: TaskWithTargets): TaskLeadRef | null => {
  const targets = task.taskTargets?.edges ?? [];
  for (const { node } of targets) {
    if (node.opportunity) return { id: node.opportunity.id, name: node.opportunity.name };
  }
  for (const { node } of targets) {
    if (node.company) return { id: null, name: node.company.name };
  }
  return null;
};
