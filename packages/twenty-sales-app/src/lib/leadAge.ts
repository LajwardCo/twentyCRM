// Two different ages, and the useful one is not the one that was already
// available. Total age answers "how long have we had this lead"; age in the
// CURRENT stage is what identifies a lead that has stalled -- a lead sitting
// in Demo Scheduled for two months looks identical to one that moved
// yesterday unless we measure it.

const MS_PER_DAY = 86_400_000;

export type AgeTone = 'ok' | 'warn' | 'stale';

// Past two weeks in one stage is worth a look; past a month it is a problem.
const WARN_DAYS = 14;
const STALE_DAYS = 30;

export const daysSince = (iso: string | null | undefined, now = Date.now()): number | null => {
  if (iso === null || iso === undefined || iso === '') return null;

  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;

  // Same flooring as the existing lead-age display: a lead registered an hour
  // ago is "1 day", not "0 days".
  return Math.max(1, Math.round((now - then) / MS_PER_DAY));
};

// Leads that predate stageChangedAt have it null. Falling back to createdAt
// over-estimates the stage age (the lead may have moved since), but it never
// makes the opposite, worse claim that a long-stalled lead moved recently.
export const stageAgeDays = (
  stageChangedAt: string | null | undefined,
  createdAt: string,
  now = Date.now(),
): number | null => daysSince(stageChangedAt ?? createdAt, now);

export const ageTone = (days: number | null): AgeTone => {
  if (days === null || days < WARN_DAYS) return 'ok';
  return days < STALE_DAYS ? 'warn' : 'stale';
};
