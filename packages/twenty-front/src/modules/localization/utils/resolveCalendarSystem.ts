import { CalendarSystem } from '@/localization/constants/CalendarSystem';

// SYSTEM is treated as Gregorian: the calendar is opt-in and not derived from
// the browser locale or the UI language.
export const resolveCalendarSystem = (
  calendarSystem: CalendarSystem,
): CalendarSystem => {
  if (calendarSystem === CalendarSystem.SYSTEM) {
    return CalendarSystem.GREGORIAN;
  }

  return calendarSystem;
};
