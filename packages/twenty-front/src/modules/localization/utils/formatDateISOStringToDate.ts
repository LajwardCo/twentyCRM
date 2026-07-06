import { type CalendarSystem } from '@/localization/constants/CalendarSystem';
import { type DateFormat } from '@/localization/constants/DateFormat';
import { formatPlainDateISOString } from '@/localization/utils/formatPlainDateISOString';
import { formatInTimeZoneWithCalendarSystem } from '@/localization/utils/jalali/formatWithCalendarSystem';
import { type Locale } from 'date-fns';
import { isDateWithoutTime } from 'twenty-shared/utils';

export const formatDateISOStringToDate = ({
  date,
  timeZone,
  dateFormat,
  localeCatalog,
  calendarSystem,
}: {
  date: string;
  timeZone: string;
  dateFormat: DateFormat;
  localeCatalog?: Locale;
  calendarSystem?: CalendarSystem;
}) => {
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
};
