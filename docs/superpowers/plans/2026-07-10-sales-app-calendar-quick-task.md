# Sales App Calendar Quick Task Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let sellers create a new task or edit an existing one directly from the Calendar view (`#/calendar`), without navigating away to the full `TaskView`.

**Architecture:** One reusable bottom-sheet component, `QuickTaskModal`, in `create`/`edit` mode, following the exact overlay+sheet pattern already used by `WhatsAppModal.tsx`. `CalendarGrid` gets a small "+" button per day cell (opens create mode) and its task-pill click now opens edit mode instead of navigating away. `CalendarView` owns the modal's open/closed state and wires everything together.

**Tech Stack:** React 19, TypeScript (strict) — same package as the existing Calendar feature (`packages/twenty-sales-app`), no new dependencies.

---

## Reference

Full design spec: `docs/superpowers/specs/2026-07-10-sales-app-calendar-quick-task-design.md`.

Two things carried over from that spec, restated so they aren't lost mid-implementation:
- No lead/opportunity field, no delete action — quick tasks are standalone, and this is scoped to "create or edit" only.
- The agenda panel's task rows (below the grid) keep navigating to the full `TaskView` unchanged — only the grid's day-cell "+" and pill click change behavior.

## Note on testing scope

Unlike the original Calendar build, this feature introduces no new pure-logic/date-math functions — `createQuickTask` is a thin GraphQL-mutation wrapper (no test, matching every other `fetch*`/`create*` function in `records.ts`, none of which have unit tests) and `QuickTaskModal` is a form component with no non-trivial logic beyond "does the mutation and calls a callback." There is nothing here that would benefit from a Vitest unit test the way the Jalali/grid-math did. Verification is manual, in the browser, covering every scenario listed in the spec's Testing section.

---

### Task 1: `createQuickTask` API function

**Files:**
- Modify: `packages/twenty-sales-app/src/api/records.ts`

- [ ] **Step 1: Add `createQuickTask`**

In `packages/twenty-sales-app/src/api/records.ts`, insert the following immediately after the closing brace of `createTaskForLead` (i.e. right before `export const createNoteForLead`):

```ts
// Calendar quick-add: a standalone task with no lead/opportunity target,
// unlike createTaskForLead which always links one.
export const createQuickTask = async (input: {
  title: string;
  status: 'TODO' | 'DONE';
  taskType?: TaskType;
  dueAt: string | null;
  assigneeId: string;
}): Promise<string> => {
  const created = await coreQuery<{ createTask: { id: string } }>(
    `mutation CreateQuickTask($data: TaskCreateInput!) {
      createTask(data: $data) { id }
    }`,
    {
      data: {
        title: input.title,
        status: input.status,
        dueAt: input.dueAt,
        assigneeId: input.assigneeId,
        ...(input.taskType ? { taskType: input.taskType } : {}),
      },
    },
  );
  return created.createTask.id;
};
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/twenty-sales-app && npx tsc --noEmit`
Expected: no errors attributable to `records.ts`.

- [ ] **Step 3: Commit**

```bash
cd /Users/rashid/Development/twentyCRM
git add packages/twenty-sales-app/src/api/records.ts
git commit -m "feat(sales-app): add createQuickTask API for standalone (no-lead) tasks"
```

---

### Task 2: Quick-task strings

**Files:**
- Modify: `packages/twenty-sales-app/src/lib/strings.ts`

- [ ] **Step 1: Add T2 keys**

In `packages/twenty-sales-app/src/lib/strings.ts`, find the `// calendar` section in the `T2` object. Current end of that section:

```ts
  calendarRescheduleFailed: 'جابه‌جایی کار ناموفق بود',

  sellerPerformance: 'عملکرد فروشندگان',
```

Change to:

