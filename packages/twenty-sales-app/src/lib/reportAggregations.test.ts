import { describe, expect, it } from 'vitest';

import { type DealProductStat, type DoneTask, type LeadSummary } from '../api/records';
import {
  computeActivity,
  computeFunnel,
  computeMarketerLeaderboard,
  computeProductStats,
  computeSourceConversion,
  computeWinLoss,
} from './reportAggregations';

// Minimal lead factory — only the fields the aggregations read.
const lead = (
  id: string,
  stage: string | null,
  opts: {
    source?: string | null;
    amountMicros?: number;
    currencyCode?: string;
  } = {},
): LeadSummary =>
  ({
    id,
    name: id,
    stage,
    temperature: null,
    leadSource: opts.source ?? null,
    createdAt: '2026-07-01T00:00:00.000Z',
    company: null,
    pointOfContact: null,
    owner: null,
    amount: opts.amountMicros
      ? {
          amountMicros: opts.amountMicros,
          currencyCode: opts.currencyCode ?? 'AFN',
        }
      : null,
    createdBy: null,
    referrer: null,
  }) as LeadSummary;

describe('computeFunnel', () => {
  it('counts leads at each stage in canonical pipeline order', () => {
    const rows = computeFunnel(
      [lead('a', 'NEW_LEAD'), lead('b', 'NEW_LEAD'), lead('c', 'IN_TRAINING')],
      {},
    );
    expect(rows[0].label).toBe('New Lead');
    expect(rows[0].count).toBe(2);
    // pipeline order preserved regardless of size
    expect(rows.map((r) => r.label)[0]).toBe('New Lead');
    expect(rows.find((r) => r.label === 'In Training')?.count).toBe(1);
  });

  // AFN and USD micros are different quantities; adding them produced a
  // pipeline number that was neither.
  it('keeps stage value per currency instead of adding them together', () => {
    const rows = computeFunnel(
      [
        lead('a', 'NEW_LEAD', { amountMicros: 1_000_000, currencyCode: 'AFN' }),
        lead('b', 'NEW_LEAD', { amountMicros: 2_500_000, currencyCode: 'USD' }),
      ],
      {},
    );
    expect(rows[0].value).toEqual({ AFN: 1_000_000, USD: 2_500_000 });
  });
});

describe('computeWinLoss', () => {
  it('computes win rate over closed leads only, ignoring open pipeline', () => {
    const result = computeWinLoss([
      lead('a', 'ACTIVE_CUSTOMER'),
      lead('b', 'ACTIVE_CUSTOMER'),
      lead('c', 'ACTIVE_CUSTOMER'),
      lead('d', 'LOST_MISSED'),
      lead('e', 'NEW_LEAD'), // open, excluded from denominator
    ]);
    expect(result.won).toBe(3);
    expect(result.lost).toBe(1);
    expect(result.winRate).toBe(75);
  });

  it('returns 0 win rate when nothing is closed', () => {
    expect(computeWinLoss([lead('a', 'NEW_LEAD')]).winRate).toBe(0);
  });
});

describe('computeSourceConversion', () => {
  it('computes per-source registered/won/rate sorted by volume', () => {
    const rows = computeSourceConversion(
      [
        lead('a', 'ACTIVE_CUSTOMER', { source: 'FIELD' }),
        lead('b', 'NEW_LEAD', { source: 'FIELD' }),
        lead('c', 'LOST_MISSED', { source: 'WHATSAPP' }),
      ],
      { FIELD: 'Field', WHATSAPP: 'WhatsApp' },
    );
    expect(rows[0].label).toBe('Field');
    expect(rows[0]).toMatchObject({ registered: 2, won: 1, rate: 50 });
    expect(rows[1]).toMatchObject({ registered: 1, won: 0, rate: 0 });
  });
});

