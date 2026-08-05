// Duplicate detection for lead registration. Pure functions only — the queries
// live in api/duplicates.ts and the UI in components/DuplicateWarning.tsx.
//
// Twenty has a native findDuplicates resolver, but it is only built for objects
// carrying duplicateCriteria metadata (Opportunity has none) and it matches
// exactly. Field sellers re-register the same company spelled three different
// ways, so matching here is normalized and fuzzy.

import { normalizePhone } from '../api/records';

// Words that identify a company as a company rather than which company it is.
// Removing them means "شرکت نور" and "نور ltd" compare as the same name.
const GENERIC_WORDS = new Set([
  'شرکت',
  'شركت',
  'کمپنی',
  'کمپني',
  'تولیدی',
  'تجارتی',
  'خدمات',
  'مرکز',
  'موسسه',
  'مؤسسه',
  'ltd',
  'llc',
  'inc',
  'co',
  'company',
  'corp',
  'group',
]);

const ARABIC_INDIC_DIGITS = /[۰-۹٠-٩]/g;

const digitValue = (char: string): string => {
  const persian = '۰۱۲۳۴۵۶۷۸۹'.indexOf(char);
  if (persian >= 0) return String(persian);
  const arabic = '٠١٢٣٤٥٦٧٨٩'.indexOf(char);
  return arabic >= 0 ? String(arabic) : char;
};

// Collapses the spelling variants a Dari keyboard produces into one form:
// Arabic ي/ك to Persian ی/ک, ة to ه, no ZWNJ, tatweel or diacritics.
const unifyScript = (value: string): string =>
  value
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[‌‏‎ـ]/g, '')
    .replace(/[ً-ْ]/g, '');

export const normalizeName = (raw: string): string => {
  const unified = unifyScript(raw)
    .replace(ARABIC_INDIC_DIGITS, digitValue)
    .toLowerCase()
    // Keep Arabic-script letters, Latin letters and digits; everything else is
    // punctuation that varies by typist.
    .replace(/[^؀-ۿ\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = unified.split(' ').filter((t) => t !== '');
  const distinctive = tokens.filter((t) => !GENERIC_WORDS.has(t));

  // A name made only of generic words keeps them — comparing two empty strings
  // would make every such lead a duplicate of every other.
  return (distinctive.length > 0 ? distinctive : tokens).join(' ');
};

const levenshtein = (a: string, b: string): number => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }

  return previous[b.length];
};

const editRatio = (a: string, b: string): number => {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 0 : 1 - levenshtein(a, b) / longest;
};

// One shared word is a hint, never evidence: "کابل" and "نور" appear in the
// names of unrelated businesses all over the country. Capped below the strong
// threshold so a subset match warns without blocking registration.
const SINGLE_TOKEN_CAP = 0.6;

// Two signals, combined by taking the better of them: whole-string edit
// distance catches typos, token overlap catches a company whose name gained or
// lost a word ("کلینیک نور" vs "شفاخانه نور").
export const nameSimilarity = (a: string, b: string): number => {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (left === '' || right === '') return 0;
  if (left === right) return 1;

  const leftTokens = new Set(left.split(' '));
  const rightTokens = new Set(right.split(' '));
  const shared = [...leftTokens].filter((t) => rightTokens.has(t)).length;
  const overlap = (shared / Math.min(leftTokens.size, rightTokens.size)) * 0.9;
  const overlapScore =
    shared === 1 && Math.max(leftTokens.size, rightTokens.size) > 1
      ? Math.min(overlap, SINGLE_TOKEN_CAP)
      : overlap;

  return Math.max(editRatio(left, right), overlapScore);
};

// One key per phone number, whatever the seller typed. Reuses the same
// normalization the registration form applies before saving, so a stored number
// and a typed one reduce to the same string.
export const phoneKey = (raw: string): string | null => {
  const parts = normalizePhone(raw);
  if (!parts || parts.primaryPhoneNumber === '') return null;
  return `${parts.primaryPhoneCallingCode}${parts.primaryPhoneNumber}`;
};

export type MatchLevel = 'exact' | 'strong' | 'weak';

const STRONG_THRESHOLD = 0.85;
const WEAK_THRESHOLD = 0.45;

// A shared phone or email is proof; a name is an opinion. Only the first
// blocks registration — the rest are shown as a warning.
export const classifyMatch = ({
  nameScore,
  exactContact,
}: {
  nameScore: number;
  exactContact: boolean;
}): MatchLevel | null => {
  if (exactContact) return 'exact';
  if (nameScore >= STRONG_THRESHOLD) return 'strong';
  if (nameScore >= WEAK_THRESHOLD) return 'weak';
  return null;
};

export type DuplicateMatch = {
  id: string;
  kind: 'lead' | 'company' | 'person';
  label: string;
  sub: string;
  score: number;
  level: MatchLevel;
  route: string;
};

const LEVEL_ORDER: Record<MatchLevel, number> = { exact: 0, strong: 1, weak: 2 };

// The same record surfaces from more than one query (a phone hit and a name
// hit); it is shown once, at its strongest level.
export const rankMatches = (matches: DuplicateMatch[]): DuplicateMatch[] => {
  const best = new Map<string, DuplicateMatch>();

  for (const match of matches) {
    const existing = best.get(match.route);
    if (
      !existing ||
      LEVEL_ORDER[match.level] < LEVEL_ORDER[existing.level] ||
      (match.level === existing.level && match.score > existing.score)
    ) {
      best.set(match.route, match);
    }
  }

  return [...best.values()].sort(
    (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.score - a.score,
  );
};

// Only an exact or strong match is worth stopping a seller for. Weak ones are
// shown while typing and never block.
export const blockingMatches = (matches: DuplicateMatch[]): DuplicateMatch[] =>
  matches.filter((m) => m.level === 'exact' || m.level === 'strong');
