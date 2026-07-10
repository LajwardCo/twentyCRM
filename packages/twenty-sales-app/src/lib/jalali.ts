// Gregorian -> Jalali (Hijri Shamsi) conversion with Afghan (Dari) month
// names and Persian digits. Standard arithmetic algorithm (Birashk-compatible
// for the current era), no dependency.

export const AFGHAN_MONTHS = [
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
];

const WEEKDAYS = [
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
  'شنبه',
];

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export const toPersianDigits = (value: string | number): string =>
  String(value).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);

const div = (a: number, b: number) => Math.floor(a / b);

export const gregorianToJalali = (
  gy: number,
  gm: number,
  gd: number,
): { jy: number; jm: number; jd: number } => {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    355666 +
    365 * gy +
    div(gy2 + 3, 4) -
    div(gy2 + 99, 100) +
    div(gy2 + 399, 400) +
    gd +
    gdm[gm - 1];
  let jy = -1595 + 33 * div(days, 12053);
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    jy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
};

const isGregorianLeapYear = (gy: number): boolean =>
  (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;

// Reverse of gregorianToJalali — same algorithm family, inverted. Verified
// by round-trip fuzzing (see jalali.test.ts) rather than derived from a
// leap-year formula, since Jalali leap-year rules are easy to get subtly
// wrong.
export const jalaliToGregorian = (
  jy: number,
  jm: number,
  jd: number,
): { gy: number; gm: number; gd: number } => {
  const jy2 = jy + 1595;
  let days =
    -355668 +
    365 * jy2 +
    div(jy2, 33) * 8 +
    div((jy2 % 33) + 3, 4) +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    days -= 1;
    gy += 100 * div(days, 36524);
    days %= 36524;
    if (days >= 365) days += 1;
  }
  gy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    gy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  const gd0 = days + 1;
  const monthDays = [
    0,
    31,
    isGregorianLeapYear(gy) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  let gm = 1;
  let gd = gd0;
  for (let i = 1; i <= 12; i++) {
    if (gd <= monthDays[i]) {
      gm = i;
      break;
    }
    gd -= monthDays[i];
  }
  return { gy, gm, gd };
};

export const formatJalaliDate = (iso: string | null): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  const { jy, jm, jd } = gregorianToJalali(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  );
  return `${toPersianDigits(jd)} ${AFGHAN_MONTHS[jm - 1]} ${toPersianDigits(jy)}`;
};

export const formatJalaliDateTime = (iso: string | null): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${formatJalaliDate(iso)} · ${toPersianDigits(`${hh}:${mm}`)}`;
};

export const jalaliToday = (): string => {
  const now = new Date();
  const { jy, jm, jd } = gregorianToJalali(
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate(),
  );
  return `${WEEKDAYS[now.getDay()]}، ${toPersianDigits(jd)} ${AFGHAN_MONTHS[jm - 1]} ${toPersianDigits(jy)}`;
};

// Relative label for task due dates: امروز / فردا / دیروز / N روز پیش…
export const relativeDueLabel = (iso: string | null): string => {
  if (!iso) return 'بدون تاریخ';
  const due = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (dueDay.getTime() - today.getTime()) / 86400000,
  );
  if (diffDays === 0) return 'امروز';
  if (diffDays === 1) return 'فردا';
  if (diffDays === -1) return 'دیروز';
  if (diffDays < 0) return `${toPersianDigits(-diffDays)} روز پیش`;
  if (diffDays < 8) return `${toPersianDigits(diffDays)} روز بعد`;
  return formatJalaliDate(iso);
};

// Day count for a Jalali month. Months 1-6 are always 31 days, 7-11 are
// always 30. Month 12 (حوت/Esfand) is 29 or 30 depending on the leap year —
// determined by round-tripping day 30 through the verified Gregorian
// conversion (if it round-trips back to the same jy/12/30, that day exists)
// rather than a separate leap-year formula.
export const getJalaliMonthLength = (jy: number, jm: number): number => {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  const g30 = jalaliToGregorian(jy, 12, 30);
  const back = gregorianToJalali(g30.gy, g30.gm, g30.gd);
  return back.jy === jy && back.jm === 12 && back.jd === 30 ? 30 : 29;
};

// Month-cursor arithmetic for calendar prev/next navigation.
export const addJalaliMonths = (
  jy: number,
  jm: number,
  delta: number,
): { jy: number; jm: number } => {
  const zeroBased = jm - 1 + delta;
  const yearDelta = Math.floor(zeroBased / 12);
  const newMonthZeroBased = ((zeroBased % 12) + 12) % 12;
  return { jy: jy + yearDelta, jm: newMonthZeroBased + 1 };
};
