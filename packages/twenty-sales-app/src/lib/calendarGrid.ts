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
