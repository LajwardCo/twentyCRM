# Sales App Calendar — Design

Date: 2026-07-09
Status: Approved, ready for implementation plan

## Goal

Give sellers a month-grid calendar view of their own tasks inside the Sales App
(`packages/twenty-sales-app`), so they can see what's due on any given day at a
glance instead of only the flat/bucketed lists in "امروز" (Today) and "کارها"
(Tasks). Sellers should be able to reschedule a task by dragging it to a
different day, and jump straight into a task's detail view from the calendar.

## Approach

New dedicated `تقویم` (Calendar) page and nav tab, built with the same
hand-rolled, dependency-free style as the rest of the app (no calendar
library — `jalali.ts` already avoids a date library on principle, and every
existing library option is Gregorian/LTR-first, which fights the app's
RTL + Jalali requirement at every turn). The grid is rendered in the Afghan
Jalali calendar, consistent with every other date shown in the app.

## Scope

- **Own tasks only.** No team-member switcher — matches how "Today" and
  "Tasks" are already scoped per-seller. (Considered and explicitly deferred;
  revisit if managers ask for a team view later.)
- **Both open and done tasks show.** A day cell shows everything due that day;
  DONE tasks are styled distinctly (checked/struck-through) so the calendar
  doubles as a lightweight history view, not just a planning tool.
- **Tasks without a `dueAt` are not shown.** They don't belong on a grid; they
  remain visible in the "کارها" tab's "بدون موعد" bucket.
- **Drag-and-drop reschedule is desktop-only.** HTML5 drag events don't fire
  on touch, so narrow/touch viewports keep full click-to-view but lose the
  drag gesture. This is an accepted v1 limitation, not silently broken —
  called out here so it isn't mistaken for a bug later.

## Data layer (`api/records.ts`)

New `fetchTasksForCalendar(assigneeId, { fromIso, toIso })`:

```ts
export const fetchTasksForCalendar = async (
  assigneeId: string,
  range: { fromIso: string; toIso: string },
): Promise<Task[]>
```

Same `tasks(...)` query shape as `fetchMyOpenTasks`, but:
- **no `status` filter** (includes DONE, per the scope above)
- filters `dueAt: { gte: range.fromIso }` and `dueAt: { lte: range.toIso }`
  instead of the today/upcoming split
- `first: 500` (a full 6-week grid across all a seller's tasks is still a
  small result set; no pagination needed for v1)

Rescheduling reuses the existing `updateTask(taskId, { dueAt })` mutation —
no new mutation required. The reschedule call **preserves the original
time-of-day**, only replacing the date part, since tasks like calls have a
specific scheduled time that a day-to-day drag shouldn't discard.

## Jalali helpers (`lib/jalali.ts`)

Add, alongside the existing `gregorianToJalali`:

- `jalaliToGregorian(jy, jm, jd): Date` — reverse conversion, needed to turn
  the calendar's Jalali month cursor into a Gregorian date range for the API
  query, and to turn a drop-target day cell back into an ISO date for
  `updateTask`.
- `getJalaliMonthLength(jy, jm): number` — day count for a Jalali month
  (31 for months 1–6, 30 for 7–11, 29/30 for month 12 depending on leap year),
  used to size the grid and to compute "last day of month."
- `addJalaliMonths(jy, jm, delta): { jy, jm }` — month cursor arithmetic for
  the ‹ prev / next › navigation.

These get round-trip unit tests against `gregorianToJalali` (convert a date
forward and back, assert equality) across a range of years including at least
one known Jalali leap year — this is the one place a subtle off-by-one would
be easy to ship unnoticed.

## Components

**`views/CalendarView.tsx`** (page) — owns:
- month cursor state `{ jy, jm }`, defaulting to the current Jalali month
- header: `‹` / `امروز` / `›` navigation, matching the `page-head` style used
  in `TodayView`/`TasksView`
- data fetching via `useCached` with key `calendar:<workspaceMemberId>:<jy>-<jm>`,
  querying the Gregorian range covering the *full rendered grid* (including
  the leading/trailing days from adjacent months that fill out the first and
  last week rows), so a task due on the 1st of next month that's visible in
  the grid's last row still shows up
