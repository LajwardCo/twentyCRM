# Sales App Calendar — Quick Task Create/Edit — Design

Date: 2026-07-10
Status: Approved, ready for implementation plan

## Goal

Let sellers create a new task or edit an existing one without leaving the
Calendar view (`#/calendar`, built in the prior Calendar feature). Today,
the calendar is view-only for task content — a "+" on a day cell doesn't
exist, and clicking a task pill navigates away to the full `TaskView`.

## Approach

One reusable bottom-sheet component, `QuickTaskModal`, used for both create
and edit, following the same overlay + rise-in-sheet pattern already used by
`WhatsAppModal.tsx` (fixed overlay, `.card`-style sheet sliding up from the
bottom, closable via an explicit close action). A single component avoids
duplicating the same four fields, validation, and save/error handling across
two near-identical forms.

## Triggers

- **Create**: each day cell in `CalendarGrid` gets a small "+" button near
  the day number, always visible (not hover-only, for discoverability and
  touch-friendliness), with `stopPropagation()` so it doesn't also trigger
  the cell's existing day-select behavior. Opens `QuickTaskModal` in
  `mode: 'create'` with that day's date pre-filled.
- **Edit**: clicking an existing task pill now opens `QuickTaskModal` in
  `mode: 'edit'` instead of navigating to `/task/:id`. Dragging a pill still
  reschedules it (unchanged — a different gesture, no conflict). The agenda
  panel below the grid keeps its current click-to-navigate-to-TaskView
  behavior unchanged — quick-edit is scoped to the grid interaction only.

## Fields

- **Title** — required text input.
- **Task type** — the same CALL/MEETING/DEMO/VISIT/OTHER select used
  elsewhere in the app (`TASK_TYPE_LABELS`).
- **Due date/time** — a single `datetime-local` input. Create mode defaults
  to 09:00 on the clicked day; edit mode defaults to the task's existing
  `dueAt` (via the existing `toLocalInputValue` helper).
- **Mark done** (edit mode only) — a checkbox/toggle setting `status` to
  `DONE`/`TODO`.

No lead/opportunity field (quick tasks are standalone, matching the
"بدون لید" tasks already common in this data) and no delete action —
scoped to exactly "create or edit," not delete, per the request.

## Data layer

New `createQuickTask` in `api/records.ts`, modeled on the existing
`createTaskForLead` but skipping the `createTaskTarget` mutation entirely:

```ts
export const createQuickTask = async (input: {
  title: string;
  status: 'TODO' | 'DONE';
  taskType?: TaskType;
  dueAt: string | null;
  assigneeId: string;
}): Promise<string>
```

Just the `createTask` mutation, no target — a standalone task, no
`createTaskTarget` call. Editing reuses the existing generic
`updateTask(taskId, update: Record<string, unknown>)`, already capable of
updating `title`/`taskType`/`dueAt`/`status`.

## Save flow

On save: call `createQuickTask` or `updateTask`, then
`invalidateCache('calendar:')` followed by the parent `CalendarView`'s own
`refresh()` (mirrors how `TaskView.tsx` already invalidates `'today:'` after
its own mutations), then close the modal. Save errors render inline in the
modal via the existing `.error-banner` class — not swallowed, not a toast
that disappears before the user can act on it.

## Component changes

- **`components/QuickTaskModal.tsx`** (new): props are
  `{ mode: 'create'; dateIso: string; onClose: () => void; onSaved: () => void } | { mode: 'edit'; task: Task; onClose: () => void; onSaved: () => void }`.
  Owns its own form state (title/taskType/dueAt/status), calls
  `createQuickTask`/`updateTask` on submit, shows a save-error banner on
  failure. Includes a "باز کردن کامل" (open full task) link/button in edit
  mode that calls `navigate('/task/:id')` for anyone who needs the richer
  before/during/after `TaskView` flow (attachments, AI summarize, lead
  context, follow-up scheduling — none of which quick-edit attempts to
  replicate).
- **`components/CalendarGrid.tsx`** (modified): two new props,
  `onQuickAdd: (dateIso: string) => void` (wired to each cell's new "+"
  button) and `onEditTask: (task: Task) => void` (replaces the pill's
  current direct `navigate()` call). No longer imports `navigate` itself —
  both actions become caller-provided callbacks, keeping `CalendarGrid` a
  purely presentational component (consistent with how it already receives
  `onSelectDay`/`onDropTask` rather than owning navigation).
- **`views/CalendarView.tsx`** (modified): owns
  `quickTask: { mode: 'create'; dateIso: string } | { mode: 'edit'; task: Task } | null`
  state, passes `onQuickAdd`/`onEditTask` handlers down to `CalendarGrid`
  that set this state, and conditionally renders `<QuickTaskModal>`.

## Testing

`createQuickTask` is a thin GraphQL-mutation wrapper — no unit test, matching
this file's existing convention (none of the sibling `fetch*`/`create*`
functions in `records.ts` have unit tests; they're network calls, not logic).
No new pure-logic functions are introduced here (unlike the original
Calendar build's Jalali/grid-math work), so there is nothing new for Vitest
to meaningfully cover. Verified manually in the browser preview:

- Click "+" on a day cell → modal opens in create mode with that date
  pre-filled → save → new task pill appears on the correct day.
- Click an existing pill → modal opens in edit mode with current values →
  change title/type/date → save → pill/agenda panel reflect the change.
- Toggle "mark done" in edit mode → save → task renders with DONE styling
  (checked/struck-through) in both the grid pill and the agenda panel.
- Click "open full task" from edit mode → lands on the correct `/task/:id`
  TaskView.
- Save with an empty title → inline validation error, no network call.
- Simulate a save failure (e.g. invalid state) → error banner shown, modal
  stays open with the user's input intact (not silently discarded).

## Deferred (not in this build)

- Lead/opportunity attachment on quick-created tasks.
- Delete/remove a task from the quick-edit modal.
- Quick-edit access from the agenda panel rows (agenda rows still navigate
  to the full TaskView, unchanged).
