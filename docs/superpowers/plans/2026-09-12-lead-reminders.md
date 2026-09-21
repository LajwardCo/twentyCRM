# Lead Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sellers set a reminder on a lead (or any task), get told in-app (bell, badge, Today card, browser notification) when it fires, and see it on the Calendar; snooze / dismiss / done sync across devices.

**Architecture:** A reminder is a `task` with two new DATE_TIME fields (`remindAt`, `reminderDismissedAt`) and a new `REMINDER` task type. Pure classification/snooze logic lives in `lib/reminders.ts`; a module-level polling store (`lib/reminderStore.ts`) feeds the Shell bell, the Today card and browser notifications from one list. Writes are gated by a `/metadata` probe so the UI ships before the provisioner runs.

**Tech Stack:** React 19, Vite, vitest, Twenty record GraphQL API (`coreQuery`), Twenty metadata API (`metadataQuery`), plain CSS (`styles.css`), Persian strings in `lib/strings.ts`.

Spec: `docs/superpowers/specs/2026-09-12-lead-reminders-design.md`.
Work in the worktree `.worktrees/feat-reminders`, branch `feat/sales-app-reminders`.
All commands below run from `packages/twenty-sales-app` inside that worktree.

Conventions that matter here:
- Named exports, functional components, `//` comments explaining WHY.
- Shared files (`TodayView`, `TaskView`, `styles.css`, `strings.ts`) are being edited by another agent: only append blocks or insert single lines.
- Persian UI strings go in a new `T_REMIND` object appended to `src/lib/strings.ts`.
- Dates from `JalaliDatePicker` are local `"yyyy-mm-ddThh:mm"` strings; the API wants ISO instants (`new Date(local).toISOString()`).

---

## File map

| file | responsibility |
|---|---|
| `tools/sales-crm/provision-reminders.mjs` | create the two fields, add the `REMINDER` option (idempotent) |
| `src/lib/reminders.ts` (+test) | pure: `classifyReminders`, `snoozeTarget`, `shiftRemindAt`, presets |
| `src/lib/reminderStore.ts` (+test) | polling store + `useReminders()` + browser notification |
| `src/api/remindersSupport.ts` (+test) | `isRemindersProvisioned()` metadata probe |
| `src/api/reminders.ts` | `fetchMyReminders`, `dismissReminder`, `snoozeReminder`, `completeReminder` |
| `src/api/records.ts` | `Task` fields, selections, mutation inputs, DONE side effect |
| `src/components/ReminderField.tsx` | preset picker bound to a dueAt, emits `remindAt` |
| `src/components/ReminderModal.tsx` | "remind me about this lead" sheet |
| `src/components/ReminderRow.tsx` | one reminder row with done/snooze/dismiss (shared by card + sheet) |
| `src/components/RemindersCard.tsx` | Today card |
| `src/components/RemindersSheet.tsx` | bell sheet |
| `src/components/Shell.tsx`, `MobileMenu.tsx` | bell entry points |
| `src/components/QuickTaskModal.tsx` | `ReminderField` row |
| `src/views/LeadDetailView.tsx`, `CalendarView.tsx`, `TodayView.tsx`, `TaskView.tsx` | hooks (few lines each) |
| `src/lib/strings.ts`, `src/styles.css` | appended blocks |

---

### Task 1: Pure reminder logic (`lib/reminders.ts`)

