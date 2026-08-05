import { describe, expect, it } from 'vitest';

import { ageTone, daysSince, stageAgeDays } from './leadAge';

const NOW = new Date('2026-08-05T12:00:00.000Z').getTime();
const daysAgo = (days: number) =>
  new Date(NOW - days * 86_400_000).toISOString();

describe('daysSince', () => {
  it('counts whole days', () => {
    expect(daysSince(daysAgo(10), NOW)).toBe(10);
  });

  it('floors a fresh record at one day rather than zero', () => {
    expect(daysSince(new Date(NOW - 3_600_000).toISOString(), NOW)).toBe(1);
  });

  it('returns nothing for an absent or unparseable timestamp', () => {
    expect(daysSince(null, NOW)).toBeNull();
    expect(daysSince(undefined, NOW)).toBeNull();
    expect(daysSince('', NOW)).toBeNull();
    expect(daysSince('not a date', NOW)).toBeNull();
  });
});

describe('stageAgeDays', () => {
  it('measures from the stage change when there is one', () => {
    expect(stageAgeDays(daysAgo(3), daysAgo(90), NOW)).toBe(3);
  });

  // Leads registered before the field existed have it null. Falling back to
  // createdAt over-estimates, but never claims a stalled lead moved recently.
  it('falls back to createdAt for a lead that predates the field', () => {
    expect(stageAgeDays(null, daysAgo(90), NOW)).toBe(90);
    expect(stageAgeDays(undefined, daysAgo(90), NOW)).toBe(90);
  });
});

describe('ageTone', () => {
  it('stays quiet inside two weeks', () => {
    expect(ageTone(1)).toBe('ok');
    expect(ageTone(13)).toBe('ok');
  });

  it('warns from two weeks and escalates at a month', () => {
    expect(ageTone(14)).toBe('warn');
    expect(ageTone(29)).toBe('warn');
    expect(ageTone(30)).toBe('stale');
    expect(ageTone(365)).toBe('stale');
  });

  it('treats an unknown age as nothing to flag', () => {
    expect(ageTone(null)).toBe('ok');
  });
});
