import { normalizePhoneNumber } from '@shared/phone';

// A contact's phone numbers, and which messaging app answers on each.
//
// Numbers live in Twenty's PHONES composite: one primary plus an
// `additionalPhones` array. That composite has no room for "this number is on
// WhatsApp", so app availability is kept alongside it in a TEXT field on the
// person (`phoneApps`) as a JSON map keyed by the canonical e164 form.
//
// Keying by e164 rather than by position is what makes the two survive each
// other: reordering the numbers, or editing one in the main CRM, cannot
// silently move WhatsApp from one number to another.

export const PHONE_APPS = [
  'WHATSAPP',
  'TELEGRAM',
  'IMO',
  'VIBER',
  'SIGNAL',
  'MESSENGER',
] as const;

export type PhoneApp = (typeof PHONE_APPS)[number];

export type PhoneEntry = {
  callingCode: string;
  number: string;
  /** Canonical form, and the key the app map is stored under. */
  e164: string;
  isPrimary: boolean;
  apps: PhoneApp[];
};

// What the API hands back for `phones`. Loose, because `additionalPhones` is
// RAW_JSON and so is whatever anyone has ever written into it.
export type PhonesValue = {
  primaryPhoneCallingCode?: string | null;
  primaryPhoneNumber?: string | null;
  primaryPhoneCountryCode?: string | null;
  additionalPhones?: unknown;
} | null;

const isPhoneApp = (value: unknown): value is PhoneApp =>
  typeof value === 'string' && (PHONE_APPS as readonly string[]).includes(value);

// Every stored value passes through here, including ones written before this
// feature existed, so nothing may throw: an unreadable map costs the app
// badges, never the contact.
export const parsePhoneApps = (
  raw: string | null | undefined,
): Record<string, PhoneApp[]> => {
  if (typeof raw !== 'string' || raw.trim() === '') return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {};
  }

  const result: Record<string, PhoneApp[]> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!Array.isArray(value)) continue;
    const apps = value.filter(isPhoneApp);
    if (apps.length === 0) continue;

    // Keys written by an older build (or by hand) may be in local form.
    const normalized = normalizePhoneNumber(key)?.e164;
    if (normalized === undefined) continue;
    result[normalized] = apps;
  }
  return result;
};

export const serializePhoneApps = (entries: PhoneEntry[]): string => {
  const map: Record<string, PhoneApp[]> = {};
  for (const entry of entries) {
    if (entry.apps.length > 0) map[entry.e164] = entry.apps;
  }
  // '' rather than '{}' so a contact with no app tagged stores nothing at all.
  return Object.keys(map).length === 0 ? '' : JSON.stringify(map);
};

export const makePhoneEntry = (
  raw: string,
  apps: PhoneApp[],
  isPrimary = false,
): PhoneEntry | null => {
  const normalized = normalizePhoneNumber(raw);
  if (normalized === null) return null;

  return {
    callingCode: normalized.callingCode,
    number: normalized.nationalNumber,
    e164: normalized.e164,
    isPrimary,
    apps,
  };
};

export const phoneEntries = (
  phones: PhonesValue,
  phoneAppsRaw: string | null | undefined,
): PhoneEntry[] => {
  const appsByNumber = parsePhoneApps(phoneAppsRaw);
  const entries: PhoneEntry[] = [];
  const seen = new Set<string>();

  const push = (raw: string, isPrimary: boolean) => {
    const normalized = normalizePhoneNumber(raw);
    if (normalized === null || seen.has(normalized.e164)) return;
    seen.add(normalized.e164);
    entries.push({
      callingCode: normalized.callingCode,
      number: normalized.nationalNumber,
      e164: normalized.e164,
      isPrimary,
      apps: appsByNumber[normalized.e164] ?? [],
    });
  };

  const primary = `${phones?.primaryPhoneCallingCode ?? ''}${phones?.primaryPhoneNumber ?? ''}`;
  if (primary.trim() !== '') push(primary, true);

  const additional = phones?.additionalPhones;
  if (Array.isArray(additional)) {
    for (const item of additional) {
      if (typeof item !== 'object' || item === null) continue;
      const record = item as Record<string, unknown>;
      const callingCode =
        typeof record.callingCode === 'string' ? record.callingCode : '';
      const number = typeof record.number === 'string' ? record.number : '';
      if (`${callingCode}${number}`.trim() === '') continue;
      push(`${callingCode}${number}`, false);
    }
  }

  return entries;
};

// The countryCode subfield is required by the composite's shape but is only
// ever used for flag display; every number this app handles normalizes to an
// Afghan calling code or keeps its own, so 'AF' is the honest default and a
// foreign number simply carries its calling code instead.
const countryCodeFor = (callingCode: string): string =>
  callingCode === '+93' ? 'AF' : '';

export const toPhonesValue = (entries: PhoneEntry[]) => {
  const [primary, ...rest] = entries;

  if (primary === undefined) {
    // '' rather than null: the composite stores empty strings for a cleared
    // number, and mixing the two makes "has a phone?" inconsistent.
    return {
      primaryPhoneCallingCode: '',
      primaryPhoneNumber: '',
      primaryPhoneCountryCode: '',
      additionalPhones: null,
    };
  }

  return {
    primaryPhoneCallingCode: primary.callingCode,
    primaryPhoneNumber: primary.number,
    primaryPhoneCountryCode: countryCodeFor(primary.callingCode),
    additionalPhones:
      rest.length === 0
        ? null
        : rest.map((entry) => ({
            number: entry.number,
            callingCode: entry.callingCode,
            countryCode: countryCodeFor(entry.callingCode),
          })),
  };
};
