// Afghan Solar Hijri (Dari) month names, indexed by Jalali month (0 = Hamal).
export const DARI_MONTH_NAMES = [
  'حمل',
  'ثور',
  'جوزا',
  'سرطان',
  'اسد',
  'سنبله',
  'میزان',
  'عقرب',
  'قوس',
  'جدی',
  'دلو',
  'حوت',
] as const;

// Weekday names indexed by JS getDay() (0 = Sunday .. 6 = Saturday). Shared
// between Iranian Persian and Dari.
export const PERSIAN_WEEKDAY_SHORT_NAMES = [
  'ی',
  'د',
  'س',
  'چ',
  'پ',
  'ج',
  'ش',
] as const;

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export const toPersianDigits = (value: number | string): string =>
  value.toString().replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