**Files:**
- Create: `src/lib/reminders.ts`
- Test: `src/lib/reminders.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';

import {
  classifyReminders,
  offsetToRemindAt,
  presetFromRemindAt,
  shiftRemindAt,
  snoozeTarget,
  type ReminderTask,
} from './reminders';

const at = (iso: string) => new Date(iso);

const task = (over: Partial<ReminderTask>): ReminderTask => ({
  id: 'a',
  title: 't',
  status: 'TODO',
  dueAt: '2026-09-12T10:00:00.000Z',
  remindAt: '2026-09-12T09:00:00.000Z',
  reminderDismissedAt: null,
  ...over,
});

describe('classifyReminders', () => {
  const now = at('2026-09-12T09:30:00.000Z');

  it('fires a reminder whose remindAt has passed and is not dismissed', () => {
    const { fired } = classifyReminders([task({})], now);
    expect(fired.map((t) => t.id)).toEqual(['a']);
  });

  it('does not fire a dismissed or done reminder', () => {
    const { fired, upcomingToday } = classifyReminders(
      [
        task({ id: 'd', reminderDismissedAt: '2026-09-12T09:05:00.000Z' }),
        task({ id: 'x', status: 'DONE' }),
      ],
      now,
    );
    expect(fired).toEqual([]);
    expect(upcomingToday).toEqual([]);
  });

  it('puts a later reminder today under upcomingToday and tomorrow under later', () => {
    const { upcomingToday, later } = classifyReminders(
      [
        task({ id: 'u', remindAt: '2026-09-12T15:00:00.000Z' }),
        task({ id: 'l', remindAt: '2026-09-13T15:00:00.000Z' }),
      ],
      now,
    );
    expect(upcomingToday.map((t) => t.id)).toEqual(['u']);
    expect(later.map((t) => t.id)).toEqual(['l']);
  });

  it('ignores tasks with no remindAt and sorts fired by remindAt ascending', () => {
    const { fired } = classifyReminders(
      [
        task({ id: 'b', remindAt: '2026-09-12T09:20:00.000Z' }),
        task({ id: 'n', remindAt: null }),
        task({ id: 'a', remindAt: '2026-09-12T08:00:00.000Z' }),
      ],
      now,
    );
    expect(fired.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('snoozeTarget', () => {
  it('one hour later is exactly now + 60 minutes', () => {
    const now = at('2026-09-12T09:30:00.000Z');
    expect(snoozeTarget('hour', now)).toBe('2026-09-12T10:30:00.000Z');
  });

  it('tomorrow morning lands on 09:00 local the next day', () => {
    const now = new Date(2026, 8, 12, 23, 40);
    const next = new Date(snoozeTarget('tomorrow', now));
    expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2026, 8, 13]);
    expect([next.getHours(), next.getMinutes()]).toEqual([9, 0]);
  });
});

describe('shiftRemindAt', () => {
  it('keeps the offset between dueAt and remindAt when dueAt moves', () => {
    const shifted = shiftRemindAt(task({}), '2026-09-15T10:00:00.000Z');
    expect(shifted.remindAt).toBe('2026-09-15T09:00:00.000Z');
    expect(shifted.reminderDismissedAt).toBeNull();
  });

  it('leaves a task without a reminder alone', () => {
    const shifted = shiftRemindAt(task({ remindAt: null }), '2026-09-15T10:00:00.000Z');
    expect(shifted.remindAt).toBeNull();
  });
});

describe('presets', () => {
  const due = '2026-09-12T10:00:00.000Z';

  it('offsetToRemindAt subtracts the preset from dueAt', () => {
    expect(offsetToRemindAt('at', due)).toBe(due);
    expect(offsetToRemindAt('15m', due)).toBe('2026-09-12T09:45:00.000Z');
    expect(offsetToRemindAt('1h', due)).toBe('2026-09-12T09:00:00.000Z');
    expect(offsetToRemindAt('1d', due)).toBe('2026-09-11T10:00:00.000Z');
    expect(offsetToRemindAt('none', due)).toBeNull();
  });

  it('presetFromRemindAt recognises exact offsets and falls back to custom', () => {
    expect(presetFromRemindAt(null, due)).toBe('none');
    expect(presetFromRemindAt(due, due)).toBe('at');
    expect(presetFromRemindAt('2026-09-12T09:00:00.000Z', due)).toBe('1h');
    expect(presetFromRemindAt('2026-09-12T08:37:00.000Z', due)).toBe('custom');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/reminders.test.ts`
Expected: FAIL — cannot resolve `./reminders`.

