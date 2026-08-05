import { describe, expect, it } from 'vitest';

import { type DealProductLine } from '../api/records';
import { buildSubscriptionDrafts, termEndDate } from './subscriptionDrafts';

const NOW = new Date('2026-08-05T00:00:00.000Z');

const line = (
  id: string,
  annualMicros: number | null,
  currencyCode = 'AFN',
): DealProductLine => ({
  id,
  name: `line ${id}`,
  quantity: 1,
  discountPercent: null,
  lineStatus: 'CONTRACTED',
  installPrice: { amountMicros: 15_000_000_000, currencyCode },
  annualPrice:
    annualMicros === null ? null : { amountMicros: annualMicros, currencyCode },
  product: { id: `p-${id}`, name: `HMIS ${id}` },
});

describe('termEndDate', () => {
  // The term ends the day before the anniversary, so a renewal falls ON the
  // anniversary rather than a day after it.
  it('ends an annual term the day before the next anniversary', () => {
    expect(termEndDate(new Date('2026-08-05T00:00:00.000Z'), 'ANNUAL')).toEqual(
      new Date('2027-08-04T00:00:00.000Z'),
    );
  });

  it('ends a monthly term the day before the next month date', () => {
    expect(termEndDate(new Date('2026-08-05T00:00:00.000Z'), 'MONTHLY')).toEqual(
      new Date('2026-09-04T00:00:00.000Z'),
    );
  });
});

describe('buildSubscriptionDrafts', () => {
  it('drafts one subscription per line that has a recurring amount', () => {
    const drafts = buildSubscriptionDrafts([line('a', 7_000_000_000)], NOW);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      dealLineId: 'a',
      productId: 'p-a',
      productName: 'HMIS a',
      recurringAmountMicros: 7_000_000_000,
      currencyCode: 'AFN',
      billingPeriod: 'ANNUAL',
    });
  });

  // A one-off install fee is not a subscription, and a zero-amount renewal
  // reminder is noise.
  it('skips lines with no recurring amount rather than drafting them at zero', () => {
    const drafts = buildSubscriptionDrafts(
      [line('a', null), line('b', 0), line('c', 500_000_000)],
      NOW,
    );

    expect(drafts.map((draft) => draft.dealLineId)).toEqual(['c']);
  });

  it('keeps each line in its own currency', () => {
    const drafts = buildSubscriptionDrafts(
      [line('a', 7_000_000_000, 'AFN'), line('b', 100_000_000, 'USD')],
      NOW,
    );

    expect(drafts.map((draft) => draft.currencyCode)).toEqual(['AFN', 'USD']);
  });

  it('falls back to the line name when the line has no product', () => {
    const bare = { ...line('a', 1_000_000), product: null };

    expect(buildSubscriptionDrafts([bare], NOW)[0].productName).toBe('line a');
  });

  it('dates the term from the given moment', () => {
    const [draft] = buildSubscriptionDrafts([line('a', 1_000_000)], NOW);

    expect(draft.startDate).toBe('2026-08-05T00:00:00.000Z');
    expect(draft.endDate).toBe('2027-08-04T00:00:00.000Z');
  });

  it('drafts nothing for a lead with no lines', () => {
    expect(buildSubscriptionDrafts([], NOW)).toEqual([]);
  });
});
