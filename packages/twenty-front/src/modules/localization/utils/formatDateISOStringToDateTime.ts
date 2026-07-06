import { type CalendarSystem } from '@/localization/constants/CalendarSystem';
import { type DateFormat } from '@/localization/constants/DateFormat';
import { type TimeFormat } from '@/localization/constants/TimeFormat';
import { formatInTimeZoneWithCalendarSystem } from '@/localization/utils/jalali/formatWithCalendarSystem';
import { isValid, type Locale } from 'date-fns';

export const formatDateISOStringToDateTime = ({
  date,
  timeZone,
  dateFormat,
  timeFormat,
  localeCatalog,
  calendarSystem,
}: {
  date: string;
  timeZone: string;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  localeCatalog: Locale;
  calendarSystem?: CalendarSystem;
}) => {
  const parsedDate = new Date(date);

  if (!isValid(parsedDate)) {
    return '';
  }

  return formatInTimeZoneWithCalendarSystem({
    date: parsedDate,
    timeZone,
    formatString: `${dateFormat} ${timeFormat}`,
    localeCatalog,
    calendarSystem,
  });
};
