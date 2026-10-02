import { describe, expect, it } from 'vitest';

import {
  canManageTag,
  countLeadsPerTag,
  findDuplicateTag,
  type LeadTag,
  normalizeTagName,
  parseTagColor,
  parseTagVisibility,
  sortTags,
  tagsByLead,
  validateTagName,
  visibleTags,
} from './leadTags';

const tag = (overrides: Partial<LeadTag> & { id: string }): LeadTag => ({
  name: overrides.id,
  color: 'BLUE',
  visibility: 'PUBLIC',
  createdById: 'alice',
  ...overrides,
});

const aliceMine = tag({ id: 'a-personal', name: 'Follow up', visibility: 'PERSONAL', createdById: 'alice' });
const bobMine = tag({ id: 'b-personal', name: 'Bob secret', visibility: 'PERSONAL', createdById: 'bob' });
const publicVip = tag({ id: 'vip', name: 'VIP', visibility: 'PUBLIC', createdById: 'bob' });

describe('visibleTags', () => {
  it('shows public tags and own personal tags, never another member\'s personal tag', () => {
    const result = visibleTags([aliceMine, bobMine, publicVip], 'alice');
    expect(result.map((t) => t.id)).toEqual(['a-personal', 'vip']);
  });
});

describe('canManageTag', () => {
  it('lets the creator manage their own tag, personal or public', () => {
    expect(canManageTag(aliceMine, 'alice', false)).toBe(true);
    expect(canManageTag(publicVip, 'bob', false)).toBe(true);
  });

  it('lets an admin manage public tags but not another member\'s personal tag', () => {
    expect(canManageTag(publicVip, 'alice', true)).toBe(true);
    expect(canManageTag(bobMine, 'alice', true)).toBe(false);
  });

  it('refuses a non-admin on someone else\'s public tag', () => {
    expect(canManageTag(publicVip, 'alice', false)).toBe(false);
  });
});

describe('normalizeTagName', () => {
  it('ignores case and collapses whitespace', () => {
    expect(normalizeTagName('  VIP   Client ')).toBe('vip client');
  });
});

describe('findDuplicateTag / validateTagName', () => {
  const all = [aliceMine, bobMine, publicVip];

  it('treats a public name as taken for everyone', () => {
    expect(findDuplicateTag(all, 'vip', 'alice')?.id).toBe('vip');
  });

  it('treats own personal names as taken', () => {
    expect(validateTagName(all, 'FOLLOW  UP', 'alice')).toBe('duplicate');
  });

  it('does not collide with another member\'s personal tag they cannot see', () => {
    expect(validateTagName(all, 'bob secret', 'alice')).toBeNull();
  });

  it('ignores the tag being edited', () => {
    expect(validateTagName(all, 'follow up', 'alice', { excludeId: 'a-personal' })).toBeNull();
  });

  it('rejects empty and over-long names', () => {
    expect(validateTagName(all, '   ', 'alice')).toBe('empty');
    expect(validateTagName(all, 'x'.repeat(31), 'alice')).toBe('tooLong');
  });
});

describe('tagsByLead', () => {
  const links = [
    { id: 'l1', opportunityId: 'lead-1', tagId: 'vip' },
    { id: 'l2', opportunityId: 'lead-1', tagId: 'b-personal' },
    { id: 'l3', opportunityId: 'lead-1', tagId: 'a-personal' },
    { id: 'l4', opportunityId: 'lead-2', tagId: 'gone' },
    { id: 'l5', opportunityId: 'lead-1', tagId: 'vip' },
  ];

  it('drops hidden/missing tags and duplicates, personal tags first', () => {
    const map = tagsByLead(links, [aliceMine, bobMine, publicVip], 'alice');
    expect(map.get('lead-1')?.map((t) => t.id)).toEqual(['a-personal', 'vip']);
    expect(map.has('lead-2')).toBe(false);
  });
});

describe('countLeadsPerTag', () => {
  it('counts distinct leads per tag', () => {
    const counts = countLeadsPerTag([
      { id: '1', opportunityId: 'x', tagId: 't' },
      { id: '2', opportunityId: 'x', tagId: 't' },
      { id: '3', opportunityId: 'y', tagId: 't' },
    ]);
    expect(counts.get('t')).toBe(2);
  });
});

describe('sortTags', () => {
  it('puts own personal tags first, then alphabetical', () => {
    const sorted = sortTags([publicVip, tag({ id: 'z', name: 'Alpha' }), aliceMine], 'alice');
    expect(sorted.map((t) => t.id)).toEqual(['a-personal', 'z', 'vip']);
  });
});

describe('parsers', () => {
  it('falls back on unknown values', () => {
    expect(parseTagColor('NOPE')).toBe('BLUE');
    expect(parseTagVisibility(null)).toBe('PERSONAL');
    expect(parseTagVisibility('PUBLIC')).toBe('PUBLIC');
  });
});
