// Number entry the way sellers actually type it. Two problems this solves:
//
// 1. Persian keyboards. A price typed as ۱۲٬۵۰۰٫۷۵ has to reach the pricing
//    math as 12500.75, and the Arabic decimal separator ٫ (U+066B) is a
//    different character from the thousands separator ٬ (U+066C).
// 2. Controlled <input value={someNumber}>. Round-tripping every keystroke
//    through Number() erases the decimal point the moment it is typed --
//    Number('12.') is 12, which re-renders as "12" -- so a fractional price
//    is literally untypeable. Editors keep the raw text and parse it here.

const PERSIAN_ZERO = 0x06f0; // ۰-۹
const ARABIC_INDIC_ZERO = 0x0660; // ٠-٩

const DECIMAL_SEPARATORS = /[٫،]/g; // Arabic decimal separator, Arabic comma
const GROUPING = /[,\s٬' ‏‎]/g; // ASCII/Persian grouping + bidi marks

export type NumberInputOptions = {
  // Quantities are counted, not measured: a fractional one is a typo.
  integer?: boolean;
  // Prices and quantities are never negative; a bare '-' should not parse.
  allowNegative?: boolean;
};

// Latin digits, one '.' decimal point, no grouping -- what Number() wants.
export const normalizeNumericText = (raw: string): string =>
  raw
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - PERSIAN_ZERO))
    .replace(/[٠-٩]/g, (d) =>
      String(d.charCodeAt(0) - ARABIC_INDIC_ZERO),
    )
    .replace(DECIMAL_SEPARATORS, '.')
    .replace(GROUPING, '');

// Whether the box may keep showing this text while the user is mid-number.
// Deliberately looser than parseDecimalInput: '', '-', '12.' and '.5' are all
// on the way to a valid number, so rejecting them would fight the typist.
export const isPartialNumber = (
  raw: string,
  { integer = false, allowNegative = false }: NumberInputOptions = {},
): boolean => {
  const normalized = normalizeNumericText(raw);

  if (normalized === '') return true;

  const pattern = integer ? /^-?\d*$/ : /^-?\d*\.?\d*$/;

  if (!pattern.test(normalized)) return false;

  return allowNegative || !normalized.startsWith('-');
};

export const parseDecimalInput = (
  raw: string | null | undefined,
  { integer = false, allowNegative = false }: NumberInputOptions = {},
): number | null => {
  if (raw === null || raw === undefined) return null;

  const normalized = normalizeNumericText(raw);

  // Number('') is 0 and Number('.') is NaN; neither is a value the seller gave.
  if (normalized === '' || normalized === '-' || normalized === '.') return null;

  const value = Number(normalized);

  if (!Number.isFinite(value)) return null;
  if (!allowNegative && value < 0) return null;
  if (integer && !Number.isInteger(value)) return null;

  return value;
};

// The canonical text for a value the editor already holds, used to seed and to
// tidy the box on blur ('۰۱۲٫۵۰' -> '12.5'). Latin, because these inputs are
// dir="ltr" and the value goes straight into pricing math.
export const numberToInputText = (
  value: number | null | undefined,
): string => (value === null || value === undefined ? '' : String(value));