```ts
  calendarRescheduleFailed: 'جابه‌جایی کار ناموفق بود',
  calendarAddTask: 'افزودن کار',
  quickTaskNewTitle: 'کار جدید',
  quickTaskEditTitle: 'ویرایش کار',
  quickTaskTitleLbl: 'عنوان',
  quickTaskTypeLbl: 'نوع کار',
  quickTaskDueLbl: 'موعد',
  quickTaskMarkDone: 'پایان یافته',
  quickTaskSave: 'ذخیره',
  quickTaskSaving: 'در حال ذخیره…',
  quickTaskOpenFull: 'باز کردن کامل ←',
  quickTaskTitleRequired: 'عنوان را وارد کنید',
  quickTaskSaveFailed: 'ذخیره ناموفق بود',

  sellerPerformance: 'عملکرد فروشندگان',
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/twenty-sales-app && npx tsc --noEmit`
Expected: no errors (additive only, nothing references the new keys yet).

- [ ] **Step 3: Commit**

```bash
cd /Users/rashid/Development/twentyCRM
git add packages/twenty-sales-app/src/lib/strings.ts
git commit -m "feat(sales-app): add quick task modal strings"
```

---

### Task 3: `QuickTaskModal` component

**Files:**
- Create: `packages/twenty-sales-app/src/components/QuickTaskModal.tsx`

- [ ] **Step 1: Implement the modal**

Create `packages/twenty-sales-app/src/components/QuickTaskModal.tsx`:

```tsx
import { useState } from 'react';

import { createQuickTask, updateTask, type Task, type TaskType } from '../api/records';
import { invalidateCache } from '../lib/cache';
import { toLocalInputValue } from '../lib/format';
import { navigate } from '../lib/router';
import { T, T2, TASK_TYPE_LABELS } from '../lib/strings';

type QuickTaskModalProps =
  | {
      mode: 'create';
      dateIso: string;
      assigneeId: string;
      onClose: () => void;
      onSaved: () => void;
    }
  | {
      mode: 'edit';
      task: Task;
      onClose: () => void;
      onSaved: () => void;
    };

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(8, 23, 55, 0.55)',
  zIndex: 60,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  animation: 'fade-in .2s both',
};

const sheetStyle: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: '18px 18px 0 0',
  width: '100%',
  maxWidth: 480,
  maxHeight: '85dvh',
  overflowY: 'auto',
  padding: '18px 18px calc(18px + var(--safe-bottom))',
  animation: 'rise-in .3s both',
};

const TASK_TYPES: TaskType[] = ['CALL', 'MEETING', 'DEMO', 'VISIT', 'OTHER'];

const defaultDueValue = (dateIso: string): string => {
  const [y, m, d] = dateIso.split('-').map(Number);
  return toLocalInputValue(new Date(y, m - 1, d, 9, 0, 0, 0));
};

const initialDueValue = (props: QuickTaskModalProps): string => {
  if (props.mode === 'edit') {
    return props.task.dueAt
      ? toLocalInputValue(new Date(props.task.dueAt))
      : toLocalInputValue(new Date());
  }
  return defaultDueValue(props.dateIso);
};

export const QuickTaskModal = (props: QuickTaskModalProps) => {
  const { onClose, onSaved } = props;
  const [title, setTitle] = useState(props.mode === 'edit' ? props.task.title : '');
  const [taskType, setTaskType] = useState<TaskType>(
    props.mode === 'edit' ? (props.task.taskType ?? 'OTHER') : 'OTHER',
  );
  const [dueValue, setDueValue] = useState(() => initialDueValue(props));
  const [done, setDone] = useState(props.mode === 'edit' ? props.task.status === 'DONE' : false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (title.trim() === '') {
      setError(T2.quickTaskTitleRequired);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const dueAt = dueValue ? new Date(dueValue).toISOString() : null;
      if (props.mode === 'create') {
        await createQuickTask({
          title: title.trim(),
          status: done ? 'DONE' : 'TODO',
          taskType,
          dueAt,
          assigneeId: props.assigneeId,
        });
      } else {
        await updateTask(props.task.id, {
          title: title.trim(),
          taskType,
          dueAt,
          status: done ? 'DONE' : 'TODO',
        });
      }
      invalidateCache('calendar:');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : T2.quickTaskSaveFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={sheetStyle} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 750 }}>
            {props.mode === 'create' ? T2.quickTaskNewTitle : T2.quickTaskEditTitle}
          </h3>
          <button className="btn line sm" onClick={onClose}>
            {T.close}
          </button>
        </div>

        <div className="fld">
          <label htmlFor="qt-title">{T2.quickTaskTitleLbl}</label>
          <input
            id="qt-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>

        <div className="f2">
          <div className="fld">
            <label htmlFor="qt-type">{T2.quickTaskTypeLbl}</label>
            <select
              id="qt-type"
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as TaskType)}
            >
              {TASK_TYPES.map((tt) => (
                <option key={tt} value={tt}>
                  {TASK_TYPE_LABELS[tt]}
                </option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="qt-due">{T2.quickTaskDueLbl}</label>
            <input
              id="qt-due"
              type="datetime-local"
              value={dueValue}
              onChange={(e) => setDueValue(e.target.value)}
            />
          </div>
        </div>

        {props.mode === 'edit' && (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              fontWeight: 650,
              color: 'var(--ink-2)',
              marginBottom: 14,
              cursor: 'pointer',
            }}
          >
            <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />
            {T2.quickTaskMarkDone}
          </label>
        )}

        {error !== null && <div className="error-banner">{error}</div>}

        <button
          className="btn gold block"
          disabled={busy || title.trim() === ''}
          onClick={handleSave}
          style={{ padding: 12 }}
        >
          {busy ? T2.quickTaskSaving : T2.quickTaskSave}
        </button>

        {props.mode === 'edit' && (
          <button
            className="btn line sm"
            style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
            onClick={() => navigate(`/task/${props.task.id}`)}
          >
            {T2.quickTaskOpenFull}
          </button>
        )}
      </div>
    </div>
  );
};
```

