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

// Money display with Persian digits and abbreviated units: ۴۲۰ هزار ؋ / ۱٫۲م ؋
// AFN renders the ؋ suffix; other currencies render their symbol as a prefix
// (e.g. $۱٫۲م). Amounts are always denominated in whatever currencyCode the
// underlying CURRENCY composite field carries.
import { toPersianDigits } from './jalali';

const CURRENCY_SYMBOLS: Record<string, string> = { AFN: '؋', USD: '$' };

export const formatMoney = (
  amountMicros: number | null | undefined,
  currencyCode: string | null | undefined,
): string => {
  if (!amountMicros) return '—';
  const symbol = CURRENCY_SYMBOLS[currencyCode ?? 'AFN'] ?? currencyCode ?? '';
  const isSuffix = (currencyCode ?? 'AFN') === 'AFN';
  const value = amountMicros / 1_000_000;

  let body: string;
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    body = `${toPersianDigits(m % 1 === 0 ? String(m) : m.toFixed(1))}م`;
  } else if (value >= 1_000) {
    const k = Math.round(value / 1_000);
    body = `${toPersianDigits(k)}هزار`;
  } else {
    body = toPersianDigits(Math.round(value));
  }

  return isSuffix ? `${body} ${symbol}` : `${symbol}${body}`;
};

export const formatAfn = (amountMicros: number | null | undefined): string =>
  formatMoney(amountMicros, 'AFN');

export const sumAmountMicros = (
  leads: { amount: { amountMicros: number | null } | null }[],
): number =>
  leads.reduce((total, lead) => total + (lead.amount?.amountMicros ?? 0), 0);