- [ ] **Step 3: Implement**

```ts
// Reminder semantics shared by the store, the Today card, the calendar and
// the editors. A reminder is a task with a remindAt; nothing here touches the
// network so every rule is unit-testable with a fixed clock.

export type ReminderTask = {
  id: string;
  title: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | null;
  dueAt: string | null;
  remindAt: string | null;
  reminderDismissedAt: string | null;
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

// fired: due to alert and nobody has dealt with it yet. Done tasks never
// fire, and a dismissal only counts if it happened after the remindAt (a
// snooze clears it anyway, but a stale dismissal from before a reschedule
// must not silence the new time).
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
    if (task.remindAt === null || task.status === 'DONE') continue;
    const remindMs = new Date(task.remindAt).getTime();
    if (Number.isNaN(remindMs)) continue;

    if (remindMs <= nowMs) {
      const dismissedMs = task.reminderDismissedAt
        ? new Date(task.reminderDismissedAt).getTime()
        : null;
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

// When dueAt moves (calendar drag), the reminder keeps its distance from it.
export const shiftRemindAt = <TTask extends ReminderTask>(
  task: TTask,
  newDueIso: string,
): Pick<ReminderTask, 'remindAt' | 'reminderDismissedAt'> => {
  if (task.remindAt === null || task.dueAt === null) {
    return { remindAt: task.remindAt, reminderDismissedAt: task.reminderDismissedAt };
  }
  const offsetMs = new Date(task.dueAt).getTime() - new Date(task.remindAt).getTime();
  return {
    remindAt: new Date(new Date(newDueIso).getTime() - offsetMs).toISOString(),
    reminderDismissedAt: null,
  };
};

export type ReminderPreset = 'none' | 'at' | '15m' | '1h' | '1d' | 'custom';

const PRESET_OFFSET_MS: Record<Exclude<ReminderPreset, 'none' | 'custom'>, number> = {
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
  remindIso: string | null,
  dueIso: string | null,
): ReminderPreset => {
  if (remindIso === null) return 'none';
  if (dueIso === null) return 'custom';
  const offset = new Date(dueIso).getTime() - new Date(remindIso).getTime();
  const match = (Object.keys(PRESET_OFFSET_MS) as (keyof typeof PRESET_OFFSET_MS)[]).find(
    (key) => PRESET_OFFSET_MS[key] === offset,
  );
  return match ?? 'custom';
};
```

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/reminders.test.ts` → PASS (10 tests).

- [ ] **Step 5: Commit** — `git add src/lib/reminders.ts src/lib/reminders.test.ts && git commit -m "feat(sales-app): reminder classification and snooze logic"`

---

### Task 2: Data layer — `records.ts` fields, provisioning probe, reminder API

**Files:**
- Modify: `src/api/records.ts` (`Task` type; selections in `fetchLeadTasks`, `OPEN_TASKS_PAGE_QUERY`, `fetchTasksForCalendar`, `fetchTask`; inputs of `createTaskForLead`, `createQuickTask`; `setTaskStatus`)
- Create: `src/api/remindersSupport.ts`, `src/api/remindersSupport.test.ts`
- Create: `src/api/reminders.ts`

- [ ] **Step 1: `Task` type + selections**

Add to `Task` after `dueAt`:
```ts
  // Null on servers that predate provision-reminders.mjs; the record API
  // answers an unknown selected field with null, so reads are always safe.
  remindAt?: string | null;
  reminderDismissedAt?: string | null;
```
Add `remindAt` and `reminderDismissedAt` lines directly under every `dueAt` selection in the four task queries. Add `TaskType` value `'REMINDER'`.

- [ ] **Step 2: Mutation inputs**

`createTaskForLead` and `createQuickTask` inputs gain `remindAt?: string | null` and pass `...(input.remindAt !== undefined ? { remindAt: input.remindAt } : {})` — undefined must be omitted so an unprovisioned server never sees the key.

`setTaskStatus(taskId, status, options?: { dismissReminder?: boolean })`: when `status === 'DONE'` and `options?.dismissReminder`, send `reminderDismissedAt: new Date().toISOString()` alongside. Existing callers stay unchanged; the reminder actions pass the flag (they only run when provisioned).

- [ ] **Step 3: Probe test**

`src/api/remindersSupport.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const metadataQuery = vi.fn();
vi.mock('./client', () => ({ metadataQuery: (...args: unknown[]) => metadataQuery(...args) }));