There's no automated test for this file — see "Note on testing scope" above. Verified manually in Task 6.

- [ ] **Step 2: Typecheck**

Run: `cd packages/twenty-sales-app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/rashid/Development/twentyCRM
git add packages/twenty-sales-app/src/components/QuickTaskModal.tsx
git commit -m "feat(sales-app): add QuickTaskModal for create/edit"
```

---

### Task 4: Wire `QuickTaskModal` into `CalendarGrid`

**Files:**
- Modify: `packages/twenty-sales-app/src/components/CalendarGrid.tsx`

- [ ] **Step 1: Update imports**

Current top of `packages/twenty-sales-app/src/components/CalendarGrid.tsx`:

```tsx
import { type Task } from '../api/records';
import { type CalendarCell } from '../lib/calendarGrid';
import { toPersianDigits } from '../lib/jalali';
import { navigate } from '../lib/router';
import { T2 } from '../lib/strings';
import { TASK_TYPE_ICONS } from '../views/TaskView';
import { IconCheck } from './icons';
```

Change to (drop `navigate`, which is no longer used in this file; add `IconPlus`):

```tsx
import { type Task } from '../api/records';
import { type CalendarCell } from '../lib/calendarGrid';
import { toPersianDigits } from '../lib/jalali';
import { T2 } from '../lib/strings';
import { TASK_TYPE_ICONS } from '../views/TaskView';
import { IconCheck, IconPlus } from './icons';
```

- [ ] **Step 2: Add the two new props**

Current props type and component signature:

```tsx
type CalendarGridProps = {
  cells: CalendarCell[];
  tasksByDate: Map<string, Task[]>;
  selectedDate: string | null;
  onSelectDay: (dateIso: string) => void;
  onDropTask: (taskId: string, newDateIso: string) => void;
};

export const CalendarGrid = ({
  cells,
  tasksByDate,
  selectedDate,
  onSelectDay,
  onDropTask,
}: CalendarGridProps) => (
```

