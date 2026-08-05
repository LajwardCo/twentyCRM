import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  coreQuery: vi.fn(),
  metadataQuery: vi.fn(),
}));

import { coreQuery } from './client';
import {
  acceptLeadOffer,
  createLeadOffer,
  fetchLeadOffers,
  type LeadOffer,
} from './offers';

const mockedCoreQuery = vi.mocked(coreQuery);

const offer = (id: string, offerStatus: LeadOffer['offerStatus']): LeadOffer => ({
  id,
  offeredAt: '2026-08-01T00:00:00.000Z',
  amount: { amountMicros: 5_000_000_000, currencyCode: 'AFN' },
  offerStatus,
  note: null,
  offeredBy: null,
  createdAt: '2026-08-01T00:00:00.000Z',
});

// The leadOffer object only exists once the provisioning script has run. One
// unknown object fails the whole document, so an unprovisioned instance must
// hide the offers section rather than take the lead screen down with it.
describe('offers on an unprovisioned instance', () => {
  beforeEach(() => {
    mockedCoreQuery.mockReset();
  });

  it('reports unsupported rather than throwing when the object is missing', async () => {
    mockedCoreQuery.mockRejectedValue(
      new Error('Cannot query field "leadOffers" on type "Query".'),
    );

    await expect(fetchLeadOffers('lead-1')).resolves.toEqual({ supported: false });
  });

  it('reports unsupported when the create input type is missing', async () => {
    mockedCoreQuery.mockRejectedValue(
      new Error('Unknown type "LeadOfferCreateInput".'),
    );

    await expect(
      createLeadOffer({
        opportunityId: 'lead-1',
        amountMicros: 1_000_000,
        currencyCode: 'AFN',
        note: null,
        offeredById: null,
      }),
    ).resolves.toEqual({ supported: false });
  });

  it('still surfaces an unrelated failure instead of hiding it', async () => {
    mockedCoreQuery.mockRejectedValue(new Error('Network request failed'));

    await expect(fetchLeadOffers('lead-1')).rejects.toThrow('Network request failed');
  });
});

describe('fetchLeadOffers', () => {
  beforeEach(() => {
    mockedCoreQuery.mockReset();
  });

  it('returns the offers for the lead', async () => {
    mockedCoreQuery.mockResolvedValue({
      leadOffers: { edges: [{ node: offer('o1', 'PROPOSED') }] },
    });

    const result = await fetchLeadOffers('lead-1');

    expect(result).toEqual({ supported: true, value: [offer('o1', 'PROPOSED')] });
    expect(mockedCoreQuery.mock.calls[0][1]).toEqual({ id: 'lead-1' });
  });
});

describe('acceptLeadOffer', () => {
  beforeEach(() => {
    mockedCoreQuery.mockReset();
    mockedCoreQuery.mockResolvedValue({});
  });

  it('supersedes the other open offers, accepts this one, then sets the agreed price', async () => {
    const accepted = offer('o2', 'PROPOSED');

    await acceptLeadOffer({
      offer: accepted,
      opportunityId: 'lead-1',
      otherOffers: [offer('o1', 'PROPOSED'), accepted],
    });

    const statuses = mockedCoreQuery.mock.calls
      .map(([, variables]) => variables as { id: string; data: Record<string, unknown> })
      .map(({ id, data }) => [id, data.offerStatus ?? 'agreed']);

    // Supersede first, so a part-way failure leaves no accepted offer rather
    // than two.
    expect(statuses).toEqual([
      ['o1', 'SUPERSEDED'],
      ['o2', 'ACCEPTED'],
      ['lead-1', 'agreed'],
    ]);
  });

  it('does not supersede offers that are already closed', async () => {
    const accepted = offer('o2', 'PROPOSED');

    await acceptLeadOffer({
      offer: accepted,
      opportunityId: 'lead-1',
      otherOffers: [offer('o1', 'REJECTED'), offer('o3', 'SUPERSEDED'), accepted],
    });

    const touched = mockedCoreQuery.mock.calls.map(
      ([, variables]) => (variables as { id: string }).id,
    );

    expect(touched).toEqual(['o2', 'lead-1']);
  });

  it('copies the accepted amount onto the lead', async () => {
    const accepted = offer('o2', 'PROPOSED');

    await acceptLeadOffer({
      offer: accepted,
      opportunityId: 'lead-1',
      otherOffers: [accepted],
    });

    const [, variables] = mockedCoreQuery.mock.calls.at(-1) ?? [];
    const { data } = variables as { data: { agreedPrice: unknown; agreedAt: string } };

    expect(data.agreedPrice).toEqual({
      amountMicros: 5_000_000_000,
      currencyCode: 'AFN',
    });
    expect(data.agreedAt).toEqual(expect.any(String));
  });
});
