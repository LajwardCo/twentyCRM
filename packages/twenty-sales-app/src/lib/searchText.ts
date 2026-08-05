// Text normalisation for search. Persian text arrives from three keyboards
// (Afghan Dari, Iranian Farsi, Arabic) that disagree on which codepoint means
// which letter, and phone numbers get typed with either Persian or ASCII
// digits. Postgres `ilike` folds case but not any of that, so we fold it here
// and probe with every plausible spelling.

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

const toAsciiDigits = (input: string): string =>
  input.replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabicIndex = ARABIC_INDIC_DIGITS.indexOf(digit);
    if (arabicIndex !== -1) return String(arabicIndex);
    return String(PERSIAN_DIGITS.indexOf(digit));
  });

const toPersianDigitsInPlace = (input: string): string =>
  input.replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);

// Letters that are the "same" letter with different codepoints, plus the
// zero-width joiner/non-joiner that Persian half-spaces leave behind.
export const normalizeText = (input: string): string =>
  toAsciiDigits(input)
    .replace(/[يیۍ]/g, 'ی')
    .replace(/[كک]/g, 'ک')
    .replace(/[ةه]/g, 'ه')
    .replace(/[أإآا]/g, 'ا')
    .replace(/[ؤو]/g, 'و')
    // Unicode "format" chars: the zero-width non-joiner behind every Persian
    // half-space, plus bidi marks and the BOM.
    .replace(/\p{Cf}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('fa');

// The spellings worth sending to the server for one query. Deduped, capped —
// each variant costs a full round of queries.
export const queryVariants = (query: string): string[] => {
  const trimmed = query.trim();
  if (trimmed === '') return [];

  const variants = [
    trimmed,
    normalizeText(trimmed),
    // ی/ک written the Arabic way, which is what a lot of older records contain
    normalizeText(trimmed).replace(/ی/g, 'ي').replace(/ک/g, 'ك'),
    toAsciiDigits(trimmed),
    toPersianDigitsInPlace(trimmed),
  ];

  return [...new Set(variants.filter((variant) => variant !== ''))].slice(0, 4);
};

// Words worth matching individually (single letters match everything).
export const queryWords = (query: string): string[] =>
  normalizeText(query)
    .split(' ')
    .filter((word) => word.length >= 2);

// A phone query is any run of 4+ digits; we match on the trailing digits so
// "0700 123 456", "+93700123456" and "700123456" all find each other.
export const phoneQueryFragment = (query: string): string | null => {
  const digits = toAsciiDigits(query).replace(/\D/g, '');
  if (digits.length < 4) return null;
  return digits.slice(-9);
};

// Cut a readable window around the first matched word.
export const makeSnippet = (
  text: string,
  query: string,
  radius = 45,
): string | null => {
  const clean = text
    .replace(/[#*_>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean === '') return null;

  const haystack = normalizeText(clean);
  let index = -1;
  for (const word of queryWords(query)) {
    const at = haystack.indexOf(word);
    if (at !== -1 && (index === -1 || at < index)) index = at;
  }
  if (index === -1) return clean.slice(0, radius * 2) || null;

  const start = Math.max(0, index - radius);
  const end = Math.min(clean.length, index + radius * 2);
  return (
    (start > 0 ? '…' : '') +
    clean.slice(start, end) +
    (end < clean.length ? '…' : '')
  );
};