Change to:

```tsx
type CalendarGridProps = {
  cells: CalendarCell[];
  tasksByDate: Map<string, Task[]>;
  selectedDate: string | null;
  onSelectDay: (dateIso: string) => void;
  onDropTask: (taskId: string, newDateIso: string) => void;
  onQuickAdd: (dateIso: string) => void;
  onEditTask: (task: Task) => void;
};

export const CalendarGrid = ({
  cells,
  tasksByDate,
  selectedDate,
  onSelectDay,
  onDropTask,
  onQuickAdd,
  onEditTask,
}: CalendarGridProps) => (
```

- [ ] **Step 3: Add the "+" button to each cell and switch pill click to `onEditTask`**

Current cell body (day number + pills):

```tsx
            <span className="cal-day-num">{toPersianDigits(cell.jd)}</span>
            <div className="cal-pills">
              {dayTasks.slice(0, MAX_PILLS_PER_CELL).map((task) => {
                const TypeIcon = TASK_TYPE_ICONS[task.taskType ?? 'OTHER'] ?? IconCheck;
                return (
                  <div
                    key={task.id}
                    className={`cal-pill ${task.status === 'DONE' ? 'done' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', task.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/task/${task.id}`);
                    }}
                  >
                    <TypeIcon size={11} />
                    <span className="cal-pill-title">{task.title}</span>
                  </div>
                );
              })}
