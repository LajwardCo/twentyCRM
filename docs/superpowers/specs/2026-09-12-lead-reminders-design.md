# Lead reminders ("یادآوری") — design

**Date:** 2026-09-12
**Package:** `packages/twenty-sales-app` (+ one provisioner in `tools/sales-crm`)
**Branch:** `feat/sales-app-reminders` (worktree `.worktrees/feat-reminders`)

## Problem

A seller agrees with a lead to "call back Tuesday at 10" and has no way to be
told when Tuesday 10:00 arrives. Tasks have a due date, but nothing fires; the
seller has to remember to open the Today page and scan. Reminders on other
tools (phone alarms, paper) are disconnected from the lead.

## Goal

Set a reminder on a lead (or on any task) with a time to be notified. When the
time comes the seller is told — in the app (bell + badge + dashboard card) and,
where the browser allows, with a system notification that opens the lead. The
reminder appears on the Calendar and the Today dashboard alongside tasks, can be
snoozed, dismissed or marked done, and is visible on every device the seller
uses, not only the one it was set on.

## Scope of this spec (delivery option A)

In-app delivery plus the browser `Notification` API while the app is open or
backgrounded. No server code, no Web Push. The data model is chosen so that a
later server-side push (cron reading `remindAt`) is purely additive.

## Data model — a reminder is a task

No new object. The `task` object already has an assignee, a `dueAt`, a link to
the lead via `taskTargets`, and already flows into Calendar, Today, the lead
timeline and the Tasks list. Three metadata additions on `task`:

| Field | Type | Meaning |
|---|---|---|
| `remindAt` | DATE_TIME, nullable | when to notify. Null = no reminder. |
| `reminderDismissedAt` | DATE_TIME, nullable | set when the seller dismisses (or the task is completed); a fired reminder must not re-alert on every refresh/device. Snooze clears it and moves `remindAt` forward. |
| `taskType` option `REMINDER` | new SELECT option (label «یادآوری», color `yellow`) | the default type for "remind me" created from a lead; renders with the bell icon. |

Rules:

- Any task type may carry `remindAt` (a MEETING can have a 1-hour-before
  reminder). `REMINDER` is only the default type when created from the lead's
  bell button.
- `remindAt` is stored as an absolute instant. The UI offers it as an offset
  from `dueAt` (at time / 15 min / 1 h / 1 day before) plus "custom", but the
  offset is derived for display, never stored.
- A reminder is **fired** when `remindAt <= now`, `reminderDismissedAt` is null,
  and `status != DONE`.
- A reminder is **upcoming** when `remindAt > now` and `status != DONE`.
- Marking the task DONE (anywhere) also sets `reminderDismissedAt = now` so it
  leaves the bell at once; `setTaskStatus('DONE')` gains that side effect.
- Drag-rescheduling in the Calendar moves `dueAt`; `remindAt` moves by the same
  delta so the chosen offset survives, and `reminderDismissedAt` is cleared (a
  moved reminder is a new promise).

### Provisioning

`tools/sales-crm/provision-reminders.mjs`, same idiom as
`provision-task-type.mjs` + `provision-partner-type-other.mjs`:

1. `createOneField task.remindAt` (DATE_TIME, icon `IconBell`, label "Remind At").
2. `createOneField task.reminderDismissedAt` (DATE_TIME, icon `IconBellOff`).
3. `updateOneField task.taskType` writing back existing options unchanged (ids
   included) plus `REMINDER` at the end.

Idempotent: each step skips when already present. Auth via `TWENTY_TOKEN` or
email/password; target via `TWENTY_META`.

### Schema skew

Reads are safe before provisioning: the record API returns `null` for an
unknown selected field (verified on prod, see memory), so selecting `remindAt`
everywhere costs nothing. Writes are validated, so every control that *writes*
a reminder is gated by `isRemindersProvisioned()` in
`src/api/remindersSupport.ts` — a `/metadata` probe for `task.remindAt`,
cached per session, identical in shape to `phoneAppsSupport.ts`. Until the
provisioner has run, the bell button, the reminder row in task editors, the
shell bell and the Today card simply do not render.

## UI

