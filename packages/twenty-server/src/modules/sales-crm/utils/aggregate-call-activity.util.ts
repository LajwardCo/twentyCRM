export type CallActivityRow = {
  agentId: string;
  startedAt: string;
  durationSeconds: number;
  durationSource: 'CALL_LOG' | 'ESTIMATED' | 'MANUAL';
  opportunityId: string | null;
};

export type CallActivityDailyTotals = {
  agentId: string;
  /** Local calendar day, 'YYYY-MM-DD'. */
  day: string;
  callCount: number;
  /** Seconds from measured or manually entered durations. */
  talkSeconds: number;
  /** Seconds from iOS away-time estimates, kept separate on purpose. */
  estimatedSeconds: number;
  uniqueLeadCount: number;
};

/** 'YYYY-MM-DD' for an instant in the given IANA zone. */
const localDayKey = (isoInstant: string, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoInstant));

/**
 * Per agent, per local day: calls, talk time and how many distinct leads were
 * touched. Estimated durations are totalled separately because these numbers
 * are used to evaluate people, and an iOS away-time guess must never be
 * presented as a measured call length.
 *
 * Sorted by agent then day so the output is stable and needs no second sort in
 * the client.
 */
export const aggregateCallActivity = (
  rows: CallActivityRow[],
  timeZone: string,
): CallActivityDailyTotals[] => {
  const buckets = new Map<
    string,
    CallActivityDailyTotals & { leadIds: Set<string> }
  >();

  for (const row of rows) {
    const day = localDayKey(row.startedAt, timeZone);
    const key = `${row.agentId} ${day}`;

    const bucket = buckets.get(key) ?? {
      agentId: row.agentId,
      day,
      callCount: 0,
      talkSeconds: 0,
      estimatedSeconds: 0,
      uniqueLeadCount: 0,
      leadIds: new Set<string>(),
    };

    bucket.callCount += 1;

    if (row.durationSource === 'ESTIMATED') {
      bucket.estimatedSeconds += row.durationSeconds;
    } else {
      bucket.talkSeconds += row.durationSeconds;
    }

    if (row.opportunityId !== null) {
      bucket.leadIds.add(row.opportunityId);
    }

    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .map(({ leadIds, ...totals }) => ({
      ...totals,
      uniqueLeadCount: leadIds.size,
    }))
    .sort((left, right) =>
      left.agentId === right.agentId
        ? left.day.localeCompare(right.day)
        : left.agentId.localeCompare(right.agentId),
    );
};
