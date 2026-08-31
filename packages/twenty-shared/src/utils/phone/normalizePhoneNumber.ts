export type NormalizedPhoneNumber = {
  /** Country calling code, including the leading plus, e.g. '+93'. */
  callingCode: string;
  /** Subscriber number without the calling code or trunk zero. */
  nationalNumber: string;
  /** Canonical form used as the match key, e.g. '+93790123456'. */
  e164: string;
};

const DEFAULT_CALLING_CODE = '+93';
const AFGHAN_DIGITS_WITH_COUNTRY_CODE = 11; // '93' + 9 subscriber digits
const MIN_E164_DIGITS = 8;

const PERSIAN_ZERO = 0x06f0;
const ARABIC_ZERO = 0x0660;

/** Converts Persian and Eastern Arabic digit characters to Latin 0-9. */
const toLatinDigits = (raw: string): string =>
  Array.from(raw)
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;

      if (code >= PERSIAN_ZERO && code <= PERSIAN_ZERO + 9) {
        return String(code - PERSIAN_ZERO);
      }

      if (code >= ARABIC_ZERO && code <= ARABIC_ZERO + 9) {
        return String(code - ARABIC_ZERO);
      }

      return char;
    })
    .join('');

/**
 * The single source of truth for phone normalization across the device, the
 * sales PWA and the server. Sellers type local numbers ('0790123456'), the
 * Android call log reports them in mixed forms, and the CRM stores them split
 * into a calling code and a subscriber number. All three must reduce to one
 * canonical e164 string or call-to-lead matching silently breaks.
 */
export const normalizePhoneNumber = (
  raw: string,
): NormalizedPhoneNumber | null => {
  const cleaned = toLatinDigits(raw).replace(/[\s\-()./]/g, '');

  if (cleaned === '') {
    return null;
  }

  const hasPlus = cleaned.startsWith('+');
  const body = hasPlus ? cleaned.slice(1) : cleaned;
  const digits = body.replace(/\D/g, '');

  // Reject anything that was not essentially a number, e.g. 'abc' or 'a1'.
  if (digits.length !== body.length || digits.length < MIN_E164_DIGITS) {
    return null;
  }

  const afghanFrom = (subscriberDigits: string): NormalizedPhoneNumber => {
    const nationalNumber = subscriberDigits.replace(/^0/, '');

    return {
      callingCode: DEFAULT_CALLING_CODE,
      nationalNumber,
      e164: `${DEFAULT_CALLING_CODE}${nationalNumber}`,
    };
  };

  if (hasPlus) {
    if (digits.startsWith('93')) {
      return afghanFrom(digits.slice(2));
    }

    // Splitting an arbitrary foreign code correctly needs a full country table
    // we deliberately do not carry. Matching only ever uses e164, which is
    // exact either way; the split is a best effort for display.
    return {
      callingCode: `+${digits.slice(0, 1)}`,
      nationalNumber: digits.slice(1),
      e164: `+${digits}`,
    };
  }

  // No plus. '93790123456' is an Afghan number carrying its country code;
  // '0790123456' is the same number in local trunk form. Length disambiguates.
  if (
    digits.startsWith('93') &&
    digits.length === AFGHAN_DIGITS_WITH_COUNTRY_CODE
  ) {
    return afghanFrom(digits.slice(2));
  }

  return afghanFrom(digits);
};

/** Canonical key for comparing two phone numbers. Null when unparseable. */
export const phoneMatchKey = (raw: string): string | null =>
  normalizePhoneNumber(raw)?.e164 ?? null;