describe('computeMarketerLeaderboard', () => {
  it('groups by marketer, omits leads with no marketer, computes conversion + pipeline', () => {
    const leads = [
      lead('a', 'ACTIVE_CUSTOMER', { amountMicros: 5_000_000 }),
      lead('b', 'NEW_LEAD', { amountMicros: 2_000_000 }),
      lead('c', 'NEW_LEAD', { amountMicros: 9_000_000 }),
    ];
    const rows = computeMarketerLeaderboard(
      leads,
      { a: 'ALAVI', b: 'ALAVI', c: null },
      { ALAVI: 'Alavi' },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: 'Alavi', leads: 2, won: 1, winRate: 50 });
    // pipeline value = open leads only (b), not the won one (a)
    expect(rows[0].pipelineValue).toEqual({ AFN: 2_000_000 });
  });

  it('reports a mixed-currency pipeline per currency', () => {
    const rows = computeMarketerLeaderboard(
      [
        lead('a', 'NEW_LEAD', { amountMicros: 3_000_000, currencyCode: 'AFN' }),
        lead('b', 'FOLLOWING_UP', { amountMicros: 2_500_000, currencyCode: 'USD' }),
      ],
      { a: 'ALAVI', b: 'ALAVI' },
      {},
    );
    expect(rows[0].pipelineValue).toEqual({ AFN: 3_000_000, USD: 2_500_000 });
  });
});

describe('computeProductStats', () => {
  const line = (
    id: string,
    productId: string | null,
    qty: number,
    install: number,
    annual: number,
    discount: number | null,
    currencyCode = 'AFN',
  ): DealProductStat => ({
    id,
    name: `line-${id}`,
    quantity: qty,
    discountPercent: discount,
    installPrice: { amountMicros: install, currencyCode },
    annualPrice: { amountMicros: annual, currencyCode },
    product: productId ? { id: productId, name: `Product ${productId}` } : null,
    createdAt: '2026-07-05T00:00:00.000Z',
  });

  it('aggregates units and revenue per product and totals across lines', () => {
    const stats = computeProductStats([
      line('1', 'p1', 2, 10_000_000, 4_000_000, 10),
      line('2', 'p1', 3, 15_000_000, 6_000_000, 20),
      line('3', 'p2', 1, 8_000_000, 0, null),
    ]);
    const p1Units = stats.byUnits.find((r) => r.label === 'Product p1');
    expect(p1Units?.count).toBe(5);
    // revenue-ranked: p1 (35m) before p2 (8m)
    expect(stats.byRevenue[0].label).toBe('Product p1');
    expect(stats.totals.lines).toBe(3);
    expect(stats.totals.units).toBe(6);
    expect(stats.totals.installRevenue).toEqual({ AFN: 33_000_000 });
    expect(stats.totals.annualRevenue).toEqual({ AFN: 10_000_000 });
    // avg discount ignores the null one: (10+20)/2 = 15
    expect(stats.totals.avgDiscount).toBe(15);
  });

  it('keeps revenue per currency and ranks on a single comparable currency', () => {
    const stats = computeProductStats([
      line('1', 'p1', 1, 1_000_000, 0, null, 'AFN'),
      line('2', 'p2', 1, 2_500_000, 0, null, 'USD'),
    ]);
    expect(stats.totals.installRevenue).toEqual({ AFN: 1_000_000, USD: 2_500_000 });
    const p2 = stats.byRevenue.find((r) => r.label === 'Product p2');
    expect(p2?.value).toEqual({ USD: 2_500_000 });
  });

  it('falls back to line name when product is null', () => {
    const stats = computeProductStats([line('9', null, 1, 1_000_000, 0, null)]);
    expect(stats.byUnits[0].label).toBe('line-9');
  });
});

describe('computeActivity', () => {
  const task = (
    id: string,
    type: DoneTask['taskType'],
    sellerId: string | null,
  ): DoneTask => ({
    id,
    title: id,
    updatedAt: '2026-07-05T00:00:00.000Z',
    taskType: type,
    bodyV2: null,
    assignee: sellerId
      ? { id: sellerId, name: { firstName: sellerId, lastName: 'X' } }
      : null,
  });

  it('builds a type mix and per-seller breakdown', () => {
    const stats = computeActivity(
      [
        task('1', 'CALL', 's1'),
        task('2', 'CALL', 's1'),
        task('3', 'MEETING', 's1'),
        task('4', 'VISIT', 's2'),
      ],
      { CALL: 'Call', MEETING: 'Meeting', VISIT: 'Visit' },
    );
    expect(stats.mix[0]).toMatchObject({ label: 'Call', count: 2 });
    const s1 = stats.bySeller.find((r) => r.sellerId === 's1');
    expect(s1?.total).toBe(3);
    expect(s1?.byType).toEqual({ CALL: 2, MEETING: 1 });
  });

  it('buckets a null task type as OTHER', () => {
    const stats = computeActivity([task('1', null, 's1')], { OTHER: 'Other' });
    expect(stats.mix[0]).toMatchObject({ label: 'Other', count: 1 });
  });
});