Persian strings live in a new `T_REMIND` block appended to `src/lib/strings.ts`.
Styles in an appended `/* ---- reminders ---- */` block in `src/styles.css`.

### 1. Lead detail — set a reminder

- A bell action `یادآوری` added to the lead `ActionBar` (`barActions`) and a
  `btn line sm` next to the existing "＋ پیگیری" button. Both open
  `ReminderModal` (new, `src/components/ReminderModal.tsx`; sheet styling copied
  from `QuickTaskModal`).
- `ReminderModal` fields: title (prefilled «پیگیری {lead.name}»), due date+time
  (`JalaliDatePicker withTime`, default tomorrow 09:00), "notify me" preset
  (`در همان زمان` / `۱۵ دقیقه قبل` / `۱ ساعت قبل` / `۱ روز قبل` / `زمان دیگر`
  with its own picker), optional note. Save → `createTaskForLead({ taskType:
  'REMINDER', dueAt, remindAt, ... })`, toast «یادآوری ثبت شد ✓», cache
  invalidation for `today:`, `calendar:`, `reminders:`, then `reload()`.
- On the first save the modal requests `Notification` permission (never on
  page load). Denial is silent — in-app delivery still works.
- Open-task rows under the lead show a small bell + `remindAt` time when set.

### 2. Task editors

- `QuickTaskModal` and the `TaskView` edit form gain a `ReminderField`
  component (new, `src/components/ReminderField.tsx`): the same preset
  select + optional custom picker, bound to `dueAt`, emitting `remindAt | null`.
  Clearing the preset removes the reminder.
- `updateTask` / `createQuickTask` / `createTaskForLead` accept `remindAt` and
  `reminderDismissedAt`.

### 3. Calendar

- `taskType === 'REMINDER'` renders with `IconBell` (one entry in
  `TASK_TYPE_ICONS`, one in `TASK_TYPE_LABELS`).
- The selected-day list shows the remind time next to tasks carrying one.
- `handleDropTask` also shifts `remindAt` by the same delta and clears
  `reminderDismissedAt` (logic in `lib/reminders.ts`, tested).

### 4. Today dashboard — `RemindersCard`

New `src/components/RemindersCard.tsx`, inserted with one JSX line at the top
of `TodayView`'s main column (above the other agent's suggestions card; both
are self-contained). Hidden when there is nothing to show.

- **Fired** section: rows sorted by `remindAt` asc, each with lead chip, title,
  «زمان یادآوری» relative label, and three actions: **انجام شد** (status DONE
  + dismiss), **تعویق** (menu: `۱ ساعت بعد`, `فردا ۹ صبح`), **رد** (dismiss).
- **Upcoming today** section: reminders with `remindAt` later today, time only,
  tap opens the task.
- Data comes from the shared reminder store (below), so the card, the bell and
  the system notification never disagree.

### 5. Shell bell + badge + notifications

- `src/lib/reminders.ts` — pure logic: `classifyReminders(tasks, now)` →
  `{ fired, upcomingToday, later }`; `snoozeTarget(kind, now)`;
  `shiftRemindAt(task, newDueIso)`; `presetFromOffset` / `offsetToRemindAt`.
- `src/lib/reminderStore.ts` — a module-level store (`useReminders()` hook)
  that fetches `fetchMyReminders(workspaceMemberId)` (new in `api/reminders.ts`:
  tasks where `assigneeId = me`, `remindAt` not null, `status != DONE`,
  `remindAt <= end of today + 1 day`, first 200), re-polls every 60 s while the
  tab is visible and immediately on `visibilitychange`/`focus`, and re-runs
  `classifyReminders` every 30 s so a reminder "fires" on the minute without a
  network call. Exposes `fired`, `upcomingToday`, `refresh`, `dismiss`,
  `snooze`, `complete` (optimistic: the row leaves the list at once, server
  write follows, failure restores it and shows the error).
- When a task id moves from not-fired to fired while the page is open **and**
  `Notification.permission === 'granted'`, the store shows one
  `new Notification(title, { body: lead name · time, tag: task.id })`; click
  focuses the window and navigates to `/lead/:id` (or `/task/:id` without a
  lead). Ids already notified are kept in a `Set` for the session so a
  re-render never double-fires. On iOS Safari the `Notification` constructor is
  absent; guarded.
