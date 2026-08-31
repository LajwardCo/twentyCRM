import {
  type PersonMatchCandidate,
  pickBestPersonMatch,
} from 'src/modules/sales-crm/utils/pick-best-person-match.util';

const person = (
  over: Partial<PersonMatchCandidate> = {},
): PersonMatchCandidate => ({
  id: 'p1',
  updatedAt: '2026-01-01T00:00:00.000Z',
  openOpportunityId: null,
  ...over,
});

describe('pickBestPersonMatch', () => {
  it('returns null when there are no candidates', () => {
    expect(pickBestPersonMatch([])).toBeNull();
  });

  it('returns the only candidate', () => {
    expect(pickBestPersonMatch([person({ id: 'solo' })])?.id).toBe('solo');
  });

  it('prefers a candidate with an open opportunity', () => {
    const result = pickBestPersonMatch([
      person({ id: 'no-deal', updatedAt: '2026-05-01T00:00:00.000Z' }),
      person({ id: 'has-deal', openOpportunityId: 'o1' }),
    ]);

    expect(result?.id).toBe('has-deal');
  });

  it('falls back to the most recently updated when none have a deal', () => {
    const result = pickBestPersonMatch([
      person({ id: 'older', updatedAt: '2026-01-01T00:00:00.000Z' }),
      person({ id: 'newer', updatedAt: '2026-05-01T00:00:00.000Z' }),
    ]);

    expect(result?.id).toBe('newer');
  });

  it('breaks a full tie on id so the result is stable across calls', () => {
    const candidates = [
      person({ id: 'bbb', openOpportunityId: 'o1' }),
      person({ id: 'aaa', openOpportunityId: 'o2' }),
    ];

    expect(pickBestPersonMatch(candidates)?.id).toBe('aaa');
    expect(pickBestPersonMatch([...candidates].reverse())?.id).toBe('aaa');
  });
});
