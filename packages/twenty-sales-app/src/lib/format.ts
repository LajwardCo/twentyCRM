export const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
};

export const formatDateTime = (iso: string | null): string => {
  if (!iso) return '—';
  return `${formatDate(iso)} ${new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

export const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const endOfToday = (): Date => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};

export const endOfTomorrow = (): Date => {
  const d = endOfToday();
  d.setDate(d.getDate() + 1);
  return d;
};

// datetime-local input value (local time, minutes precision)
export const toLocalInputValue = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const fullPhone = (
  phones: {
    primaryPhoneCallingCode: string | null;
    primaryPhoneNumber: string | null;
  } | null,
): string | null => {
  if (!phones?.primaryPhoneNumber) return null;
  const code = phones.primaryPhoneCallingCode ?? '';
  return `${code}${phones.primaryPhoneNumber}`;
};

export const personName = (
  person: { name: { firstName: string; lastName: string } } | null,
): string =>
  person
    ? `${person.name.firstName} ${person.name.lastName}`.trim()
    : '—';

// Money display with Persian digits: ۳۰۰٬۰۰۰ ؋ (AFN) or $۲٬۵۰۰ (USD).
import { toPersianDigits } from './jalali';

// Currencies the sales team works in. AFN shows the ؋ suffix (Dari
// convention); USD shows a leading $. Anything else falls back to a code
// suffix so nothing ever renders without its unit.
export const SUPPORTED_CURRENCIES = ['AFN', 'USD'] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_SYMBOLS: Record<string, string> = {
  AFN: '؋',
  USD: '$',
};

// Rows written before the multi-currency work carry no code; the CRM stored
// them in AFN, so that is what an absent code means.
export const DEFAULT_CURRENCY: CurrencyCode = 'AFN';

const PERSIAN_THOUSANDS = '٬';
const PERSIAN_DECIMAL = '٫';

// Persian digits with a thousands separator, e.g. 1234567.5 -> ۱٬۲۳۴٬۵۶۷٫۵.
// Decimals are kept only when they exist: money is quoted in whole units far
// more often than not, and a trailing ٫۰ reads like noise.
const persianNumber = (value: number): string => {
  const rounded = Math.round(value * 100) / 100;
  const [whole, fraction] = Math.abs(rounded).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, PERSIAN_THOUSANDS);
  const trimmed = fraction.replace(/0+$/, '');
  const sign = rounded < 0 ? '-' : '';
  return toPersianDigits(
    `${sign}${grouped}${trimmed !== '' ? `.${trimmed}` : ''}`,
  ).replace('.', PERSIAN_DECIMAL);
};

// One decimal, never more: abbreviation exists for chart labels that have no
// room for a full number, and a coarser rounding is how a $2,500 quote used to
// display as $3,000.
const abbreviateAmount = (value: number): string => {
  if (value >= 1_000_000) return `${persianNumber(value / 1_000_000)}م`;
  if (value >= 1_000) return `${persianNumber(value / 1_000)}هزار`;
  return persianNumber(value);
};

const withUnit = (num: string, currencyCode?: string | null): string => {
  const code = currencyCode ?? DEFAULT_CURRENCY;
  if (code === 'USD') return `$${num}`;
  if (code === 'AFN') return `${num} ؋`;
  return `${num} ${code}`;
};

// The exact amount — what every record view, list row and total should show.
export const formatMoney = (
  amountMicros: number | null | undefined,
  currencyCode?: string | null,
): string => {
  if (!amountMicros) return '—';
  return withUnit(persianNumber(amountMicros / 1_000_000), currencyCode);
};

// Abbreviated to one decimal, for the few places with no room for the exact
// number (chart bar labels). Prefer formatMoney everywhere else.
export const formatMoneyCompact = (
  amountMicros: number | null | undefined,
  currencyCode?: string | null,
): string => {
  if (!amountMicros) return '—';
  return withUnit(abbreviateAmount(amountMicros / 1_000_000), currencyCode);
};

// Back-compat wrapper: callers that only have amountMicros default to AFN.
export const formatAfn = (amountMicros: number | null | undefined): string =>
  formatMoney(amountMicros, DEFAULT_CURRENCY);

export type CurrencyTotals = Record<string, number>;

// Amounts in different currencies are different quantities, so they are kept
// apart rather than added into one meaningless number. Every aggregate in the
// reports goes through this.
export const sumByCurrency = (
  records: {
    amount: { amountMicros: number | null; currencyCode?: string | null } | null;
  }[],
): CurrencyTotals => {
  const totals: CurrencyTotals = {};
  for (const record of records) {
    const micros = record.amount?.amountMicros;
    if (!micros) continue;
    const code = record.amount?.currencyCode ?? DEFAULT_CURRENCY;
    totals[code] = (totals[code] ?? 0) + micros;
  }
  return totals;
};

export const addCurrencyTotals = (
  target: CurrencyTotals,
  micros: number | null | undefined,
  currencyCode?: string | null,
): CurrencyTotals => {
  if (!micros) return target;
  const code = currencyCode ?? DEFAULT_CURRENCY;
  target[code] = (target[code] ?? 0) + micros;
  return target;
};

export const totalsAreEmpty = (totals: CurrencyTotals): boolean =>
  Object.values(totals).every((micros) => !micros);

// "۱٬۲۰۰ ؋ + $۳٬۴۰۰" — a single-currency total reads exactly like one amount.
export const formatMoneyTotals = (
  totals: CurrencyTotals,
  options: { compact?: boolean } = {},
): string => {
  const format = options.compact ? formatMoneyCompact : formatMoney;
  const parts = Object.entries(totals)
    .filter(([, micros]) => micros)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, micros]) => format(micros, code));
  return parts.length > 0 ? parts.join(' + ') : '—';
};
