import { useEffect, useRef, useState } from 'react';

import {
  addGregorianMonths,
  buildCalendarGrid,
  buildGregorianCalendarGrid,
  type CalendarKind,
  GREGORIAN_MONTHS,
  todayDateKey,
} from '../lib/calendarGrid';
import {
  AFGHAN_MONTHS,
  addJalaliMonths,
  gregorianToJalali,
  jalaliToGregorian,
  toPersianDigits,
} from '../lib/jalali';
import { loadPrefs, savePref } from '../lib/prefs';
import { IconCalendar, IconChevronLeft, IconChevronRight } from './icons';

// Afghan week header, Saturday-first — matches CalendarGrid. The Gregorian
// view keeps the same Saturday-first columns (it is still an Afghan week),
// only the labels change.
const WEEKDAY_HEADERS: Record<CalendarKind, string[]> = {
  jalali: ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'],
  gregorian: ['Sa', 'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr'],
};

const CALENDAR_LABELS: Record<CalendarKind, string> = {
  jalali: 'شمسی',
  gregorian: 'میلادی',
};

// A datetime-local value looks like "yyyy-mm-ddThh:mm"; a date value is just
// "yyyy-mm-dd". Split so the two halves can be edited independently.
const splitValue = (value: string): { date: string; time: string } => {
  const [date, time] = value.split('T');
  return { date: date ?? '', time: time ?? '' };
};

const jalaliLabel = (dateIso: string): string => {
  if (!dateIso) return '';
  const [gy, gm, gd] = dateIso.split('-').map(Number);
  if (!gy || !gm || !gd) return '';
  const { jy, jm, jd } = gregorianToJalali(gy, gm, gd);
  return `${toPersianDigits(jd)} ${AFGHAN_MONTHS[jm - 1]} ${toPersianDigits(jy)}`;
};

const gregorianLabel = (dateIso: string): string => {
  if (!dateIso) return '';
  const [gy, gm, gd] = dateIso.split('-').map(Number);
  if (!gy || !gm || !gd) return '';
  return `${gd} ${GREGORIAN_MONTHS[gm - 1].slice(0, 3)} ${gy}`;
};

// One cursor shape for both calendars: the (year, month) being shown, in the
// calendar being shown. Switching converts the cursor so the seller stays on
// the same stretch of days rather than jumping to a different month.
type Cursor = { y: number; m: number };

const cursorFor = (kind: CalendarKind, dateIso: string): Cursor => {
  const [gy, gm, gd] = dateIso.split('-').map(Number);
  if (kind === 'gregorian') return { y: gy, m: gm };
  const { jy, jm } = gregorianToJalali(gy, gm, gd);
  return { y: jy, m: jm };
};

const convertCursor = (from: CalendarKind, cursor: Cursor): Cursor => {
  // The 1st of the shown month, expressed in the other calendar.
  if (from === 'jalali') {
    const g = jalaliToGregorian(cursor.y, cursor.m, 1);
    return { y: g.gy, m: g.gm };
  }
  const j = gregorianToJalali(cursor.y, cursor.m, 1);
  return { y: j.jy, m: j.jm };
};

type JalaliDatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  withTime?: boolean;
  id?: string;
  className?: string;
};

