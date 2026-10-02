// Lead tags: the rules that don't need a network.
//
// A tag is PERSONAL (only its creator sees and uses it) or PUBLIC (everyone).
// The record API has no per-user row scoping for custom objects, so personal
// privacy is enforced here: every list the UI shows goes through visibleTags.

export type TagVisibility = 'PERSONAL' | 'PUBLIC';

export const TAG_COLORS = [
  'GRAY',
  'RED',
  'ORANGE',
  'YELLOW',
  'GREEN',
  'TEAL',
  'BLUE',
  'PURPLE',
  'PINK',
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

export type LeadTag = {
  id: string;
  name: string;
  color: TagColor;
  visibility: TagVisibility;
  createdById: string | null;
};

export const DEFAULT_TAG_COLOR: TagColor = 'BLUE';

export const MAX_TAG_NAME_LENGTH = 30;

// Case-insensitive, whitespace-collapsed: "VIP " and "vip" are the same tag to
// a seller, and two near-identical tags are the mess this feature exists to
// prevent.
export const normalizeTagName = (name: string): string =>
  name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export const cleanTagName = (name: string): string =>
  name.trim().replace(/\s+/g, ' ');

export const isTagColor = (value: unknown): value is TagColor =>
  typeof value === 'string' && (TAG_COLORS as readonly string[]).includes(value);

export const isOwnTag = (tag: LeadTag, memberId: string): boolean =>
  tag.createdById === memberId;

// A seller sees public tags and their own personal ones. Someone else's
// personal tag is invisible even on a lead both of them can open.
export const visibleTags = (tags: LeadTag[], memberId: string): LeadTag[] =>
  tags.filter((tag) => tag.visibility === 'PUBLIC' || isOwnTag(tag, memberId));

// Edit/delete: the creator, or an admin for PUBLIC tags. Admins never gain
// access to other people's personal tags.
export const canManageTag = (
  tag: LeadTag,
  memberId: string,
  isAdmin: boolean,
): boolean =>
  isOwnTag(tag, memberId) || (isAdmin && tag.visibility === 'PUBLIC');

// Names are unique per scope, case-insensitively: a public name is taken for
// everyone, while a personal name only collides with the creator's own tags
// (and with public ones, which they would see next to it). Another seller's
// personal tag never counts -- they cannot see it, so it cannot be a duplicate.
export const findDuplicateTag = (
  tags: LeadTag[],
  name: string,
  memberId: string,
  options: { excludeId?: string } = {},
): LeadTag | null => {
  const wanted = normalizeTagName(name);
  return (
    visibleTags(tags, memberId).find(
      (tag) => tag.id !== options.excludeId && normalizeTagName(tag.name) === wanted,
    ) ?? null
  );
};

// Making a personal tag public publishes the name to everyone, so it has to
// clear the same public-uniqueness check as a brand-new public tag. That check
// must see OTHER sellers' public tags only -- already covered by
// findDuplicateTag -- which is why this is a thin wrapper rather than new logic.
export type TagNameProblem = 'empty' | 'tooLong' | 'duplicate';

export const validateTagName = (
  tags: LeadTag[],
  name: string,
  memberId: string,
  options: { excludeId?: string } = {},
): TagNameProblem | null => {
  const cleaned = cleanTagName(name);
  if (cleaned === '') return 'empty';
  if (cleaned.length > MAX_TAG_NAME_LENGTH) return 'tooLong';
  if (findDuplicateTag(tags, cleaned, memberId, options)) return 'duplicate';
  return null;
};

// Mine first, then public, each alphabetical (Persian collation) -- the order
// the picker and the manage screen both want.
export const sortTags = (tags: LeadTag[], memberId: string): LeadTag[] =>
  [...tags].sort((a, b) => {
    const aMine = isOwnTag(a, memberId) && a.visibility === 'PERSONAL' ? 0 : 1;
    const bMine = isOwnTag(b, memberId) && b.visibility === 'PERSONAL' ? 0 : 1;
    if (aMine !== bMine) return aMine - bMine;
    return a.name.localeCompare(b.name, 'fa');
  });

export type TagLink = { id: string; opportunityId: string; tagId: string };

// leadId -> tags applied to it, restricted to the ones this member may see. A
// link whose tag is missing (deleted, or someone else's personal tag) is
// dropped silently rather than rendered as a blank chip.
export const tagsByLead = (
  links: TagLink[],
  tags: LeadTag[],
  memberId: string,
): Map<string, LeadTag[]> => {
  const visibleById = new Map(
    visibleTags(tags, memberId).map((tag) => [tag.id, tag]),
  );
  const result = new Map<string, LeadTag[]>();

  for (const link of links) {
    const tag = visibleById.get(link.tagId);
    if (!tag) continue;
    const existing = result.get(link.opportunityId) ?? [];
    if (!existing.some((entry) => entry.id === tag.id)) existing.push(tag);
    result.set(link.opportunityId, existing);
  }

  for (const [leadId, list] of result) {
    result.set(leadId, sortTags(list, memberId));
  }
  return result;
};

// leadId count per tag, for the manage screen. Counts distinct leads.
export const countLeadsPerTag = (links: TagLink[]): Map<string, number> => {
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  for (const link of links) {
    const key = `${link.tagId}:${link.opportunityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    counts.set(link.tagId, (counts.get(link.tagId) ?? 0) + 1);
  }
  return counts;
};

export const parseTagColor = (value: unknown): TagColor =>
  isTagColor(value) ? value : DEFAULT_TAG_COLOR;

export const parseTagVisibility = (value: unknown): TagVisibility =>
  value === 'PUBLIC' ? 'PUBLIC' : 'PERSONAL';
