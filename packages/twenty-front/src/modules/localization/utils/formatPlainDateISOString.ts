import { type CalendarSystem } from '@/localization/constants/CalendarSystem';
import { formatLocalDateWithCalendarSystem } from '@/localization/utils/jalali/formatWithCalendarSystem';
import { format, type Locale } from 'date-fns';
import { Temporal } from 'temporal-polyfill';

export const formatPlainDateISOString = ({
  date,
  dateFormat,
  localeCatalog,
  calendarSystem,
}: {
  date: string;
  dateFormat: string;
  localeCatalog?: Locale;
  calendarSystem?: CalendarSystem;
}) => {
  const plainDate = Temporal.PlainDate.from(date);

  return formatLocalDateWithCalendarSystem({
    date: new Date(plainDate.year, plainDate.month - 1, plainDate.day),
    formatString: dateFormat,
    localeCatalog,
    calendarSystem,
    format,
  });
};