- renders `<CalendarGrid>` and, when a day is selected, an inline agenda
  panel below the grid

**`components/CalendarGrid.tsx`** — renders the grid:
- 7 columns, **Saturday → Friday** (Afghan week convention, matches RTL
  reading order — Saturday on the right)
- one cell per day: Jalali day number (Persian digits), muted styling for
  days belonging to the adjacent month, a "today" highlight
- up to ~3 task pills per cell (icon by `taskType`, DONE tasks
  checked/struck-through), then a "+N بیشتر" overflow if more exist
- **click a day cell** (not a pill) → opens/updates the agenda panel with
  that day's full task list, reusing the existing `TaskRow`-style row from
  `TodayView` (each row navigates to `/task/:id` on click)
- **drag a pill onto another day cell** → optimistically moves the task to
  the new day in local state, calls `updateTask` with the new `dueAt`
  (original time preserved); on failure, reverts the optimistic move and
  shows the existing `error-banner` pattern — same optimistic/rollback shape
  already used for `markDone` in `TodayView`/`TasksView`
- a plain click on a pill (no drag) navigates straight to `/task/:id` —
  HTML5 drag semantics mean a real drag gesture doesn't fire a trailing
  click, so this falls out naturally without extra state

## Navigation wiring

- `components/icons.tsx`: new `IconCalendar`
- `components/Shell.tsx`: add `{ key: 'calendar', label: 'تقویم', icon: IconCalendar }`
  to `NAV`, and a `calendar` case in `routeDockDefaults` (`{ label: 'تقویم', kind: 'page' }`)
  so the page can be minimized to the dock like any other view
- `App.tsx`: route `calendar` section to `<CalendarView user={user} />`

## Styling

New rules appended to `styles.css` (the app's single global stylesheet,
kebab-case class names, following existing patterns like `.dash-grid`,
`.task`, `.pill`): `.cal-grid`, `.cal-cell`, `.cal-cell.muted`,
`.cal-cell.today`, `.cal-pill`, `.cal-pill.done`, `.cal-overflow`,
`.cal-day-panel`.

## Testing

- Unit tests for the new Jalali helpers: round-trip conversion, month length
  across a couple of known leap/non-leap years, month-cursor arithmetic
  across a year boundary (Esfand/حوت → Farvardin/حمل).
- Component tests for `CalendarGrid`/`CalendarView`: correct cell count for a
  given month, a task placed on the correct day cell, DONE styling applied,
  day-click opens the agenda panel with the right tasks, drag-drop calls
  `updateTask` with the correct new date while preserving time-of-day, and a
  failed reschedule reverts the optimistic move.
- Manual verification in the browser preview against local dev data: create
  a couple of tasks with different due dates/statuses, view the calendar,
  confirm pills render correctly, drag one to another day and confirm the
  due date change via API read-back, click into a task and back.

**Implementation-time revision:** the component-test line above was scoped
down during planning (`docs/superpowers/plans/2026-07-09-sales-app-calendar.md`,
"Note on testing scope") because this package had zero test infrastructure
and no React Testing Library — adding a full RTL+jsdom harness for one
feature's component tests was judged disproportionate. What actually shipped:
real Vitest unit tests for the pure logic (`jalali.test.ts`,
`calendarGrid.test.ts` — 20 tests, including grid construction, task
bucketing, and Esfand-boundary rollover), plus thorough manual browser
verification covering every scenario listed above (grid rendering, DONE
styling, day-click agenda, drag-drop reschedule confirmed via direct
GraphQL read-back with time-of-day preserved, persistence across a hard
reload). No automated component/rendering tests exist for `CalendarGrid`/
`CalendarView` — a legitimate follow-up if this app grows a real
component-test habit later, not a gap introduced silently.

## Deferred (not in this build)

- Team-member calendar switcher for managers/admins.
- Touch drag-and-drop reschedule.
- Week/agenda view toggle (month grid only for v1).
