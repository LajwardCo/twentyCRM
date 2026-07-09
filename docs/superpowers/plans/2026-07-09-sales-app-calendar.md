# Sales App Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a month-grid "تقویم" (Calendar) page to the Sales App (`packages/twenty-sales-app`) showing the logged-in seller's tasks by day in the Afghan Jalali calendar, with click-to-view-agenda and drag-to-reschedule.

**Architecture:** Pure-logic helpers (Jalali date math, grid construction) live in `lib/`, fully unit-tested with Vitest since they're easy to get subtly wrong and cheap to verify in isolation. The page itself (`CalendarView` + `CalendarGrid`) follows the existing hand-rolled component style used throughout this app (no calendar library, no CSS framework — same global `styles.css` and Jotai-free local `useState`/`useCached` pattern as `TodayView`/`TasksView`). Rescheduling reuses the existing `updateTask` mutation; no backend changes.

**Tech Stack:** React 19, TypeScript (strict), Vite, Vitest (new — this package currently has zero test infrastructure, added here for the date-math functions specifically).

---

## Reference: design spec

Full rationale and scope decisions: `docs/superpowers/specs/2026-07-09-sales-app-calendar-design.md`. Two scope notes carried over from that spec, restated here so they aren't lost mid-implementation:
- Own tasks only, no team-member switcher.
- Drag-and-drop reschedule is desktop-only (HTML5 drag events don't fire on touch) — this is an accepted v1 limitation, not a bug to fix here.

## Note on testing scope (deviation from the spec, made explicit)

The design spec called for "component tests" of `CalendarView`/`CalendarGrid`. This package (`twenty-sales-app`) has **no test runner, no React Testing Library, and no existing test files at all** — it's a standalone Vite app outside the Nx workspace with its own lightweight conventions (single global CSS file, no Storybook, hand-rolled everything). Adding a full RTL+jsdom harness for one feature's component tests would be disproportionate scope creep.

Instead: the highest-risk logic (Jalali calendar math, grid construction, task-by-date bucketing) is pure functions with no DOM dependency — those get real Vitest unit tests (Tasks 1–2). The React components (rendering, drag-and-drop, click handling) are verified manually in the browser preview against local dev data (Task 9), which is this app's established verification method (see `docs/superpowers/specs/2026-07-06-sales-app-spa-design.md`). If this app grows a real component-test habit later, that's a separate decision, not bundled into this feature.

---

### Task 1: Jalali date-math helpers

**Files:**
- Modify: `packages/twenty-sales-app/src/lib/jalali.ts`
- Modify: `packages/twenty-sales-app/package.json`
- Create: `packages/twenty-sales-app/src/lib/jalali.test.ts`

- [ ] **Step 1: Add Vitest to the package**

Run:
```bash
cd packages/twenty-sales-app && npm install --save-dev vitest
```
Expected: `vitest` added to `devDependencies` in `package.json`, `package-lock.json` updated.

Then add a `test` script to `packages/twenty-sales-app/package.json`. Current `scripts` block:
```json
  "scripts": {
    "start": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview"
  },
```
Change to:
```json
  "scripts": {
    "start": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
```

- [ ] **Step 2: Write the failing test**

Create `packages/twenty-sales-app/src/lib/jalali.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  addJalaliMonths,
  getJalaliMonthLength,
  gregorianToJalali,
  jalaliToGregorian,
} from './jalali';

describe('jalaliToGregorian', () => {
  it('round-trips through gregorianToJalali across a wide date range', () => {
    for (let gy = 1990; gy <= 2035; gy++) {
      for (const [gm, gd] of [
        [1, 1],
        [3, 20],
        [6, 15],
        [9, 30],
        [12, 31],
      ] as const) {
        const j = gregorianToJalali(gy, gm, gd);
        const back = jalaliToGregorian(j.jy, j.jm, j.jd);
        expect(back).toEqual({ gy, gm, gd });
      }
    }
  });

  it('matches known reference dates (Nowruz on the Gregorian calendar)', () => {
    expect(jalaliToGregorian(1400, 1, 1)).toEqual({ gy: 2021, gm: 3, gd: 21 });
    expect(jalaliToGregorian(1403, 1, 1)).toEqual({ gy: 2024, gm: 3, gd: 20 });
    expect(jalaliToGregorian(1404, 1, 1)).toEqual({ gy: 2025, gm: 3, gd: 21 });
  });
});

describe('getJalaliMonthLength', () => {
  it('returns 31 for the first six months (حمل..سنبله)', () => {
    for (let jm = 1; jm <= 6; jm++) {
      expect(getJalaliMonthLength(1404, jm)).toBe(31);
    }
  });

  it('returns 30 for months 7-11 (میزان..دلو)', () => {
    for (let jm = 7; jm <= 11; jm++) {
      expect(getJalaliMonthLength(1404, jm)).toBe(30);
    }
  });

  it('returns 30 for حوت (Esfand) in known leap years', () => {
    expect(getJalaliMonthLength(1403, 12)).toBe(30);
    expect(getJalaliMonthLength(1399, 12)).toBe(30);
  });

  it('returns 29 for حوت (Esfand) in known non-leap years', () => {
    expect(getJalaliMonthLength(1402, 12)).toBe(29);
    expect(getJalaliMonthLength(1404, 12)).toBe(29);
  });
});

describe('addJalaliMonths', () => {
  it('rolls forward into the next year', () => {
    expect(addJalaliMonths(1403, 12, 1)).toEqual({ jy: 1404, jm: 1 });
  });

  it('rolls backward into the previous year', () => {
    expect(addJalaliMonths(1404, 1, -1)).toEqual({ jy: 1403, jm: 12 });
  });

  it('handles multi-year jumps in both directions', () => {
    expect(addJalaliMonths(1403, 6, 14)).toEqual({ jy: 1404, jm: 8 });
    expect(addJalaliMonths(1403, 6, -30)).toEqual({ jy: 1400, jm: 12 });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd packages/twenty-sales-app && npx vitest run src/lib/jalali.test.ts`
Expected: FAIL — `jalaliToGregorian`, `getJalaliMonthLength`, `addJalaliMonths` are not exported from `./jalali` (TypeScript/module error).

- [ ] **Step 4: Implement the helpers**

In `packages/twenty-sales-app/src/lib/jalali.ts`, first make `AFGHAN_MONTHS` exported (`CalendarView` will need it in a later task) — change:
```ts
const AFGHAN_MONTHS = [
```
to:
```ts
export const AFGHAN_MONTHS = [
```

Then insert the following immediately after the closing brace of `gregorianToJalali` (i.e. right before the `export const formatJalaliDate` block):

```ts
const isGregorianLeapYear = (gy: number): boolean =>
  (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;

// Reverse of gregorianToJalali — same algorithm family, inverted. Verified
// by round-trip fuzzing (see jalali.test.ts) rather than derived from a
// leap-year formula, since Jalali leap-year rules are easy to get subtly
// wrong.
export const jalaliToGregorian = (
  jy: number,
  jm: number,
  jd: number,
): { gy: number; gm: number; gd: number } => {
  const jy2 = jy + 1595;
  let days =
    -355668 +
    365 * jy2 +
    div(jy2, 33) * 8 +
    div((jy2 % 33) + 3, 4) +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    days -= 1;
    gy += 100 * div(days, 36524);
    days %= 36524;
    if (days >= 365) days += 1;
  }
  gy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    gy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  const gd0 = days + 1;
  const monthDays = [
    0,
    31,
    isGregorianLeapYear(gy) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  let gm = 1;
  let gd = gd0;
  for (let i = 1; i <= 12; i++) {
    if (gd <= monthDays[i]) {
      gm = i;
      break;
    }
    gd -= monthDays[i];
  }
  return { gy, gm, gd };
};
```

Then append the following at the end of the file (after `relativeDueLabel`):

```ts
// Day count for a Jalali month. Months 1-6 are always 31 days, 7-11 are
// always 30. Month 12 (حوت/Esfand) is 29 or 30 depending on the leap year —
// determined by round-tripping day 30 through the verified Gregorian
// conversion (if it round-trips back to the same jy/12/30, that day exists)
// rather than a separate leap-year formula.
export const getJalaliMonthLength = (jy: number, jm: number): number => {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  const g30 = jalaliToGregorian(jy, 12, 30);
  const back = gregorianToJalali(g30.gy, g30.gm, g30.gd);
  return back.jy === jy && back.jm === 12 && back.jd === 30 ? 30 : 29;
};

// Month-cursor arithmetic for calendar prev/next navigation.
export const addJalaliMonths = (
  jy: number,
  jm: number,
  delta: number,
): { jy: number; jm: number } => {
  const zeroBased = jm - 1 + delta;
  const yearDelta = Math.floor(zeroBased / 12);
  const newMonthZeroBased = ((zeroBased % 12) + 12) % 12;
  return { jy: jy + yearDelta, jm: newMonthZeroBased + 1 };
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd packages/twenty-sales-app && npx vitest run src/lib/jalali.test.ts`
Expected: PASS — all tests green (the round-trip test alone covers 46 years × 5 dates = 230 assertions).

- [ ] **Step 6: Commit**

```bash
cd /Users/rashid/Development/twentyCRM
git add packages/twenty-sales-app/package.json packages/twenty-sales-app/package-lock.json packages/twenty-sales-app/src/lib/jalali.ts packages/twenty-sales-app/src/lib/jalali.test.ts
git commit -m "feat(sales-app): add Jalali <-> Gregorian reverse conversion and month-length helpers"
```

---

### Task 2: Calendar grid construction

**Files:**
- Create: `packages/twenty-sales-app/src/lib/calendarGrid.ts`
- Create: `packages/twenty-sales-app/src/lib/calendarGrid.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/twenty-sales-app/src/lib/calendarGrid.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { buildCalendarGrid, groupTasksByDate, todayDateKey } from './calendarGrid';

describe('buildCalendarGrid', () => {
  it('produces a whole number of weeks that fully covers the month', () => {
    const cells = buildCalendarGrid(1403, 1, '1970-01-01');
    expect(cells.length % 7).toBe(0);
    expect(cells.filter((c) => c.inCurrentMonth)).toHaveLength(31);
  });

  it('produces consecutive, non-duplicated calendar dates with no gaps', () => {
    const cells = buildCalendarGrid(1404, 1, '1970-01-01');
    expect(cells).toHaveLength(42);
    const dates = cells.map((c) => new Date(`${c.dateIso}T00:00:00`).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] - dates[i - 1]).toBe(86_400_000);
    }
    expect(new Set(cells.map((c) => c.dateIso)).size).toBe(cells.length);
  });

  it('flags leading and trailing days as outside the current month', () => {
    const cells = buildCalendarGrid(1404, 1, '1970-01-01');
    expect(cells[0].inCurrentMonth).toBe(false);
    expect(cells[cells.length - 1].inCurrentMonth).toBe(false);
    expect(cells[0]).toMatchObject({ jy: 1403, jm: 12, jd: 25 });
  });

  it('marks exactly one cell as today when today falls inside the grid', () => {
    const cells = buildCalendarGrid(1405, 4, '2026-07-09');
    const todayCells = cells.filter((c) => c.isToday);
    expect(todayCells).toHaveLength(1);
    expect(todayCells[0]).toMatchObject({
      jy: 1405,
      jm: 4,
      jd: 18,
      dateIso: '2026-07-09',
    });
  });

  it('marks no cell as today when the visible month does not contain it', () => {
    const cells = buildCalendarGrid(1403, 1, '2026-07-09');
    expect(cells.some((c) => c.isToday)).toBe(false);
  });
});

describe('groupTasksByDate', () => {
  it('buckets tasks by their local due date', () => {
    const grouped = groupTasksByDate([
      { id: '1', dueAt: '2026-07-09T10:00:00.000Z' },
      { id: '2', dueAt: '2026-07-09T14:00:00.000Z' },
      { id: '3', dueAt: '2026-07-10T10:00:00.000Z' },
    ]);
    expect(grouped.get('2026-07-09')?.map((t) => t.id).sort()).toEqual(['1', '2']);
    expect(grouped.get('2026-07-10')?.map((t) => t.id)).toEqual(['3']);
    expect(grouped.size).toBe(2);
  });

  it('ignores tasks without a due date', () => {
    const grouped = groupTasksByDate([{ id: '1', dueAt: null }]);
    expect(grouped.size).toBe(0);
  });
});

describe('todayDateKey', () => {
  it('returns a yyyy-mm-dd string', () => {
    expect(todayDateKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/twenty-sales-app && npx vitest run src/lib/calendarGrid.test.ts`
Expected: FAIL — cannot find module `./calendarGrid`.

- [ ] **Step 3: Implement the grid logic**

Create `packages/twenty-sales-app/src/lib/calendarGrid.ts`:

```ts
import { addJalaliMonths, getJalaliMonthLength, jalaliToGregorian } from './jalali';

export type CalendarCell = {
  key: string;
  jy: number;
  jm: number;
  jd: number;
  // local "yyyy-mm-dd" — used to bucket tasks and as the reschedule target
  dateIso: string;
  inCurrentMonth: boolean;
  isToday: boolean;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

const localDateKey = (gy: number, gm: number, gd: number): string =>
  `${gy}-${pad2(gm)}-${pad2(gd)}`;

// Afghan week: Saturday(0) .. Friday(6). JS Date#getDay() is Sun(0)..Sat(6).
const weekColumnOf = (jsDay: number): number => (jsDay + 1) % 7;

export const buildCalendarGrid = (
  cursorJy: number,
  cursorJm: number,
  todayKey: string,
): CalendarCell[] => {
  const monthLength = getJalaliMonthLength(cursorJy, cursorJm);
  const firstOfMonth = jalaliToGregorian(cursorJy, cursorJm, 1);
  const firstWeekday = weekColumnOf(
    new Date(firstOfMonth.gy, firstOfMonth.gm - 1, firstOfMonth.gd).getDay(),
  );
  const totalCells = Math.ceil((firstWeekday + monthLength) / 7) * 7;

  const prev = addJalaliMonths(cursorJy, cursorJm, -1);
  const prevLength = getJalaliMonthLength(prev.jy, prev.jm);
  const next = addJalaliMonths(cursorJy, cursorJm, 1);

  const cells: CalendarCell[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayOffset = i - firstWeekday;
    let jy: number;
    let jm: number;
    let jd: number;
    let inCurrentMonth: boolean;
    if (dayOffset < 0) {
      jy = prev.jy;
      jm = prev.jm;
      jd = prevLength + dayOffset + 1;
      inCurrentMonth = false;
    } else if (dayOffset >= monthLength) {
      jy = next.jy;
      jm = next.jm;
      jd = dayOffset - monthLength + 1;
      inCurrentMonth = false;
    } else {
      jy = cursorJy;
      jm = cursorJm;
      jd = dayOffset + 1;
      inCurrentMonth = true;
    }
    const g = jalaliToGregorian(jy, jm, jd);
    const dateIso = localDateKey(g.gy, g.gm, g.gd);
    cells.push({
      key: `${jy}-${jm}-${jd}`,
      jy,
      jm,
      jd,
      dateIso,
      inCurrentMonth,
      isToday: dateIso === todayKey,
    });
  }
  return cells;
};

export const groupTasksByDate = <T extends { dueAt: string | null }>(
  tasks: T[],
): Map<string, T[]> => {
  const map = new Map<string, T[]>();
  for (const task of tasks) {
    if (!task.dueAt) continue;
    const d = new Date(task.dueAt);
    const key = localDateKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const bucket = map.get(key);
    if (bucket) bucket.push(task);
    else map.set(key, [task]);
  }
  return map;
};

export const todayDateKey = (): string => {
  const d = new Date();
  return localDateKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/twenty-sales-app && npx vitest run src/lib/calendarGrid.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
cd /Users/rashid/Development/twentyCRM
git add packages/twenty-sales-app/src/lib/calendarGrid.ts packages/twenty-sales-app/src/lib/calendarGrid.test.ts
git commit -m "feat(sales-app): add calendar grid construction and task-by-date bucketing"
```

---

### Task 3: Fetch tasks for the calendar

**Files:**
- Modify: `packages/twenty-sales-app/src/api/records.ts`

- [ ] **Step 1: Add `fetchTasksForCalendar`**

In `packages/twenty-sales-app/src/api/records.ts`, insert the following immediately after the closing brace of `fetchMyOpenTasks` (i.e. right before `export const setTaskStatus`):

```ts
// Calendar: same task shape as fetchMyOpenTasks, but no status filter (DONE
// tasks are shown on the calendar too, styled differently) and a plain
// dueAt range instead of the today/upcoming split.
export const fetchTasksForCalendar = async (
  assigneeId: string,
  range: { fromIso: string; toIso: string },
): Promise<Task[]> => {
  const data = await coreQuery<{
    tasks: { edges: { node: Task }[] };
  }>(
    `query TasksForCalendar($filter: TaskFilterInput) {
      tasks(filter: $filter, first: 500, orderBy: [{ dueAt: AscNullsLast }]) {
        edges {
          node {
            id
            title
            status
            taskType
            dueAt
            createdAt
            bodyV2 { markdown }
            taskTargets {
              edges {
                node {
                  opportunity { id name }
                  company { id name }
                }
              }
            }
          }
        }
      }
    }`,
    {
      filter: {
        and: [
          { assigneeId: { eq: assigneeId } },
          { dueAt: { gte: range.fromIso } },
          { dueAt: { lte: range.toIso } },
        ],
      },
    },
  );

  return data.tasks.edges.map((e) => e.node);
};
```

This is a thin GraphQL-query wrapper, same shape as the six other `fetch*` functions already in this file, none of which have unit tests (they'd just be mocking the network call) — consistent with the existing convention, not a gap introduced by this plan.

- [ ] **Step 2: Typecheck**

Run: `cd packages/twenty-sales-app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/rashid/Development/twentyCRM
git add packages/twenty-sales-app/src/api/records.ts
git commit -m "feat(sales-app): add fetchTasksForCalendar API call"
```

---

### Task 4: Calendar icon and strings

**Files:**
- Modify: `packages/twenty-sales-app/src/components/icons.tsx`
- Modify: `packages/twenty-sales-app/src/lib/strings.ts`

- [ ] **Step 1: Add `IconCalendar`**

In `packages/twenty-sales-app/src/components/icons.tsx`, append at the end of the file:

```tsx
export const IconCalendar = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="7" y1="14" x2="7.01" y2="14" />
    <line x1="12" y1="14" x2="12.01" y2="14" />
    <line x1="17" y1="14" x2="17.01" y2="14" />
    <line x1="7" y1="18" x2="7.01" y2="18" />
    <line x1="12" y1="18" x2="12.01" y2="18" />
  </svg>
);
```

- [ ] **Step 2: Add calendar strings to `T2`**

In `packages/twenty-sales-app/src/lib/strings.ts`, in the `T2` object, insert before the closing `};`:

```ts

  // calendar
  calendar: 'تقویم',
  calendarPrevMonth: 'ماه قبل',
  calendarNextMonth: 'ماه بعد',
  calendarToday: 'امروز',
  calendarMore: 'بیشتر',
  calendarNoTasksOnDay: 'کاری در این روز نیست',
  calendarRescheduleFailed: 'جابه‌جایی کار ناموفق بود',
```

- [ ] **Step 3: Typecheck**

Run: `cd packages/twenty-sales-app && npx tsc --noEmit`
Expected: no errors (both files are additive; nothing references the new exports yet, which is fine — `noUnusedLocals`/`noUnusedParameters` only flag unused locals within a file, not unused exports).

- [ ] **Step 4: Commit**

```bash
cd /Users/rashid/Development/twentyCRM
git add packages/twenty-sales-app/src/components/icons.tsx packages/twenty-sales-app/src/lib/strings.ts
git commit -m "feat(sales-app): add calendar icon and UI strings"
```

---

### Task 5: `CalendarGrid` component

**Files:**
- Create: `packages/twenty-sales-app/src/components/CalendarGrid.tsx`

- [ ] **Step 1: Implement the grid component**

Create `packages/twenty-sales-app/src/components/CalendarGrid.tsx`:

```tsx
import { type Task } from '../api/records';
import { type CalendarCell } from '../lib/calendarGrid';
import { toPersianDigits } from '../lib/jalali';
import { navigate } from '../lib/router';
import { T2 } from '../lib/strings';
import { TASK_TYPE_ICONS } from '../views/TaskView';

const WEEKDAY_HEADERS = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
];

const MAX_PILLS_PER_CELL = 3;

const sortDayTasks = (tasks: Task[]): Task[] =>
  [...tasks].sort((a, b) => {
    const aDone = a.status === 'DONE';
    const bDone = b.status === 'DONE';
    if (aDone !== bDone) return aDone ? 1 : -1;
    return (a.dueAt ?? '').localeCompare(b.dueAt ?? '');
  });

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
  <div className="card cal-card anim d1">
    <div className="cal-grid cal-header-row">
      {WEEKDAY_HEADERS.map((label) => (
        <div key={label} className="cal-header-cell">
          {label}
        </div>
      ))}
    </div>
    <div className="cal-grid">
      {cells.map((cell) => {
        const dayTasks = sortDayTasks(tasksByDate.get(cell.dateIso) ?? []);
        const overflow = dayTasks.length - MAX_PILLS_PER_CELL;
        return (
          <div
            key={cell.key}
            className={[
              'cal-cell',
              cell.inCurrentMonth ? '' : 'muted',
              cell.isToday ? 'today' : '',
              selectedDate === cell.dateIso ? 'selected' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onSelectDay(cell.dateIso)}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => {
              e.preventDefault();
              const taskId = e.dataTransfer.getData('text/plain');
              if (taskId) onDropTask(taskId, cell.dateIso);
            }}
          >
            <span className="cal-day-num">{toPersianDigits(cell.jd)}</span>
            <div className="cal-pills">
              {dayTasks.slice(0, MAX_PILLS_PER_CELL).map((task) => {
                const TypeIcon = TASK_TYPE_ICONS[task.taskType ?? 'OTHER'];
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
              {overflow > 0 && (
                <span className="cal-overflow">
                  +{toPersianDigits(overflow)} {T2.calendarMore}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);
```

There's no automated test for this file — see "Note on testing scope" above. It's exercised end-to-end in Task 9.

- [ ] **Step 2: Typecheck**

Run: `cd packages/twenty-sales-app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/rashid/Development/twentyCRM
git add packages/twenty-sales-app/src/components/CalendarGrid.tsx
git commit -m "feat(sales-app): add CalendarGrid month-grid component with drag-and-drop"
```

---

### Task 6: `CalendarView` page

**Files:**
- Create: `packages/twenty-sales-app/src/views/CalendarView.tsx`

- [ ] **Step 1: Implement the page**

Create `packages/twenty-sales-app/src/views/CalendarView.tsx`:

```tsx
import { useCallback, useMemo, useState } from 'react';

import { type CurrentUser } from '../api/auth';
import { fetchTasksForCalendar, updateTask, type Task } from '../api/records';
import { CalendarGrid } from '../components/CalendarGrid';
import { IconCheck } from '../components/icons';
import { useCached } from '../lib/cache';
import { buildCalendarGrid, groupTasksByDate, todayDateKey } from '../lib/calendarGrid';
import {
  AFGHAN_MONTHS,
  addJalaliMonths,
  formatJalaliDate,
  gregorianToJalali,
  relativeDueLabel,
  toPersianDigits,
} from '../lib/jalali';
import { navigate } from '../lib/router';
import { T, T2, TASK_TYPE_LABELS } from '../lib/strings';
import { TASK_TYPE_ICONS } from './TaskView';

type CalendarViewProps = {
  user: CurrentUser;
};

const taskLead = (task: Task) => {
  const targets = task.taskTargets?.edges ?? [];
  for (const { node } of targets) {
    if (node.opportunity) return node.opportunity;
  }
  for (const { node } of targets) {
    if (node.company) return { id: null as string | null, name: node.company.name };
  }
  return null;
};

export const CalendarView = ({ user }: CalendarViewProps) => {
  const currentJalali = useMemo(() => {
    const now = new Date();
    return gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }, []);
  const [cursor, setCursor] = useState(() => ({
    jy: currentJalali.jy,
    jm: currentJalali.jm,
  }));
  const [selectedDate, setSelectedDate] = useState<string | null>(() => todayDateKey());
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [dropError, setDropError] = useState<string | null>(null);

  const cells = useMemo(
    () => buildCalendarGrid(cursor.jy, cursor.jm, todayDateKey()),
    [cursor.jy, cursor.jm],
  );

  const fetchAll = useCallback(async () => {
    const first = cells[0];
    const last = cells[cells.length - 1];
    return fetchTasksForCalendar(user.workspaceMemberId, {
      fromIso: `${first.dateIso}T00:00:00.000Z`,
      toIso: `${last.dateIso}T23:59:59.999Z`,
    });
  }, [cells, user.workspaceMemberId]);

  const { data, error, refresh } = useCached(
    `calendar:${user.workspaceMemberId}:${cursor.jy}-${cursor.jm}`,
    fetchAll,
  );

  const tasks = data ?? [];
  const effectiveTasks = useMemo(
    () =>
      tasks.map((task) =>
        overrides[task.id] ? { ...task, dueAt: overrides[task.id] } : task,
      ),
    [tasks, overrides],
  );

  const tasksByDate = useMemo(() => groupTasksByDate(effectiveTasks), [effectiveTasks]);

  const handleDropTask = useCallback(
    async (taskId: string, newDateIso: string) => {
      const task = effectiveTasks.find((t) => t.id === taskId);
      if (!task?.dueAt) return;
      const original = new Date(task.dueAt);
      const [y, m, d] = newDateIso.split('-').map(Number);
      const next = new Date(original);
      next.setFullYear(y, m - 1, d);
      const nextIso = next.toISOString();
      if (nextIso === task.dueAt) return;

      setOverrides((prev) => ({ ...prev, [taskId]: nextIso }));
      try {
        await updateTask(taskId, { dueAt: nextIso });
        await refresh();
        setOverrides((prev) => {
          const cleared = { ...prev };
          delete cleared[taskId];
          return cleared;
        });
      } catch (err) {
        setOverrides((prev) => {
          const cleared = { ...prev };
          delete cleared[taskId];
          return cleared;
        });
        setDropError(err instanceof Error ? err.message : T2.calendarRescheduleFailed);
      }
    },
    [effectiveTasks, refresh],
  );

  const goToday = () => {
    setCursor({ jy: currentJalali.jy, jm: currentJalali.jm });
    setSelectedDate(todayDateKey());
  };
  const goPrev = () => {
    setCursor((c) => addJalaliMonths(c.jy, c.jm, -1));
    setSelectedDate(null);
  };
  const goNext = () => {
    setCursor((c) => addJalaliMonths(c.jy, c.jm, 1));
    setSelectedDate(null);
  };

  const selectedTasks = selectedDate
    ? [...(tasksByDate.get(selectedDate) ?? [])].sort((a, b) =>
        (a.dueAt ?? '').localeCompare(b.dueAt ?? ''),
      )
    : [];

  const loading = data === null && error === null;

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>{T2.calendar}</h1>
          <div className="sub">
            {AFGHAN_MONTHS[cursor.jm - 1]} {toPersianDigits(cursor.jy)}
          </div>
        </div>
        <div className="cal-nav">
          <button className="btn line sm" onClick={goPrev}>
            {T2.calendarPrevMonth}
          </button>
          <button className="btn line sm" onClick={goToday}>
            {T2.calendarToday}
          </button>
          <button className="btn line sm" onClick={goNext}>
            {T2.calendarNextMonth}
          </button>
        </div>
      </div>

      {error !== null && <div className="error-banner">{error}</div>}
      {dropError !== null && <div className="error-banner">{dropError}</div>}

      {loading ? (
        <div className="skeleton" style={{ height: 480 }} />
      ) : (
        <CalendarGrid
          cells={cells}
          tasksByDate={tasksByDate}
          selectedDate={selectedDate}
          onSelectDay={setSelectedDate}
          onDropTask={handleDropTask}
        />
      )}

      {selectedDate && (
        <div className="card anim d2" style={{ marginTop: 16 }}>
          <div className="card-pad" style={{ paddingBottom: 6 }}>
            <h3>
              {formatJalaliDate(`${selectedDate}T12:00:00`)}{' '}
              <span className="num" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>
                ({toPersianDigits(selectedTasks.length)})
              </span>
            </h3>
          </div>
          {selectedTasks.length === 0 ? (
            <div className="empty-state">{T2.calendarNoTasksOnDay}</div>
          ) : (
            selectedTasks.map((task) => {
              const lead = taskLead(task);
              const TypeIcon = TASK_TYPE_ICONS[task.taskType ?? 'OTHER'] ?? IconCheck;
              return (
                <div className="task" key={task.id}>
                  <span
                    className="chk"
                    style={
                      task.status === 'DONE'
                        ? {
                            background: 'var(--ok-bg)',
                            borderColor: 'var(--ok)',
                            color: 'var(--ok)',
                            cursor: 'default',
                          }
                        : { cursor: 'default', color: 'transparent' }
                    }
                  >
                    <IconCheck size={13} />
                  </span>
                  <div className="t-main" onClick={() => navigate(`/task/${task.id}`)}>
                    <div
                      className="t-title"
                      style={{ display: 'flex', alignItems: 'center', gap: 7 }}
                    >
                      <span
                        style={{
                          color: 'var(--lapis-600)',
                          display: 'inline-flex',
                          flexShrink: 0,
                        }}
                      >
                        <TypeIcon size={14} />
                      </span>
                      {task.title}
                    </div>
                    <div className="t-sub">
                      {task.taskType && (
                        <span className="pill stage" style={{ fontSize: 10.5, padding: '1px 8px' }}>
                          {TASK_TYPE_LABELS[task.taskType]}
                        </span>
                      )}
                      {lead ? <span className="lead-chip">{lead.name}</span> : <span>{T.noLead}</span>}
                    </div>
                  </div>
                  <span className="due later">{relativeDueLabel(task.dueAt)}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </main>
  );
};
```

No automated test for this file — see "Note on testing scope" above. Verified manually in Task 9.

- [ ] **Step 2: Typecheck**

Run: `cd packages/twenty-sales-app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/rashid/Development/twentyCRM
git add packages/twenty-sales-app/src/views/CalendarView.tsx
git commit -m "feat(sales-app): add CalendarView page"
```

---

### Task 7: Wire up navigation

**Files:**
- Modify: `packages/twenty-sales-app/src/components/Shell.tsx`
- Modify: `packages/twenty-sales-app/src/App.tsx`

- [ ] **Step 1: Add the nav tab and dock fallback in `Shell.tsx`**

In `packages/twenty-sales-app/src/components/Shell.tsx`, update the icons import — change:
```ts
import {
  IconChart,
  IconChevronDown,
  IconDashboard,
  IconFlame,
  IconLeads,
  IconLogout,
  IconMoon,
  IconPlus,
  IconSearch,
  IconSun,
  IconTasks,
} from './icons';
```
to:
```ts
import {
  IconCalendar,
  IconChart,
  IconChevronDown,
  IconDashboard,
  IconFlame,
  IconLeads,
  IconLogout,
  IconMoon,
  IconPlus,
  IconSearch,
  IconSun,
  IconTasks,
} from './icons';
```

Update `routeDockDefaults` — change:
```ts
  if (section === 'lead') return { label: T.lead, kind: 'lead' };
  if (section === 'task') return { label: T.task, kind: 'task' };
  if (section === 'new') return { label: T.newLead, kind: 'new' };
  if (section === 'reports') return { label: T2.reports, kind: 'page' };
  if (section === 'leads') return { label: T.leads, kind: 'page' };
  if (section === 'tasks') return { label: 'کارها', kind: 'page' };
  return { label: T.tabToday, kind: 'page' };
```
to:
```ts
  if (section === 'lead') return { label: T.lead, kind: 'lead' };
  if (section === 'task') return { label: T.task, kind: 'task' };
  if (section === 'new') return { label: T.newLead, kind: 'new' };
  if (section === 'reports') return { label: T2.reports, kind: 'page' };
  if (section === 'leads') return { label: T.leads, kind: 'page' };
  if (section === 'tasks') return { label: 'کارها', kind: 'page' };
  if (section === 'calendar') return { label: T2.calendar, kind: 'page' };
  return { label: T.tabToday, kind: 'page' };
```

Update the `NAV` array — change:
```ts
const NAV = [
  { key: 'today', label: T.tabToday, icon: IconDashboard },
  { key: 'tasks', label: 'کارها', icon: IconTasks },
  { key: 'leads', label: T.tabLeads, icon: IconLeads },
  { key: 'reports', label: T2.reports, icon: IconChart },
  { key: 'competitors', label: 'رقبا', icon: IconFlame },
  { key: 'admin', label: 'کاربران', icon: IconLeads },
] as const;
```
to:
```ts
const NAV = [
  { key: 'today', label: T.tabToday, icon: IconDashboard },
  { key: 'calendar', label: T2.calendar, icon: IconCalendar },
  { key: 'tasks', label: 'کارها', icon: IconTasks },
  { key: 'leads', label: T.tabLeads, icon: IconLeads },
  { key: 'reports', label: T2.reports, icon: IconChart },
  { key: 'competitors', label: 'رقبا', icon: IconFlame },
  { key: 'admin', label: 'کاربران', icon: IconLeads },
] as const;
```

- [ ] **Step 2: Add the route in `App.tsx`**

In `packages/twenty-sales-app/src/App.tsx`, add the import — change:
```ts
import { AdminView } from './views/AdminView';
import { CompetitorsView } from './views/CompetitorsView';
```
to:
```ts
import { AdminView } from './views/AdminView';
import { CalendarView } from './views/CalendarView';
import { CompetitorsView } from './views/CompetitorsView';
```

Add the route branch — change:
```ts
  } else if (section === 'tasks') {
    view = <TasksView user={user} />;
  } else if (section === 'note' && param) {
```
to:
```ts
  } else if (section === 'tasks') {
    view = <TasksView user={user} />;
  } else if (section === 'calendar') {
    view = <CalendarView user={user} />;
  } else if (section === 'note' && param) {
```

- [ ] **Step 3: Typecheck**

Run: `cd packages/twenty-sales-app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/rashid/Development/twentyCRM
git add packages/twenty-sales-app/src/components/Shell.tsx packages/twenty-sales-app/src/App.tsx
git commit -m "feat(sales-app): wire up the calendar nav tab and route"
```

---

### Task 8: Calendar styling

**Files:**
- Modify: `packages/twenty-sales-app/src/styles.css`

- [ ] **Step 1: Append calendar styles**

Append the following block to the end of `packages/twenty-sales-app/src/styles.css`:

```css

/* ============ calendar ============ */

.cal-nav {
  display: flex;
  gap: 8px;
}

.cal-card {
  overflow: hidden;
  padding: 0;
}

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  background: var(--line-soft);
}

.cal-header-row {
  border-bottom: 1px solid var(--line);
}

.cal-header-cell {
  background: var(--card);
  padding: 10px 8px;
  text-align: center;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--ink-3);
}

.cal-cell {
  background: var(--card);
  min-height: 96px;
  padding: 6px 6px 8px;
  cursor: pointer;
  transition: background 0.12s;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cal-cell:hover {
  background: var(--lapis-50);
}

.cal-cell.muted {
  background: var(--line-soft);
}

.cal-cell.muted .cal-day-num {
  color: var(--ink-3);
}

.cal-cell.today .cal-day-num {
  background: var(--lapis-600);
  color: #fff;
}

.cal-cell.selected {
  box-shadow: inset 0 0 0 2px var(--lapis-600);
}

.cal-day-num {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}

.cal-pills {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.cal-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--lapis-100);
  color: var(--lapis-800);
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 10.5px;
  font-weight: 650;
  cursor: grab;
  overflow: hidden;
}

.cal-pill svg {
  flex-shrink: 0;
  width: 11px;
  height: 11px;
}

.cal-pill-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cal-pill.done {
  background: var(--ok-bg);
  color: var(--ok);
  text-decoration: line-through;
  opacity: 0.75;
}

.cal-overflow {
  font-size: 10px;
  color: var(--ink-3);
  font-weight: 650;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/rashid/Development/twentyCRM
git add packages/twenty-sales-app/src/styles.css
git commit -m "style(sales-app): add calendar grid styles"
```

---

### Task 9: Manual verification

No automated coverage for rendering/drag-drop — see "Note on testing scope" above. Verify by hand against local dev.

- [ ] **Step 1: Run the full Vitest suite**

Run: `cd packages/twenty-sales-app && npx vitest run`
Expected: all tests from Tasks 1–2 pass (no regressions).

- [ ] **Step 2: Full typecheck + build**

Run: `cd packages/twenty-sales-app && npm run build`
Expected: `tsc --noEmit` passes, `vite build` succeeds, `dist/` is produced.

- [ ] **Step 3: Start the dev server and load the calendar**

Use the `sales-app` launch config (Vite on port 3012, proxying to local `twenty-server` on 3010 per `.claude/launch.json`). Start `twenty-server` first if it isn't already running (`npx nx start twenty-server`), then start `sales-app`.

In the browser preview:
1. Log in (تیم / tim@apple.dev per the standard dev credentials).
2. Click "تقویم" in the sidebar nav. Confirm the month grid renders with the current Jalali month, Saturday through Friday columns, and today's cell highlighted.
3. Confirm any existing tasks with a `dueAt` in the visible month show up as pills on the correct day, with the correct task-type icon.

- [ ] **Step 4: Verify DONE-task styling and the day-agenda panel**

1. Pick a day cell with at least one task (create one via an existing lead's "کارها" flow if none exist, e.g. through `TaskView`/`NewLeadView` — due today, type CALL). Confirm it appears as a pill on today's cell.
2. Mark a task DONE from the "کارها" tab, return to "تقویم", confirm that day's pill now renders with the `.cal-pill.done` styling (strikethrough, green-tinted).
3. Click a day cell with tasks (not a pill). Confirm the agenda panel below the grid updates to show that day's full task list.
4. Click a task row inside the agenda panel. Confirm it navigates to `/task/:id` (TaskView).

- [ ] **Step 5: Verify drag-and-drop reschedule**

1. Go back to "تقویم". Drag a task pill from one day cell to a different day cell in the same month.
2. Confirm the pill visually moves to the new day immediately (optimistic update).
3. Use `preview_network` (or the Postgres MCP against the local workspace DB) to confirm the task's `dueAt` was actually updated server-side, and that the **time-of-day** component is unchanged — only the date moved.
4. Reload the page. Confirm the pill is still on the new day (i.e. the change persisted, not just an optimistic artifact).

- [ ] **Step 6: Trace the reschedule-failure rollback path**

The optimistic-move-then-rollback code in `handleDropTask` (Task 6) isn't
practically reproducible through the browser preview (it needs a real
network failure mid-drag). Instead, confirm it by reading the code: the
`catch` block deletes the same `overrides[taskId]` entry the `try` block set,
so a failed `updateTask` leaves the task's rendered `dueAt` back at its
original value, and `setDropError` surfaces the existing `.error-banner`
pattern already used for `markDone` failures in `TodayView`/`TasksView`. Note
in your final report that this was verified by code trace, not live repro.

- [ ] **Step 7: Verify month navigation**

1. Click "ماه بعد" (next month) and "ماه قبل" (previous month) a few times. Confirm the header's month/year label updates and the grid re-renders correctly at month boundaries (e.g. crossing from حوت into حمل).
2. Click "امروز" (today). Confirm it returns to the current month with today's cell selected and its agenda shown.

- [ ] **Step 8: Verify the dock-minimize integration**

Click the minimize chevron in the command bar while on "تقویم". Confirm it collapses to the dock at the bottom with the "تقویم" label, and clicking the dock chip restores it.

- [ ] **Step 9: Take a final screenshot for the record**

Use `preview_screenshot` to capture the finished calendar view (grid + agenda panel) for confirmation.

---

### Task 10: Final review pass

- [ ] **Step 1: Re-run everything once more end to end**

```bash
cd packages/twenty-sales-app
npx vitest run
npx tsc --noEmit
```
Expected: all green, no type errors.

- [ ] **Step 2: Review the diff against the design spec**

Read back `docs/superpowers/specs/2026-07-09-sales-app-calendar-design.md` and confirm every "Scope" and "Components" bullet has a corresponding change in the diff. Confirm the "Deferred" items (team switcher, touch drag-and-drop, week/agenda toggle) were genuinely not built.

- [ ] **Step 3: Update the sales-app-spa memory note (if using the memory system)**

Not a code change — a note for whoever picks this up next: the calendar view exists at `#/calendar`, uses Vitest (new to this package) for the Jalali/grid math, and reschedule is desktop-drag-only. No prod deploy is included in this plan — that's a separate, explicit step per the existing deploy process (`tools/sales-crm/DEPLOY-TO-PRODUCTION.md` / rebuild-and-scp routine), same as prior sales-app features.
