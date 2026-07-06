import { CalendarSystem } from '@/localization/constants/CalendarSystem';
import { jalaliDariLocale } from '@/localization/utils/jalali/getJalaliDariLocale';
import { type Locale } from 'date-fns';
import { format as formatJalali } from 'date-fns-jalali';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

// Formats an instant (a point in time) in the given time zone, using either the
// Gregorian or Jalali calendar. For Jalali we shift the instant to the target
// time zone's wall clock with `toZonedTime` and then format with date-fns-jalali
// (which reads the Date's local fields), since date-fns-tz has no Jalali variant.
export const formatInTimeZoneWithCalendarSystem = ({
  date,
  timeZone,
  formatString,
  localeCatalog,
  calendarSystem,
}: {
  date: Date;
  timeZone: string;
  formatString: string;
  localeCatalog?: Locale;
  calendarSystem?: CalendarSystem;
}): string => {
  if (calendarSystem === CalendarSystem.JALALI) {
    return formatJalali(toZonedTime(date, timeZone), formatString, {
      locale: jalaliDariLocale,
    });
  }

  return formatInTimeZone(date, timeZone, formatString, {
    locale: localeCatalog,
  });
};

// Formats a Date whose local fields already carry the wall-clock value to show
// (e.g. a plain calendar date with no time zone), using the selected calendar.
export const formatLocalDateWithCalendarSystem = ({
  date,
  formatString,
  localeCatalog,
  calendarSystem,
  format,
}: {
  date: Date;
  formatString: string;
  localeCatalog?: Locale;
  calendarSystem?: CalendarSystem;
  // Gregorian formatter injected by the caller (date-fns `format`) to avoid a
  // second import of the Gregorian `format` in this module.
  format: (
    date: Date,
    formatString: string,
    options?: { locale?: Locale },
  ) => string;
}): string => {
  if (calendarSystem === CalendarSystem.JALALI) {
    return formatJalali(date, formatString, { locale: jalaliDariLocale });
  }

  return format(date, formatString, { locale: localeCatalog });
};