const objects = (fields: string[]) => ({
  objects: {
    edges: [
      { node: { nameSingular: 'task', fields: { edges: fields.map((name) => ({ node: { name } })) } } },
    ],
  },
});

describe('isRemindersProvisioned', () => {
  afterEach(() => {
    vi.resetModules();
    metadataQuery.mockReset();
  });

  it('is true when task.remindAt exists and caches the answer', async () => {
    metadataQuery.mockResolvedValueOnce(objects(['dueAt', 'remindAt']));
    const { isRemindersProvisioned } = await import('./remindersSupport');
    expect(await isRemindersProvisioned()).toBe(true);
    expect(await isRemindersProvisioned()).toBe(true);
    expect(metadataQuery).toHaveBeenCalledTimes(1);
  });

  it('is false when the field is missing', async () => {
    metadataQuery.mockResolvedValueOnce(objects(['dueAt']));
    const { isRemindersProvisioned } = await import('./remindersSupport');
    expect(await isRemindersProvisioned()).toBe(false);
  });

  it('does not cache a failed probe', async () => {
    metadataQuery.mockRejectedValueOnce(new Error('offline'));
    metadataQuery.mockResolvedValueOnce(objects(['remindAt']));
    const { isRemindersProvisioned } = await import('./remindersSupport');
    expect(await isRemindersProvisioned()).toBe(false);
    expect(await isRemindersProvisioned()).toBe(true);
  });
});
```

- [ ] **Step 4: Probe implementation** — copy `phoneAppsSupport.ts`, object `task`, field `remindAt`, export `isRemindersProvisioned`. Also export a `useRemindersProvisioned(): boolean | null` hook (`useState(null)` + `useEffect` calling the probe) so components can gate rendering.

- [ ] **Step 5: `src/api/reminders.ts`**

```ts
export const fetchMyReminders = async (assigneeId: string): Promise<Task[]>
```
`coreQuery` on `tasks` with the same selection as `OPEN_TASKS_PAGE_QUERY` (copy it, don't export the private constant), `first: 200`, `orderBy: [{ remindAt: AscNullsLast }]`, filter
`{ and: [{ assigneeId: { eq } }, { status: { in: ['TODO','IN_PROGRESS'] } }, { remindAt: { is: 'NOT_NULL' } }, { remindAt: { lte: <end of tomorrow ISO> } }] }`.
Window is end of tomorrow (`endOfTomorrow()` from `lib/format`) so "upcoming today" is complete and the badge never needs more.

```ts
export const dismissReminder = (taskId: string) =>
  updateTask(taskId, { reminderDismissedAt: new Date().toISOString() });
export const snoozeReminder = (taskId: string, remindAtIso: string) =>
  updateTask(taskId, { remindAt: remindAtIso, reminderDismissedAt: null });
export const completeReminder = (taskId: string) =>
  setTaskStatus(taskId, 'DONE', { dismissReminder: true });
