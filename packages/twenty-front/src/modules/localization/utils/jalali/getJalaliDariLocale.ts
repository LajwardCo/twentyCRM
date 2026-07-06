import { DARI_MONTH_NAMES } from '@/localization/utils/jalali/jalaliCalendarLabels';
import { type Locale } from 'date-fns-jalali';
import { faIR as faIRJalali } from 'date-fns-jalali/locale';

// The Jalali calendar is identical to the Iranian one, but Afghanistan uses the
// older Zodiac-based month names (Hamal, Sawr, ...) instead of the Iranian names
// (Farvardin, Ordibehesht, ...). date-fns-jalali ships only the Iranian names,
// so we reuse the Iranian locale for everything (weekday names, era, ordinal,
// Eastern-Arabic digits — all shared with Dari) and only swap the month names.
export const jalaliDariLocale: Locale = {
  ...faIRJalali,
  localize: {
    ...faIRJalali.localize,
    month: (monthIndex: number) => DARI_MONTH_NAMES[monthIndex],
  },
};
