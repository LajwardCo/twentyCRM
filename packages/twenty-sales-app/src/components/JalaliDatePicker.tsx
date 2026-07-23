import { useEffect, useRef, useState } from 'react';

import { buildCalendarGrid, todayDateKey } from '../lib/calendarGrid';
import {
  AFGHAN_MONTHS,
  addJalaliMonths,
  gregorianToJalali,
  toPersianDigits,
} from '../lib/jalali';
import { IconCalendar, IconChevronLeft, IconChevronRight } from './icons';

// Afghan week header, Saturday-first — matches CalendarGrid.
const WEEKDAY_HEADERS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

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

type JalaliDatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  withTime?: boolean;
  id?: string;
  className?: string;
};

// Drop-in replacement for <input type="date" | "datetime-local">: same local
// "yyyy-mm-dd[Thh:mm]" string in/out, but the calendar popover shows the
// Afghan (Hijri Shamsi) month instead of the browser's Gregorian one.
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

  // Grid cursor: the Jalali month currently shown. Follows the selected date.
  const cursorSeed = date || todayDateKey();
  const [seedGy, seedGm, seedGd] = cursorSeed.split('-').map(Number);
  const seedJalali = gregorianToJalali(seedGy, seedGm, seedGd);
  const [cursor, setCursor] = useState({ jy: seedJalali.jy, jm: seedJalali.jm });

  // Re-seed the cursor whenever the popover is (re)opened, so it always lands
  // on the month of the current value.
  useEffect(() => {
    if (open) setCursor({ jy: seedJalali.jy, jm: seedJalali.jm });
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

  const cells = buildCalendarGrid(cursor.jy, cursor.jm, todayDateKey());

  const pickDay = (dateIso: string) => {
    onChange(withTime ? `${dateIso}T${time || '09:00'}` : dateIso);
    if (!withTime) setOpen(false);
  };

  const setTime = (newTime: string) => {
    onChange(`${date || todayDateKey()}T${newTime}`);
  };

  const triggerLabel = date
    ? `${jalaliLabel(date)}${withTime && time ? ` — ${toPersianDigits(time)}` : ''}`
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
        <span>{triggerLabel}</span>
      </button>

      {open && (
        <div className="jdp-pop">
          <div className="jdp-nav">
            <button
              type="button"
              className="jdp-navbtn"
              aria-label="ماه قبل"
              onClick={() => setCursor((c) => addJalaliMonths(c.jy, c.jm, -1))}
            >
              <IconChevronRight size={16} />
            </button>
            <span className="jdp-title">
              {AFGHAN_MONTHS[cursor.jm - 1]} {toPersianDigits(cursor.jy)}
            </span>
            <button
              type="button"
              className="jdp-navbtn"
              aria-label="ماه بعد"
              onClick={() => setCursor((c) => addJalaliMonths(c.jy, c.jm, 1))}
            >
              <IconChevronLeft size={16} />
            </button>
          </div>

          <div className="jdp-grid jdp-head">
            {WEEKDAY_HEADERS.map((label, i) => (
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
                {toPersianDigits(cell.jd)}
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
        </div>
      )}
    </div>
  );
};
