import { type Locale } from 'date-fns';

import { type CalendarSystem } from '@/localization/constants/CalendarSystem';
import { type DateFormat } from '@/localization/constants/DateFormat';
import { formatDateISOStringToCustomUnicodeFormat } from '@/localization/utils/formatDateISOStringToCustomUnicodeFormat';
import { formatDateISOStringToDate } from '@/localization/utils/formatDateISOStringToDate';
import { formatDateISOStringToRelativeDate } from '@/localization/utils/formatDateISOStringToRelativeDate';
import {
  FieldDateDisplayFormat,
  type FieldDateMetadataSettings,
} from '@/object-record/record-field/ui/types/FieldMetadata';
import { isDefined } from 'twenty-shared/utils';

export const formatDateString = ({
  value,
  timeZone,
  dateFormat,
  dateFieldSettings,
  localeCatalog,
  calendarSystem,
}: {
  timeZone: string;
  dateFormat: DateFormat;
  value?: string | null;
  dateFieldSettings?: FieldDateMetadataSettings;
  localeCatalog: Locale;
  calendarSystem?: CalendarSystem;
}): string => {
  if (!isDefined(value)) {
    return '';
  }

  switch (dateFieldSettings?.displayFormat) {
    case FieldDateDisplayFormat.RELATIVE:
      return formatDateISOStringToRelativeDate({
        isoDate: value,
        isDayMaximumPrecision: true,
        localeCatalog,
        timeZone,
      });
    case FieldDateDisplayFormat.USER_SETTINGS:
      return formatDateISOStringToDate({
        date: value,
        timeZone,
        dateFormat,
        localeCatalog,
        calendarSystem,
      });
    case FieldDateDisplayFormat.CUSTOM:
      return formatDateISOStringToCustomUnicodeFormat({
        date: value,
        timeZone,
        dateFormat: dateFieldSettings.customUnicodeDateFormat,
        localeCatalog,
        calendarSystem,
      });
    default:
      return formatDateISOStringToDate({
        date: value,
        timeZone,
        dateFormat,
        localeCatalog,
        calendarSystem,
      });
  }
};
