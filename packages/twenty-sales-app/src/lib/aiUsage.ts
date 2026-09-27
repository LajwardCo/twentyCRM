import { AFGHAN_MONTHS, gregorianToJalali, toPersianDigits } from './jalali';

// Period presets for the AI usage report, and the formatting it needs.
// Server days are Kabul days (UTC+4:30, no DST), so the app buckets the same way.

export type AiUsageRangeKey = 'today' | '7d' | '30d' | '90d' | '365d';

export const AI_USAGE_RANGES: readonly { key: AiUsageRangeKey; days: number }[] = [
  { key: 'today', days: 0 },
  { key: '7d', days: 7 },
  { key: '30d', days: 30 },
  { key: '90d', days: 90 },
  { key: '365d', days: 365 },
];

const DAY_MS = 86_400_000;
const KABUL_OFFSET_MS = 4.5 * 3_600_000;

export const kabulDay = (time: number): string =>
  new Date(time + KABUL_OFFSET_MS).toISOString().slice(0, 10);

const startOfKabulDay = (time: number): number =>
  Date.parse(`${kabulDay(time)}T00:00:00.000Z`) - KABUL_OFFSET_MS;

export const rangeBounds = (
  key: AiUsageRangeKey,
  now: number = Date.now(),
): { from: string; to: string } => {
  const days = AI_USAGE_RANGES.find((range) => range.key === key)?.days ?? 30;
  const from = days === 0 ? startOfKabulDay(now) : now - days * DAY_MS;

  return { from: new Date(from).toISOString(), to: new Date(now).toISOString() };
};

const groupThousands = (value: number): string =>
  toPersianDigits(Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '٬'));

export const formatTokensExact = (value: number): string => groupThousands(value);

// Short form for tiles and bars: ۸۵۰ · ۱۲٫۴ هزار · ۳٫۱ میلیون
export const formatTokensCompact = (value: number): string => {
  const format = (scaled: number, unit: string) =>
    `${toPersianDigits(scaled.toFixed(scaled < 10 ? 1 : 0).replace(/\.0$/, '')).replace('.', '٫')} ${unit}`;

  if (value >= 1_000_000) return format(value / 1_000_000, 'میلیون');
  if (value >= 1_000) return format(value / 1_000, 'هزار');
  return groupThousands(value);
};

export const formatUsd = (value: number): string => {
  if (value <= 0) return toPersianDigits('$0');
  // Sub-dime amounts need a third decimal to show anything at all.
  const digits = value < 0.1 ? 3 : 2;
  return toPersianDigits(`$${value.toFixed(digits)}`).replace('.', '٫');
};

export const formatShare = (share: number): string =>
  `${toPersianDigits(Math.round(share * 100))}٪`;

const jalaliOf = (day: string) => {
  const [year, month, date] = day.split('-').map(Number);
  return gregorianToJalali(year, month, date);
};

// Bars for the trend chart. Up to a month shows one bar per day with gaps
// filled in, so a quiet day reads as zero rather than disappearing; longer
// ranges fold into Afghan months.
export const buildUsageSeries = (
  daily: { date: string; totalTokens: number }[],
  from: string,
  to: string,
): { label: string; count: number }[] => {
  const byDay = new Map(daily.map((point) => [point.date, point.totalTokens]));
  const fromTime = Date.parse(from);
  const toTime = Date.parse(to);
  const days: string[] = [];

  for (let time = startOfKabulDay(fromTime); time <= toTime; time += DAY_MS) {
    days.push(kabulDay(time));
  }

  if (days.length <= 31) {
    return days.map((day) => ({
      label: toPersianDigits(jalaliOf(day).jd),
      count: byDay.get(day) ?? 0,
    }));
  }

  const months: { key: string; label: string; count: number }[] = [];
  for (const day of days) {
    const { jy, jm } = jalaliOf(day);
    const key = `${jy}-${jm}`;
    const last = months[months.length - 1];
    if (last?.key === key) {
      last.count += byDay.get(day) ?? 0;
    } else {
      months.push({ key, label: AFGHAN_MONTHS[jm - 1], count: byDay.get(day) ?? 0 });
    }
  }

  return months.map(({ label, count }) => ({ label, count }));
};
