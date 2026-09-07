import { describe, expect, it } from 'vitest';

import { buildActorSearchFilter } from './actorSearch';

describe('buildActorSearchFilter', () => {
  it('is null for an empty query, so the picker shows the first page', () => {
    expect(buildActorSearchFilter('')).toBeNull();
    expect(buildActorSearchFilter('   ')).toBeNull();
  });

  it('matches one word against every field', () => {
    expect(buildActorSearchFilter('lincoln')).toEqual({
      and: [
        {
          or: [
            { name: { firstName: { ilike: '%lincoln%' } } },
            { name: { lastName: { ilike: '%lincoln%' } } },
            { userEmail: { ilike: '%lincoln%' } },
          ],
        },
      ],
    });
  });

  it('lets a full name match across two columns', () => {
    // The bug this exists for: one ilike over "Lincoln Jackson" matches
    // nobody, because no single column holds both words.
    const filter = buildActorSearchFilter('Lincoln Jackson');

    expect(filter?.and).toHaveLength(2);
    expect(JSON.stringify(filter)).toContain('%Lincoln%');
    expect(JSON.stringify(filter)).toContain('%Jackson%');
  });

  it('does not care about word order or extra spacing', () => {
    expect(buildActorSearchFilter('Jackson   Lincoln')?.and).toHaveLength(2);
    expect(buildActorSearchFilter('  Lincoln Jackson ')?.and).toHaveLength(2);
  });

  it('caps how many words become clauses', () => {
    expect(buildActorSearchFilter('a b c d e f g')?.and).toHaveLength(4);
  });

  it('searches the email too', () => {
    const filter = buildActorSearchFilter('apple.dev');

    expect(filter?.and[0].or).toContainEqual({
      userEmail: { ilike: '%apple.dev%' },
    });
  });
});