```

Change to:

```tsx
            <div className="cal-cell-head">
              <span className="cal-day-num">{toPersianDigits(cell.jd)}</span>
              <button
                type="button"
                className="cal-add-btn"
                aria-label={T2.calendarAddTask}
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickAdd(cell.dateIso);
                }}
              >
                <IconPlus size={12} />
              </button>
            </div>
            <div className="cal-pills">
              {dayTasks.slice(0, MAX_PILLS_PER_CELL).map((task) => {
                const TypeIcon = TASK_TYPE_ICONS[task.taskType ?? 'OTHER'] ?? IconCheck;
                return (
                  <div
                    key={task.id}
                    className={`cal-pill ${task.status === 'DONE' ? 'done' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', task.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditTask(task);
                    }}
                  >
                    <TypeIcon size={11} />
                    <span className="cal-pill-title">{task.title}</span>
                  </div>
                );
              })}
```

- [ ] **Step 4: Typecheck**

Run: `cd packages/twenty-sales-app && npx tsc --noEmit`
Expected: errors ONLY in `CalendarView.tsx` (`<CalendarGrid>` now missing the two new required props — expected, fixed in Task 5). No errors in `CalendarGrid.tsx` itself.

- [ ] **Step 5: Commit**

```bash
cd /Users/rashid/Development/twentyCRM
git add packages/twenty-sales-app/src/components/CalendarGrid.tsx
git commit -m "feat(sales-app): add quick-add button and edit-in-place to CalendarGrid"
```

---

### Task 5: Wire `QuickTaskModal` into `CalendarView`

**Files:**
- Modify: `packages/twenty-sales-app/src/views/CalendarView.tsx`

- [ ] **Step 1: Add the import**

Current import block (top of file):

```tsx
import { useCallback, useMemo, useState } from 'react';

import { type CurrentUser } from '../api/auth';
import { fetchTasksForCalendar, updateTask, type Task } from '../api/records';
import { CalendarGrid } from '../components/CalendarGrid';
import { IconCheck } from '../components/icons';
```

Change to:

```tsx
import { useCallback, useMemo, useState } from 'react';

import { type CurrentUser } from '../api/auth';
import { fetchTasksForCalendar, updateTask, type Task } from '../api/records';
import { CalendarGrid } from '../components/CalendarGrid';
import { IconCheck } from '../components/icons';
import { QuickTaskModal } from '../components/QuickTaskModal';
```

- [ ] **Step 2: Add quick-task state and handlers**

Current state block (right after the component opens):

```tsx
  const [selectedDate, setSelectedDate] = useState<string | null>(() => todayDateKey());
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [dropError, setDropError] = useState<string | null>(null);
```

Change to:

```tsx
  const [selectedDate, setSelectedDate] = useState<string | null>(() => todayDateKey());
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [dropError, setDropError] = useState<string | null>(null);
  const [quickTask, setQuickTask] = useState<
    { mode: 'create'; dateIso: string } | { mode: 'edit'; task: Task } | null
  >(null);
```

- [ ] **Step 3: Pass the new props to `CalendarGrid` and render the modal**

Current `CalendarGrid` usage:

```tsx
        <CalendarGrid
          cells={cells}
          tasksByDate={tasksByDate}
          selectedDate={selectedDate}
          onSelectDay={setSelectedDate}
          onDropTask={handleDropTask}
        />
```

Change to:

```tsx
        <CalendarGrid
          cells={cells}
          tasksByDate={tasksByDate}
          selectedDate={selectedDate}
          onSelectDay={setSelectedDate}
          onDropTask={handleDropTask}
          onQuickAdd={(dateIso) => setQuickTask({ mode: 'create', dateIso })}
          onEditTask={(task) => setQuickTask({ mode: 'edit', task })}
        />
```

Then, immediately after the closing `)}` of the `{loading ? (...) : (...)}` block that renders `<CalendarGrid>` (i.e. right before the `{selectedDate && (` agenda-panel block), add:

```tsx
      {quickTask?.mode === 'create' && (
        <QuickTaskModal
          key={`create-${quickTask.dateIso}`}
          mode="create"
          dateIso={quickTask.dateIso}
          assigneeId={user.workspaceMemberId}
          onClose={() => setQuickTask(null)}
          onSaved={() => {
            setQuickTask(null);
            void refresh();
          }}
        />
      )}
      {quickTask?.mode === 'edit' && (
        <QuickTaskModal
          key={`edit-${quickTask.task.id}`}
          mode="edit"
          task={quickTask.task}
          onClose={() => setQuickTask(null)}
          onSaved={() => {
            setQuickTask(null);
            void refresh();
          }}
        />
      )}
```

The full block, for exact placement context, should read:

```tsx
      {loading ? (
        <div className="skeleton" style={{ height: 480 }} />
      ) : (
        <CalendarGrid
          cells={cells}
          tasksByDate={tasksByDate}
          selectedDate={selectedDate}
          onSelectDay={setSelectedDate}
          onDropTask={handleDropTask}
          onQuickAdd={(dateIso) => setQuickTask({ mode: 'create', dateIso })}
          onEditTask={(task) => setQuickTask({ mode: 'edit', task })}
        />
      )}

      {quickTask?.mode === 'create' && (
        <QuickTaskModal
          key={`create-${quickTask.dateIso}`}
          mode="create"
          dateIso={quickTask.dateIso}
          assigneeId={user.workspaceMemberId}
          onClose={() => setQuickTask(null)}
          onSaved={() => {
            setQuickTask(null);
            void refresh();
          }}
        />
      )}
      {quickTask?.mode === 'edit' && (
        <QuickTaskModal
          key={`edit-${quickTask.task.id}`}
          mode="edit"
          task={quickTask.task}
          onClose={() => setQuickTask(null)}
          onSaved={() => {
            setQuickTask(null);
            void refresh();
          }}
        />
      )}

      {selectedDate && (
```

- [ ] **Step 4: Typecheck**

Run: `cd packages/twenty-sales-app && npx tsc --noEmit`
Expected: no errors anywhere related to the calendar files.

- [ ] **Step 5: Commit**

```bash
cd /Users/rashid/Development/twentyCRM
git add packages/twenty-sales-app/src/views/CalendarView.tsx
git commit -m "feat(sales-app): wire QuickTaskModal into CalendarView"
```

---

### Task 6: Styling for the "+" button

**Files:**
- Modify: `packages/twenty-sales-app/src/styles.css`

- [ ] **Step 1: Append styles**

Append the following to the end of `packages/twenty-sales-app/src/styles.css`:

```css

/* ============ calendar quick-add ============ */

.cal-cell-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cal-add-btn {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 0;
  background: transparent;
  color: var(--ink-3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition:
    background 0.12s,
    color 0.12s;
}

.cal-add-btn:hover {
  background: var(--lapis-100);
  color: var(--lapis-600);
}

.cal-add-btn svg {
  width: 12px;
  height: 12px;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/rashid/Development/twentyCRM
git add packages/twenty-sales-app/src/styles.css
git commit -m "style(sales-app): add calendar quick-add button styles"
```

---

### Task 7: Manual verification

No automated coverage — see "Note on testing scope" above. Verify by hand against local dev.

- [ ] **Step 1: Full typecheck and existing test suite**

Run:
```bash
cd packages/twenty-sales-app
npx vitest run
npx tsc --noEmit
```
Expected: the existing 20 Vitest tests still pass (unaffected by this feature), and typecheck is clean.

- [ ] **Step 2: Start the dev server and load the calendar**

Use a `sales-app*` launch config from `.claude/launch.json` (pick one not already in use by another session — check with `preview_list` first, or use `sales-app-verify2`/`sales-app-search-verify` if `sales-app`/`sales-app-verify` are occupied). Log in (`tim@apple.dev` / `tim@apple.dev`). Navigate to "تقویم".

- [ ] **Step 3: Verify quick-create**

1. Hover/click the small "+" on an empty day cell (or one with existing tasks). Confirm it does NOT also select the day / open the agenda panel (the click should be fully absorbed by the button).
2. Confirm the modal opens in create mode, title "کار جدید", with the due-date field pre-filled to 09:00 on the clicked day.
3. Type a title, pick a task type, leave the date as-is, click "ذخیره" (save).
4. Confirm the modal closes and a new pill for that task appears on the correct day, with the correct type icon.
5. Repeat but leave the title empty and click save — confirm an inline validation error appears ("عنوان را وارد کنید") and no network call is made (check via `preview_network`).

- [ ] **Step 4: Verify quick-edit**

1. Click an existing task pill. Confirm the modal opens in edit mode ("ویرایش کار") with the task's current title/type/due date pre-filled, and does NOT navigate to `/task/:id`.
2. Change the title and task type, save. Confirm the pill (and, if that day is selected, the agenda panel row) reflect the new title/icon.
3. Open a task again, check "پایان یافته" (mark done), save. Confirm the pill now renders with the DONE (checked/struck-through) styling.
4. Open a task, change only the due date to a different day, save. Confirm the pill moves to the new day (same mechanism as drag-and-drop, verified via a page reload that the change persisted).
5. Open a task's edit modal and click "باز کردن کامل" (open full task). Confirm it navigates to the correct `/task/:id` TaskView.

- [ ] **Step 5: Verify drag-and-drop still works unchanged**

Drag a task pill to a different day (as in the original Calendar feature). Confirm this still reschedules the task via drag (not accidentally intercepted by the new click handlers).

- [ ] **Step 6: Take a screenshot for the record**

Use `preview_screenshot` with the create or edit modal open, for confirmation.

---

### Task 8: Final review pass

- [ ] **Step 1: Re-run everything once more end to end**

```bash
cd packages/twenty-sales-app
npx vitest run
npx tsc --noEmit
```
Expected: all green, no type errors.

- [ ] **Step 2: Review the diff against the design spec**

Read back `docs/superpowers/specs/2026-07-10-sales-app-calendar-quick-task-design.md` and confirm every requirement (triggers, fields, save flow, component changes) has a corresponding change in the diff, and that the "Deferred" items (lead field, delete action, agenda-panel quick-edit) were genuinely not built.
