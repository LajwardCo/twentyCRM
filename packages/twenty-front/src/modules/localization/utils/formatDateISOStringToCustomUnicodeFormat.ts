import { type CalendarSystem } from '@/localization/constants/CalendarSystem';
import { formatPlainDateISOString } from '@/localization/utils/formatPlainDateISOString';
import { formatInTimeZoneWithCalendarSystem } from '@/localization/utils/jalali/formatWithCalendarSystem';
import { type Locale } from 'date-fns';
import { isDateWithoutTime } from 'twenty-shared/utils';

export const formatDateISOStringToCustomUnicodeFormat = ({
  date,
  timeZone,
  dateFormat,
  localeCatalog,
  calendarSystem,
}: {
  date: string;
  timeZone: string;
  dateFormat: string;
  localeCatalog: Locale;
  calendarSystem?: CalendarSystem;
}) => {
  try {
    if (isDateWithoutTime(date)) {
      return formatPlainDateISOString({
        date,
        dateFormat,
        localeCatalog,
        calendarSystem,
      });
    }

    return formatInTimeZoneWithCalendarSystem({
      date: new Date(date),
      timeZone,
      formatString: dateFormat,
      localeCatalog,
      calendarSystem,
    });
  } catch {
    return 'Invalid format string';
  }
};