// Drop-in replacement for <input type="date" | "datetime-local">: same local
// "yyyy-mm-dd[Thh:mm]" string in/out, but the calendar popover shows the
// Afghan (Hijri Shamsi) month by default, with a switch at the bottom to view
// and pick in the Gregorian calendar instead. The choice is remembered.
export const JalaliDatePicker = ({
  value,
  onChange,
  withTime = true,
  id,
  className,
}: JalaliDatePickerProps) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { date, time } = splitValue(value);
  const [calendar, setCalendar] = useState<CalendarKind>(() => loadPrefs().calendar);

  // Grid cursor: the month currently shown. Follows the selected date.
  const cursorSeed = date || todayDateKey();
  const [cursor, setCursor] = useState<Cursor>(() => cursorFor(calendar, cursorSeed));

  // Re-seed the cursor whenever the popover is (re)opened, so it always lands
  // on the month of the current value.
  useEffect(() => {
    if (open) setCursor(cursorFor(calendar, cursorSeed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const switchCalendar = (next: CalendarKind) => {
    if (next === calendar) return;
    // Land on the month that holds the picked day, so the selection stays in
    // view; with nothing picked, keep the stretch of days being looked at.
    setCursor(date ? cursorFor(next, date) : convertCursor(calendar, cursor));
    setCalendar(next);
    savePref('calendar', next);
  };

  const cells =
    calendar === 'jalali'
      ? buildCalendarGrid(cursor.y, cursor.m, todayDateKey())
      : buildGregorianCalendarGrid(cursor.y, cursor.m, todayDateKey());

  const moveMonth = (delta: number) =>
    setCursor((c) => {
      if (calendar === 'jalali') {
        const j = addJalaliMonths(c.y, c.m, delta);
        return { y: j.jy, m: j.jm };
      }
      const g = addGregorianMonths(c.y, c.m, delta);
      return { y: g.gy, m: g.gm };
    });

  const digits = (n: number | string) =>
    calendar === 'jalali' ? toPersianDigits(n) : String(n);

  const title =
    calendar === 'jalali'
      ? `${AFGHAN_MONTHS[cursor.m - 1]} ${toPersianDigits(cursor.y)}`
      : `${GREGORIAN_MONTHS[cursor.m - 1]} ${cursor.y}`;

  const pickDay = (dateIso: string) => {
    onChange(withTime ? `${dateIso}T${time || '09:00'}` : dateIso);
    if (!withTime) setOpen(false);
  };

  const setTime = (newTime: string) => {
    onChange(`${date || todayDateKey()}T${newTime}`);
  };

  const dateLabel = calendar === 'jalali' ? jalaliLabel(date) : gregorianLabel(date);
  const triggerLabel = date
    ? `${dateLabel}${withTime && time ? ` — ${digits(time)}` : ''}`
    : 'انتخاب تاریخ';

  return (
    <div className={`jdp ${className ?? ''}`} ref={wrapRef}>
      <button
        type="button"
        id={id}
        className={`jdp-trigger ${date ? '' : 'empty'}`}
        onClick={() => setOpen((v) => !v)}
      >
        <IconCalendar size={15} />
        <span dir={calendar === 'gregorian' && date ? 'ltr' : undefined}>{triggerLabel}</span>
      </button>

      {open && (
        <div className="jdp-pop">
          <div className="jdp-nav">
            <button
              type="button"
              className="jdp-navbtn"
              aria-label="ماه قبل"
              onClick={() => moveMonth(-1)}
            >
              <IconChevronRight size={16} />
            </button>
            <span className="jdp-title" dir={calendar === 'gregorian' ? 'ltr' : undefined}>
              {title}
            </span>
            <button
              type="button"
              className="jdp-navbtn"
              aria-label="ماه بعد"
              onClick={() => moveMonth(1)}
            >
              <IconChevronLeft size={16} />
            </button>
          </div>

          <div className="jdp-grid jdp-head">
            {WEEKDAY_HEADERS[calendar].map((label, i) => (
              <div key={i} className="jdp-hcell">
                {label}
              </div>
            ))}
          </div>
          <div className="jdp-grid">
            {cells.map((cell) => (
              <button
                type="button"
                key={cell.key}
                className={[
                  'jdp-cell',
                  cell.inCurrentMonth ? '' : 'muted',
                  cell.isToday ? 'today' : '',
                  cell.dateIso === date ? 'selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => pickDay(cell.dateIso)}
              >
                {digits(cell.day)}
              </button>
            ))}
          </div>

          {withTime && (
            <div className="jdp-time">
              <span>ساعت</span>
              <input
                type="time"
                dir="ltr"
                value={time || '09:00'}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          )}

          {/* Calendar switch. The picked value is the same local ISO date
              either way; only the view changes. */}
          <div className="jdp-foot" role="radiogroup" aria-label="تقویم">
            {(['jalali', 'gregorian'] as CalendarKind[]).map((kind) => (
              <button
                type="button"
                key={kind}
                role="radio"
                aria-checked={calendar === kind}
                className={`jdp-seg ${calendar === kind ? 'on' : ''}`}
                onClick={() => switchCalendar(kind)}
                data-testid={`jdp-calendar-${kind}`}
              >
                {CALENDAR_LABELS[kind]}
              </button>
            ))}
            {date && (
              <span className="jdp-alt" dir="ltr">
                {calendar === 'jalali' ? gregorianLabel(date) : jalaliLabel(date)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
