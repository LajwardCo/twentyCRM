import { describe, expect, it } from 'vitest';

import {
  buildUsageSeries,
  formatShare,
  formatTokensCompact,
  formatTokensExact,
  formatUsd,
  kabulDay,
  rangeBounds,
} from './aiUsage';

// 2026-09-27 21:00 UTC is already 2026-09-28 01:30 in Kabul.
const LATE_EVENING_UTC = Date.parse('2026-09-27T21:00:00.000Z');

describe('rangeBounds', () => {
  it('starts "today" at Kabul midnight, not UTC midnight', () => {
    const { from, to } = rangeBounds('today', LATE_EVENING_UTC);

    expect(from).toBe('2026-09-27T19:30:00.000Z');
    expect(to).toBe('2026-09-27T21:00:00.000Z');
  });

  it('counts rolling days back from now', () => {
    const { from } = rangeBounds('7d', LATE_EVENING_UTC);

    expect(from).toBe('2026-09-20T21:00:00.000Z');
  });
});

describe('kabulDay', () => {
  it('rolls over at Kabul midnight', () => {
    expect(kabulDay(LATE_EVENING_UTC)).toBe('2026-09-28');
  });
});

describe('token formatting', () => {
  it('groups exact counts with Persian digits', () => {
    expect(formatTokensExact(1234567)).toBe('۱٬۲۳۴٬۵۶۷');
  });

  it('abbreviates large counts', () => {
    expect(formatTokensCompact(850)).toBe('۸۵۰');
    expect(formatTokensCompact(12_400)).toBe('۱۲ هزار');
    expect(formatTokensCompact(3_100_000)).toBe('۳٫۱ میلیون');
    expect(formatTokensCompact(2_000)).toBe('۲ هزار');
  });

  it('formats cost and share', () => {
    expect(formatUsd(0)).toBe('$۰');
    expect(formatUsd(0.0042)).toBe('$۰٫۰۰۴');
    expect(formatUsd(0.82)).toBe('$۰٫۸۲');
    expect(formatUsd(12.5)).toBe('$۱۲٫۵۰');
    expect(formatShare(0.256)).toBe('۲۶٪');
  });
});

describe('buildUsageSeries', () => {
  it('fills quiet days with zero for short ranges', () => {
    const series = buildUsageSeries(
      [
        { date: '2026-09-20', totalTokens: 100 },
        { date: '2026-09-22', totalTokens: 50 },
      ],
      '2026-09-19T20:00:00.000Z',
      '2026-09-22T10:00:00.000Z',
    );

    expect(series.map((point) => point.count)).toEqual([100, 0, 50]);
    // 2026-09-20 is 29 Sonbola 1405.
    expect(series[0].label).toBe('۲۹');
  });

  it('folds long ranges into Afghan months', () => {
    const series = buildUsageSeries(
      [
        { date: '2026-07-01', totalTokens: 10 },
        { date: '2026-07-10', totalTokens: 5 },
        { date: '2026-09-01', totalTokens: 7 },
      ],
      '2026-06-30T20:00:00.000Z',
      '2026-09-27T10:00:00.000Z',
    );

    expect(series[0]).toEqual({ label: 'سرطان', count: 15 });
    expect(series.reduce((sum, point) => sum + point.count, 0)).toBe(22);
  });
});
