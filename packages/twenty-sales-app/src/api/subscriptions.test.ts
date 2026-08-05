import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  coreQuery: vi.fn(),
  metadataQuery: vi.fn(),
}));

import { type SubscriptionDraft } from '../lib/subscriptionDrafts';
import { coreQuery } from './client';
import { createSubscriptionsFromDrafts, fetchLeadSubscriptions } from './subscriptions';

const mockedCoreQuery = vi.mocked(coreQuery);

const draft = (dealLineId: string, productId: string | null): SubscriptionDraft => ({
  dealLineId,
  productId,
  productName: 'HMIS',
  recurringAmountMicros: 7_000_000_000,
  currencyCode: 'AFN',
  billingPeriod: 'ANNUAL',
  startDate: '2026-08-05T00:00:00.000Z',
  endDate: '2027-08-04T00:00:00.000Z',
});

describe('subscriptions on an unprovisioned instance', () => {
  beforeEach(() => {
    mockedCoreQuery.mockReset();
  });

  it('reports unsupported rather than throwing', async () => {
    mockedCoreQuery.mockRejectedValue(
      new Error('Cannot query field "subscriptions" on type "Query".'),
    );

    await expect(fetchLeadSubscriptions('lead-1')).resolves.toEqual({
      supported: false,
    });
  });

  it('still surfaces an unrelated failure', async () => {
    mockedCoreQuery.mockRejectedValue(new Error('Network request failed'));

    await expect(fetchLeadSubscriptions('lead-1')).rejects.toThrow(
      'Network request failed',
    );
  });
});

describe('createSubscriptionsFromDrafts', () => {
  beforeEach(() => {
    mockedCoreQuery.mockReset();
  });

  it('writes one row per draft, linked to both the lead and the customer', async () => {
    mockedCoreQuery.mockResolvedValue({ createSubscription: { id: 's1' } });

    const result = await createSubscriptionsFromDrafts({
      drafts: [draft('a', 'p-a'), draft('b', 'p-b')],
      opportunityId: 'lead-1',
      companyId: 'co-1',
    });

    expect(result).toEqual({ supported: true, value: ['s1', 's1'] });
    expect(mockedCoreQuery).toHaveBeenCalledTimes(2);

    const [, variables] = mockedCoreQuery.mock.calls[0];
    expect(variables).toMatchObject({
      data: {
        opportunityId: 'lead-1',
        companyId: 'co-1',
        productId: 'p-a',
        billingPeriod: 'ANNUAL',
        // Conversion records intent to bill; whether the customer has actually
        // started is a separate fact somebody confirms.
        subscriptionStatus: 'PENDING',
        recurringAmount: { amountMicros: 7_000_000_000, currencyCode: 'AFN' },
      },
    });
  });

  it('omits the company link for a lead with no company rather than sending null', async () => {
    mockedCoreQuery.mockResolvedValue({ createSubscription: { id: 's1' } });

    await createSubscriptionsFromDrafts({
      drafts: [draft('a', null)],
      opportunityId: 'lead-1',
      companyId: null,
    });

    const [, variables] = mockedCoreQuery.mock.calls[0];
    const { data } = variables as { data: Record<string, unknown> };

    expect(data).not.toHaveProperty('companyId');
    expect(data).not.toHaveProperty('productId');
  });

  // A part-way failure must leave the rows that landed, not roll back work the
  // seller would have to redo.
  it('propagates a mid-run failure after the earlier rows were written', async () => {
    mockedCoreQuery
      .mockResolvedValueOnce({ createSubscription: { id: 's1' } })
      .mockRejectedValueOnce(new Error('Network request failed'));

    await expect(
      createSubscriptionsFromDrafts({
        drafts: [draft('a', 'p-a'), draft('b', 'p-b')],
        opportunityId: 'lead-1',
        companyId: 'co-1',
      }),
    ).rejects.toThrow('Network request failed');

    expect(mockedCoreQuery).toHaveBeenCalledTimes(2);
  });

  it('writes nothing when there is nothing to convert', async () => {
    const result = await createSubscriptionsFromDrafts({
      drafts: [],
      opportunityId: 'lead-1',
      companyId: 'co-1',
    });

    expect(result).toEqual({ supported: true, value: [] });
    expect(mockedCoreQuery).not.toHaveBeenCalled();
  });
});