- `Shell` `cmd-right` gets an `icon-btn` bell with a red badge = `fired.length`
  (hidden at 0). Tap opens `RemindersSheet` (new, `src/components/RemindersSheet.tsx`)
  — the same rows and actions as the Today card in a bottom sheet, plus
  «همه یادآوری‌ها» linking to `/tasks`. `MobileMenu` gets the same bell entry so
  phones reach it without the desktop bar.
- `useReminders` is mounted once by `AppShell`, which wraps every logged-in
  page, so polling runs everywhere without per-view wiring.

## Files

| file | change |
|---|---|
| `tools/sales-crm/provision-reminders.mjs` | **new** provisioner |
| `src/api/remindersSupport.ts` | **new** `/metadata` probe |
| `src/api/reminders.ts` | **new** `fetchMyReminders`, `dismissReminder`, `snoozeReminder`, `completeReminder` |
| `src/api/records.ts` | `Task` type + `remindAt`/`reminderDismissedAt`; select them in `fetchLeadTasks`, `fetchMyOpenTasks`, `fetchTasksForCalendar`, `fetchTask`; accept them in `updateTask`, `createTaskForLead`, `createQuickTask`; `setTaskStatus('DONE')` sets `reminderDismissedAt` |
| `src/lib/reminders.ts` + `.test.ts` | **new** pure logic |
| `src/lib/reminderStore.ts` + `.test.ts` | **new** store/hook (fake timers) |
| `src/components/ReminderField.tsx` | **new** preset picker |
| `src/components/ReminderModal.tsx` | **new** lead "remind me" sheet |
| `src/components/RemindersCard.tsx` | **new** Today card |
| `src/components/RemindersSheet.tsx` | **new** bell sheet |
| `src/components/Shell.tsx` | bell button + sheet mount (≈15 lines) |
| `src/components/MobileMenu.tsx` | bell entry (≈5 lines) |
| `src/components/QuickTaskModal.tsx` | `ReminderField` row (≈10 lines) |
| `src/views/TaskView.tsx` | `REMINDER` icon; `ReminderField` in edit form (≈10 lines) |
| `src/views/LeadDetailView.tsx` | bell action + button + modal mount (≈20 lines) |
| `src/views/CalendarView.tsx` | drop shifts `remindAt`; remind time in day list (≈8 lines) |
| `src/views/TodayView.tsx` | one import + one JSX line |
| `src/lib/strings.ts` | appended `T_REMIND` block; `REMINDER` in `TASK_TYPE_LABELS` |
| `src/styles.css` | appended `/* ---- reminders ---- */` block |

Another agent is working on `TodayView`, `TaskView` and `styles.css` in
parallel; every edit to a shared file is an appended block or a single inserted
line so the merge is mechanical.

## Error handling

- Store fetch failure: keep the last good list, show nothing new; the bell shows
  the stale count. No error banner in the shell (it would sit on every page);
  the Today card shows the inline error if it has no data at all.
- Action failure (dismiss/snooze/complete): restore the row, toast the message.
- Permission denied / `Notification` unsupported: silent; in-app only.
- Unprovisioned server: write controls hidden, reads select nulls, nothing
  fires.

## Testing

- `lib/reminders.test.ts`: fired/upcoming/later classification across the
  day boundary; `shiftRemindAt` keeps the offset and clears dismissal;
  `snoozeTarget('tomorrow-9')` lands at 09:00 local the next day regardless of
  current hour; offset presets round-trip.
- `lib/reminderStore.test.ts` (fake timers, mocked fetch): polls on interval,
  pauses while hidden, notifies exactly once per id, optimistic dismiss rolls
  back on failure.
- `api/remindersSupport.test.ts`: probe true/false/unknown-not-cached.
- Browser check with the stub harness pattern (see memory
  `sales-app-stub-harness-verification`) for the sheet, the card and the badge.

## Out of scope

Web Push / server cron (option B); recurring reminders; reminders on contacts
or partners; reminders assigned to someone else (the assignee picker in
`TaskView` already covers that for plain tasks).