```

- [ ] **Step 6: Run** `npx vitest run src/api/remindersSupport.test.ts src/api/records.test.ts` and `npx tsc --noEmit` → PASS.

- [ ] **Step 7: Commit** — `feat(sales-app): reminder fields on tasks, provisioning probe and reminder API`

---

### Task 3: Provisioner

**Files:**
- Create: `tools/sales-crm/provision-reminders.mjs`

- [ ] **Step 1:** Copy the header/auth/gql helpers from `tools/sales-crm/provision-partner-type-other.mjs`. `main()`:
  1. Fetch objects with `fields { id name type options }`; find `task`.
  2. If no `remindAt`: `createOneField` `{ objectMetadataId, name: 'remindAt', label: 'Remind At', type: 'DATE_TIME', icon: 'IconBell', description: 'When the assignee should be notified about this task' }`.
  3. If no `reminderDismissedAt`: same with label 'Reminder Dismissed At', icon `IconBellOff`.
  4. If `taskType.options` lacks `REMINDER`: `updateOneField` with existing options (id/value/label/position/color) + `{ value: 'REMINDER', label: 'یادآوری', position: existing.length, color: 'yellow' }`.
  Each step logs `-> ...` or `already present — skipping`.

- [ ] **Step 2:** `node --check tools/sales-crm/provision-reminders.mjs` → no output.

- [ ] **Step 3: Commit** — `feat(sales-crm): provision task reminder fields`

---

### Task 4: Reminder store + browser notification

**Files:**
- Create: `src/lib/reminderStore.ts`, `src/lib/reminderStore.test.ts`

- [ ] **Step 1: Tests (fake timers, mocked API)**

Mock `../api/reminders` (`fetchMyReminders`, `dismissReminder`, `snoozeReminder`, `completeReminder`) and `../lib/router` (`navigate`). Cases:
- `startReminderStore('me')` fetches once immediately and again after 60 s (`vi.advanceTimersByTimeAsync(60_000)`).
- A task whose `remindAt` is 20 s in the future is `upcomingToday` at start and `fired` after `advanceTimersByTimeAsync(30_000)` with no extra fetch.
- With `globalThis.Notification` stubbed (`permission = 'granted'`, constructor spy), crossing into fired constructs exactly one notification for that id even after further ticks and refetches.
- `dismiss(id)` removes the row synchronously; when the mocked `dismissReminder` rejects, the row is back and `lastError` is set.
- `stopReminderStore()` clears timers (no fetch after a further 60 s).

- [ ] **Step 2: Implementation**

```ts
type ReminderState = {
  tasks: Task[];
  fired: Task[];
  upcomingToday: Task[];
  loaded: boolean;
  lastError: string | null;
};
export const startReminderStore = (assigneeId: string): void;
export const stopReminderStore = (): void;
export const refreshReminders = (): Promise<void>;
export const dismissReminderOptimistic = (taskId: string): Promise<void>;
export const snoozeReminderOptimistic = (taskId: string, kind: SnoozeKind): Promise<void>;
export const completeReminderOptimistic = (taskId: string): Promise<void>;
export const useReminders = (): ReminderState;   // useSyncExternalStore
```
Internals: module-level `tasks`, `notified: Set<string>`, listener set, `pollTimer` (60 s, only when `document.visibilityState === 'visible'`), `tickTimer` (30 s reclassify), `visibilitychange` + `focus` → `refreshReminders()`. `notify(task)` guarded by `typeof Notification !== 'undefined' && Notification.permission === 'granted'`; body = lead name (from `taskTargets`) + `formatJalaliDateTime(remindAt)`; `onclick` → `window.focus(); navigate(lead ? '/lead/'+id : '/task/'+id)`. Optimistic actions: mutate local `tasks` first, call the API, on failure restore the previous array and set `lastError`; on success `invalidateCache('today:')`, `invalidateCache('calendar:')`.

Also export `requestNotificationPermission(): Promise<void>` — no-op unless `Notification` exists and `permission === 'default'`.

- [ ] **Step 3:** `npx vitest run src/lib/reminderStore.test.ts` → PASS. **Commit** — `feat(sales-app): polling reminder store with browser notifications`

---

### Task 5: Strings, styles, `ReminderField`, `ReminderRow`

**Files:**
- Modify: `src/lib/strings.ts` (append `T_REMIND`; add `REMINDER: 'یادآوری'` to `TASK_TYPE_LABELS`)
- Modify: `src/styles.css` (append `/* ---- reminders ---- */`)
- Create: `src/components/ReminderField.tsx`, `src/components/ReminderRow.tsx`

- [ ] **Step 1: `T_REMIND`** (append at end of `strings.ts`):

```ts
// ---- reminders ----
export const T_REMIND = {
  reminder: 'یادآوری',
  reminders: 'یادآوری‌ها',
  setReminder: 'یادآوری بگذار',
  notifyMe: 'به من یادآوری کن',
  presetNone: 'بدون یادآوری',
  presetAt: 'در همان زمان',
  preset15m: '۱۵ دقیقه قبل',
  preset1h: '۱ ساعت قبل',
  preset1d: '۱ روز قبل',
  presetCustom: 'زمان دیگر',
  remindAtLbl: 'زمان یادآوری',
  titleLbl: 'موضوع',
  whenLbl: 'موعد',
  noteLbl: 'یادداشت (اختیاری)',
  defaultTitle: (leadName: string) => `پیگیری ${leadName}`,
  saved: 'یادآوری ثبت شد ✓',
  saveFailed: 'ثبت یادآوری ناموفق بود',
  save: 'ثبت یادآوری',
  saving: 'در حال ثبت…',
  firedHeading: 'یادآوری‌های رسیده',
  upcomingHeading: 'امروز بعداً',
  empty: 'یادآوری فعالی ندارید',
  done: 'انجام شد',
  snooze: 'تعویق',
  snoozeHour: '۱ ساعت بعد',
  snoozeTomorrow: 'فردا ۹ صبح',
  dismiss: 'رد',
  allReminders: 'همه کارها',
  bellAria: 'یادآوری‌ها',
  remindPrefix: 'یادآوری:',
  actionFailed: 'انجام نشد؛ دوباره تلاش کنید',
};
```

- [ ] **Step 2: CSS** — `.rem-badge` (absolute top-right red dot with count on `.icon-btn`), `.rem-row` (flex row like `.task`), `.rem-actions` (three small buttons), `.rem-chip` (small bell + time, `color: var(--gold-700)` or existing warm token — check `styles.css` tokens before picking), `.rem-sheet` reuses the QuickTaskModal sheet inline styles converted to a class. Keep it under 60 lines.

- [ ] **Step 3: `ReminderField`**

```tsx
type ReminderFieldProps = {
  dueLocal: string;                 // "yyyy-mm-ddThh:mm" from the parent's picker
  remindAt: string | null;          // ISO or null
  onChange: (remindAt: string | null) => void;
  id?: string;
};
```
Renders `<select>` of `REMINDER_PRESETS` with `T_REMIND.preset*` labels; `value` derived by `presetFromRemindAt(remindAt, dueIso)`; choosing a fixed preset emits `offsetToRemindAt(preset, dueIso)`; `custom` shows a `JalaliDatePicker withTime` bound to `toLocalInputValue(new Date(remindAt ?? dueIso))` and emits its ISO. When `dueLocal` changes and the preset is a fixed offset, the parent re-derives (the field is controlled; parent calls `offsetToRemindAt` again — provide a helper `rederiveRemindAt(prevRemindAt, prevDueIso, nextDueIso)` in `lib/reminders.ts` that keeps the offset: it is exactly `shiftRemindAt`, reuse it).

- [ ] **Step 4: `ReminderRow`**

```tsx
type ReminderRowProps = {
  task: Task;
  onDone: () => void;
  onSnooze: (kind: SnoozeKind) => void;
  onDismiss: () => void;
};
```
Lead chip (reuse the `taskLead` walk over `taskTargets` — move that helper into `lib/reminders.ts` as `taskLeadRef(task)` since three views duplicate it), title (tap → `/task/:id`), `relativeDueLabel(task.remindAt)`, three buttons; snooze is a two-option inline toggle (`hour` / `tomorrow`) rather than a menu — simpler on mobile.

- [ ] **Step 5:** `npx tsc --noEmit` → PASS. **Commit** — `feat(sales-app): reminder strings, styles, preset field and row`

---

### Task 6: Today card + Shell bell + sheet

**Files:**
- Create: `src/components/RemindersCard.tsx`, `src/components/RemindersSheet.tsx`
- Modify: `src/components/Shell.tsx`, `src/components/MobileMenu.tsx`, `src/views/TodayView.tsx`

- [ ] **Step 1: `RemindersCard`** — `useRemindersProvisioned()`; returns null when not provisioned or `fired.length + upcomingToday.length === 0`. Card with `<h3>` `T_REMIND.reminders` and badge count, `firedHeading` section of `ReminderRow`s wired to the optimistic store actions, `upcomingHeading` section of compact rows (title + time). Shows `lastError` as `error-banner`.

- [ ] **Step 2: `RemindersSheet`** — bottom sheet (`ModalSheet` if its API fits; otherwise the QuickTaskModal overlay pattern) listing the same, plus an `allReminders` button → `/tasks`.

- [ ] **Step 3: `Shell.tsx`** — `startReminderStore(user.workspaceMemberId)` in a `useEffect` (cleanup `stopReminderStore`), `const { fired } = useReminders()`, `const provisioned = useRemindersProvisioned()`, a bell `icon-btn` before the search button with `.rem-badge` when `fired.length > 0`, `sheetOpen` state → `<RemindersSheet onClose>`; hidden entirely when `provisioned !== true`.

- [ ] **Step 4: `MobileMenu.tsx`** — add a bell button to `.msheet-tools` calling a new `onOpenReminders` prop (Shell passes `() => setSheetOpen(true)`); render the same badge count.

- [ ] **Step 5: `TodayView.tsx`** — `import { RemindersCard } from '../components/RemindersCard';` and `<RemindersCard />` as the first child of the main column (just above the tasks card). One import, one line.

- [ ] **Step 6:** `npx tsc --noEmit` → PASS. **Commit** — `feat(sales-app): reminders on the dashboard and a shell bell with badge`

---

### Task 7: Setting reminders — `ReminderModal`, lead detail, `QuickTaskModal`, `TaskView`

**Files:**
- Create: `src/components/ReminderModal.tsx`
- Modify: `src/views/LeadDetailView.tsx`, `src/components/QuickTaskModal.tsx`, `src/views/TaskView.tsx`

- [ ] **Step 1: `ReminderModal`**

```tsx
type ReminderModalProps = {
  lead: { id: string; name: string; company: { id: string } | null };
  assigneeId: string;
  onClose: () => void;
  onSaved: () => void;
};
```
State: `title` (default `T_REMIND.defaultTitle(lead.name)`), `dueLocal` (tomorrow 09:00 via `toLocalInputValue`), `remindAt` (default `offsetToRemindAt('at', dueIso)`), `note`. On due change: `setRemindAt(shiftRemindAt({dueAt: prevDueIso, remindAt, reminderDismissedAt: null,...}, nextDueIso).remindAt)`. Save: `await requestNotificationPermission()` (first, so the prompt is tied to a tap), `createTaskForLead({ title, status: 'TODO', taskType: 'REMINDER', dueAt, remindAt, bodyMarkdown: note || undefined, assigneeId, target })`, `invalidateCache('today:')`, `invalidateCache('calendar:')`, `void refreshReminders()`, `onSaved()`.

- [ ] **Step 2: `LeadDetailView.tsx`** — `const remindersProvisioned = useRemindersProvisioned();` `const [showReminder, setShowReminder] = useState(false);`; push a `barActions` entry `{ key: 'remind', label: T_REMIND.reminder, icon: IconBell, disabled: remindersProvisioned !== true, onClick: () => setShowReminder(true) }` after `email`; add a `btn line sm` with `IconBell` next to `＋ پیگیری` (only when provisioned); render `{showReminder && <ReminderModal lead={lead} assigneeId={user.workspaceMemberId} onClose=... onSaved={() => { setShowReminder(false); showToast(T_REMIND.saved); void reload(); }} />}` next to the existing modals. In the open-tasks card, after the due span add `{task.remindAt && <span className="rem-chip"><IconBell size={11} /> {relativeDueLabel(task.remindAt)}</span>}`.

- [ ] **Step 3: `QuickTaskModal.tsx`** — state `remindAt` (initial from `props.task.remindAt` in edit mode, `null` in create); `useRemindersProvisioned()`; after the type/due `f2` block render `{provisioned && <div className="fld"><label>{T_REMIND.notifyMe}</label><ReminderField dueLocal={dueValue} remindAt={remindAt} onChange={setRemindAt} /></div>}`; when `dueValue` changes via the picker, set both `dueValue` and `remindAt = shiftRemindAt(...)` in the same handler; include `remindAt` in `createQuickTask`/`updateTask` payloads **only when provisioned**; call `void refreshReminders()` after save.

- [ ] **Step 4: `TaskView.tsx`** — `REMINDER: IconBell` in `TASK_TYPE_ICONS`; after the due `<span>` in the header add the same `rem-chip` as in Step 2. Two inserts only.

- [ ] **Step 5:** `npx tsc --noEmit && npx vitest run` → PASS. **Commit** — `feat(sales-app): set reminders from a lead and from task editors`

---

### Task 8: Calendar

**Files:**
- Modify: `src/views/CalendarView.tsx`

- [ ] **Step 1:** In `handleDropTask`, build the update as `{ dueAt: nextIso, ...(task.remindAt ? shiftRemindAt(task, nextIso) : {}) }` — the spread is empty when there is no reminder, so unprovisioned servers never see the keys. Override state also carries the shifted `remindAt` so the day list is right before the refetch.
- [ ] **Step 2:** In the selected-day rows, after the `due` span add the `rem-chip` (bell + `relativeDueLabel(task.remindAt)`) when `task.remindAt` is set.
- [ ] **Step 3:** `npx tsc --noEmit` → PASS. **Commit** — `feat(sales-app): calendar keeps reminder offsets on drag and shows remind times`

---

### Task 9: Verification and hand-off

- [ ] **Step 1:** `npx vitest run` (all green), `npx tsc --noEmit`, `npx vite build` (must succeed — the deploy workflow gates on it).
- [ ] **Step 2:** Browser check with a stub harness (memory `sales-app-stub-harness-verification`): a fired reminder shows the badge, the Today card, and the sheet; dismiss removes it; snooze moves it to upcoming; `ReminderModal` opens from the lead action bar; a `REMINDER` task shows the bell in the calendar day list. Screenshot each for the PR.
- [ ] **Step 3:** Run `node tools/sales-crm/provision-reminders.mjs` against the local dev server (if running) and confirm the probe flips the UI on.
- [ ] **Step 4:** Update the spec's status line, `git push -u origin feat/sales-app-reminders`, open a PR titled `feat(sales-app): lead reminders with in-app notifications` whose body lists the provisioning step for prod.

---

## Self-review

- Spec coverage: data model → T2/T3; skew probe → T2; lead detail → T7; editors → T7; calendar → T8; Today card → T6; bell/badge/notification → T4/T6; DONE side effect → T2 (`setTaskStatus` flag used by `completeReminder`; TodayView's own `markDone` keeps its old call — a task marked done leaves the store on the next poll because the query filters `status`, and `classifyReminders` never fires DONE tasks, so the badge is right after `refreshReminders()`; add `void refreshReminders()` to TodayView's `markDone` only if it is a one-liner — it is, include it in T6 Step 5).
- Types: `ReminderTask` is a structural subset of `Task` (all four fields optional-compatible: `Task.remindAt?` vs `ReminderTask.remindAt` required — make `ReminderTask` fields `remindAt?: string | null; reminderDismissedAt?: string | null` and treat `undefined` as `null` inside `classifyReminders`/`shiftRemindAt`). Fixed in T1 code: use `task.remindAt ?? null`.
- No placeholders remain.
