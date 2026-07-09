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
