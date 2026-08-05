import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  coreQuery: vi.fn(),
  metadataQuery: vi.fn(),
}));

import { coreQuery } from './client';
import {
  addLeadReferrer,
  fetchLeadReferrers,
  type LeadReferrer,
  totalCommissionPercent,
} from './leadReferrers';

const mockedCoreQuery = vi.mocked(coreQuery);

const entry = (id: string, commissionPercent: number | null): LeadReferrer => ({
  id,
  commissionPercent,
  referrerRole: 'FINDER',
  note: null,
  partner: { id: `p-${id}`, name: 'Ahmad', partnerType: 'MARKETER', commissionPercent: 5 },
});

// The leadReferrer object only exists once the provisioning script has run.
describe('lead referrers on an unprovisioned instance', () => {
  beforeEach(() => {
    mockedCoreQuery.mockReset();
  });

  it('reports unsupported rather than throwing', async () => {
    mockedCoreQuery.mockRejectedValue(
      new Error('Cannot query field "leadReferrers" on type "Query".'),
    );

    await expect(fetchLeadReferrers('lead-1')).resolves.toEqual({ supported: false });
  });

  it('reports unsupported when the create input type is missing', async () => {
    mockedCoreQuery.mockRejectedValue(
      new Error('Unknown type "LeadReferrerCreateInput".'),
    );

    await expect(
      addLeadReferrer({
        opportunityId: 'lead-1',
        partnerId: 'p1',
        commissionPercent: 3,
        referrerRole: 'FINDER',
        note: null,
      }),
    ).resolves.toEqual({ supported: false });
  });

  it('still surfaces an unrelated failure', async () => {
    mockedCoreQuery.mockRejectedValue(new Error('Network request failed'));

    await expect(fetchLeadReferrers('lead-1')).rejects.toThrow('Network request failed');
  });
});

describe('totalCommissionPercent', () => {
  it('adds the primary referrer rate to every additional share', () => {
    expect(
      totalCommissionPercent(
        { id: 'p0', name: 'Primary', partnerType: 'MARKETER', commissionPercent: 5 },
        [entry('a', 3), entry('b', 2)],
      ),
    ).toBe(10);
  });

  it('treats a missing primary or a missing share as nothing owed', () => {
    expect(totalCommissionPercent(null, [entry('a', null)])).toBe(0);
    expect(
      totalCommissionPercent(
        { id: 'p0', name: 'P', partnerType: null, commissionPercent: null },
        [],
      ),
    ).toBe(0);
  });

  // A total past 100% is a real data-entry problem, and rounding it away in
  // the helper would hide exactly the case worth showing.
  it('does not cap an over-committed total', () => {
    expect(
      totalCommissionPercent(
        { id: 'p0', name: 'P', partnerType: null, commissionPercent: 80 },
        [entry('a', 40)],
      ),
    ).toBe(120);
  });
});
