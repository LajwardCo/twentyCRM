import {
  aggregateCallActivity,
  type CallActivityRow,
} from 'src/modules/sales-crm/utils/aggregate-call-activity.util';

const row = (over: Partial<CallActivityRow> = {}): CallActivityRow => ({
  agentId: 'a1',
  startedAt: '2026-08-31T09:00:00.000Z',
  durationSeconds: 60,
  durationSource: 'CALL_LOG',
  opportunityId: 'o1',
  ...over,
});

describe('aggregateCallActivity', () => {
  it('returns nothing for no rows', () => {
    expect(aggregateCallActivity([], 'UTC')).toEqual([]);
  });

  it('totals calls and talk time for one agent on one day', () => {
    expect(
      aggregateCallActivity([row(), row({ durationSeconds: 120 })], 'UTC'),
    ).toEqual([
      {
        agentId: 'a1',
        day: '2026-08-31',
        callCount: 2,
        talkSeconds: 180,
        estimatedSeconds: 0,
        uniqueLeadCount: 1,
      },
    ]);
  });

  it('counts unique leads, not calls', () => {
    const result = aggregateCallActivity(
      [
        row({ opportunityId: 'o1' }),
        row({ opportunityId: 'o1' }),
        row({ opportunityId: 'o2' }),
      ],
      'UTC',
    );

    expect(result[0].uniqueLeadCount).toBe(2);
  });

  it('ignores a null lead when counting unique leads', () => {
    expect(
      aggregateCallActivity([row({ opportunityId: null })], 'UTC')[0]
        .uniqueLeadCount,
    ).toBe(0);
  });

  it('reports estimated time separately so it is never shown as measured', () => {
    const result = aggregateCallActivity(
      [
        row({ durationSeconds: 60 }),
        row({ durationSeconds: 90, durationSource: 'ESTIMATED' }),
      ],
      'UTC',
    );

    expect(result[0]).toMatchObject({ talkSeconds: 60, estimatedSeconds: 90 });
  });

  it('splits rows across agents and days', () => {
    const result = aggregateCallActivity(
      [
        row({ agentId: 'a1', startedAt: '2026-08-30T09:00:00.000Z' }),
        row({ agentId: 'a1', startedAt: '2026-08-31T09:00:00.000Z' }),
        row({ agentId: 'a2', startedAt: '2026-08-31T09:00:00.000Z' }),
      ],
      'UTC',
    );

    expect(result.map((entry) => `${entry.agentId}/${entry.day}`)).toEqual([
      'a1/2026-08-30',
      'a1/2026-08-31',
      'a2/2026-08-31',
    ]);
  });

  it('buckets by the local day, not UTC', () => {
    // 21:30 UTC is 02:00 the next day in Kabul (+04:30).
    const result = aggregateCallActivity(
      [row({ startedAt: '2026-08-30T21:30:00.000Z' })],
      'Asia/Kabul',
    );

    expect(result[0].day).toBe('2026-08-31');
  });
});
