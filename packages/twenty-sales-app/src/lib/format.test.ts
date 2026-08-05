import { describe, expect, it } from 'vitest';

import {
  formatMoney,
  formatMoneyCompact,
  formatMoneyTotals,
  sumByCurrency,
} from './format';

const micros = (amount: number) => amount * 1_000_000;

describe('formatMoney', () => {
  // The reported bug: a lead quoted at $2,500 displayed as "$۳هزار" because
  // the old abbreviation rounded to the nearest thousand.
  it('shows the exact amount rather than rounding to the nearest thousand', () => {
    expect(formatMoney(micros(2500), 'USD')).toBe('$۲٬۵۰۰');
  });

  it('groups thousands with the Persian separator', () => {
    expect(formatMoney(micros(300000), 'AFN')).toBe('۳۰۰٬۰۰۰ ؋');
    expect(formatMoney(micros(1234567), 'AFN')).toBe('۱٬۲۳۴٬۵۶۷ ؋');
  });

  it('keeps small amounts intact', () => {
    expect(formatMoney(micros(999), 'USD')).toBe('$۹۹۹');
    expect(formatMoney(micros(1), 'USD')).toBe('$۱');
  });

  it('shows decimals only when the amount has them', () => {
    expect(formatMoney(micros(2500.5), 'USD')).toBe('$۲٬۵۰۰٫۵');
    expect(formatMoney(micros(2500.25), 'USD')).toBe('$۲٬۵۰۰٫۲۵');
    expect(formatMoney(micros(2500), 'USD')).toBe('$۲٬۵۰۰');
  });

  it('defaults to AFN and renders unknown currencies with their code', () => {
    expect(formatMoney(micros(1200))).toBe('۱٬۲۰۰ ؋');
    expect(formatMoney(micros(1200), 'EUR')).toBe('۱٬۲۰۰ EUR');
  });

  it('renders nothing for absent amounts', () => {
    expect(formatMoney(null, 'USD')).toBe('—');
    expect(formatMoney(0, 'USD')).toBe('—');
  });
});

describe('formatMoneyCompact', () => {
  // Abbreviation survives only for chart labels, and only at a precision that
  // cannot repeat the 2,500 -> 3,000 error.
  it('keeps one decimal so it never rounds a quote away', () => {
    expect(formatMoneyCompact(micros(2500), 'USD')).toBe('$۲٫۵هزار');
    expect(formatMoneyCompact(micros(1_200_000), 'AFN')).toBe('۱٫۲م ؋');
  });

  it('drops a trailing zero decimal', () => {
    expect(formatMoneyCompact(micros(3000), 'USD')).toBe('$۳هزار');
    expect(formatMoneyCompact(micros(2_000_000), 'AFN')).toBe('۲م ؋');
  });

  it('does not abbreviate below a thousand', () => {
    expect(formatMoneyCompact(micros(750), 'USD')).toBe('$۷۵۰');
  });
});

describe('sumByCurrency', () => {
  const lead = (amount: number | null, currencyCode: string | null) => ({
    amount: amount === null ? null : { amountMicros: micros(amount), currencyCode },
  });

  it('keeps each currency in its own bucket', () => {
    expect(
      sumByCurrency([lead(1000, 'AFN'), lead(2500, 'USD'), lead(500, 'AFN')]),
    ).toEqual({ AFN: micros(1500), USD: micros(2500) });
  });

  it('treats a missing currency code as AFN, matching legacy rows', () => {
    expect(sumByCurrency([lead(1000, null), lead(200, 'AFN')])).toEqual({
      AFN: micros(1200),
    });
  });

  it('ignores leads with no amount', () => {
    expect(sumByCurrency([lead(null, null), lead(300, 'USD')])).toEqual({
      USD: micros(300),
    });
  });

  it('returns an empty total for an empty list', () => {
    expect(sumByCurrency([])).toEqual({});
  });
});

describe('formatMoneyTotals', () => {
  it('reads exactly like a single amount when only one currency is present', () => {
    expect(formatMoneyTotals({ AFN: micros(300000) })).toBe('۳۰۰٬۰۰۰ ؋');
  });

  it('joins currencies instead of adding them together', () => {
    expect(formatMoneyTotals({ AFN: micros(1200), USD: micros(3400) })).toBe(
      '۱٬۲۰۰ ؋ + $۳٬۴۰۰',
    );
  });

  it('omits zero buckets and renders an empty total as a dash', () => {
    expect(formatMoneyTotals({ AFN: micros(1200), USD: 0 })).toBe('۱٬۲۰۰ ؋');
    expect(formatMoneyTotals({})).toBe('—');
  });

  it('can abbreviate when the caller has no room', () => {
    expect(
      formatMoneyTotals({ AFN: micros(1_200_000), USD: micros(2500) }, { compact: true }),
    ).toBe('۱٫۲م ؋ + $۲٫۵هزار');
  });
});
