import {
  addJalaliMonths,
  getJalaliMonthLength,
  gregorianToJalali,
  jalaliToGregorian,
} from './jalali';

export type CalendarCell = {
  key: string;
  jy: number;
  jm: number;
  jd: number;
  // The day number to draw in whichever calendar the grid was built for:
  // jd for a Jalali grid, the Gregorian day for a Gregorian one.
  day: number;
  // local "yyyy-mm-dd" — used to bucket tasks and as the reschedule target
  dateIso: string;
  inCurrentMonth: boolean;
  isToday: boolean;
};

export type CalendarKind = 'jalali' | 'gregorian';

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
      day: jd,
      dateIso,
      inCurrentMonth,
      isToday: dateIso === todayKey,
    });
  }
  return cells;
};

export const GREGORIAN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const addGregorianMonths = (
  gy: number,
  gm: number,
  delta: number,
): { gy: number; gm: number } => {
  const index = gy * 12 + (gm - 1) + delta;
  return { gy: Math.floor(index / 12), gm: (index % 12) + 1 };
};

// Same Saturday-first week and the same cell shape as the Jalali grid, so the
// picker draws either calendar with one renderer; only the month cursor and
// the day numbers differ.
export const buildGregorianCalendarGrid = (
  cursorGy: number,
  cursorGm: number,
  todayKey: string,
): CalendarCell[] => {
  const monthLength = new Date(cursorGy, cursorGm, 0).getDate();
  const firstWeekday = weekColumnOf(new Date(cursorGy, cursorGm - 1, 1).getDay());
  const totalCells = Math.ceil((firstWeekday + monthLength) / 7) * 7;

  const cells: CalendarCell[] = [];
  for (let i = 0; i < totalCells; i++) {
    // Date arithmetic rolls month/year boundaries for us.
    const d = new Date(cursorGy, cursorGm - 1, 1 + (i - firstWeekday));
    const gy = d.getFullYear();
    const gm = d.getMonth() + 1;
    const gd = d.getDate();
    const { jy, jm, jd } = gregorianToJalali(gy, gm, gd);
    const dateIso = localDateKey(gy, gm, gd);
    cells.push({
      key: `${jy}-${jm}-${jd}`,
      jy,
      jm,
      jd,
      day: gd,
      dateIso,
      inCurrentMonth: gm === cursorGm && gy === cursorGy,
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
    if (Number.isNaN(d.getTime())) continue;
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
