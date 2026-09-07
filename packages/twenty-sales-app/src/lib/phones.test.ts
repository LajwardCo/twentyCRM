import { describe, expect, it } from 'vitest';

import {
  makePhoneEntry,
  parsePhoneApps,
  phoneEntries,
  serializePhoneApps,
  toPhonesValue,
} from './phones';

const phones = (primary: string | null, additional: unknown = null) => ({
  primaryPhoneCallingCode: primary === null ? null : '+93',
  primaryPhoneNumber: primary,
  additionalPhones: additional,
});

describe('parsePhoneApps', () => {
  it('reads the stored map', () => {
    expect(parsePhoneApps('{"+93790123456":["WHATSAPP","TELEGRAM"]}')).toEqual({
      '+93790123456': ['WHATSAPP', 'TELEGRAM'],
    });
  });

  it('returns an empty map for anything unusable, so a bad value never breaks a contact', () => {
    expect(parsePhoneApps(null)).toEqual({});
    expect(parsePhoneApps('')).toEqual({});
    expect(parsePhoneApps('not json')).toEqual({});
    expect(parsePhoneApps('[1,2,3]')).toEqual({});
    expect(parsePhoneApps('"a string"')).toEqual({});
  });

  it('drops entries that are not lists of known apps', () => {
    expect(
      parsePhoneApps('{"+93700000001":"WHATSAPP","+93700000002":["TELEGRAM","NOPE"],"+93700000003":[]}'),
    ).toEqual({ '+93700000002': ['TELEGRAM'] });
  });

  it('normalizes the keys so a number stored in local form still matches', () => {
    expect(parsePhoneApps('{"0790123456":["IMO"]}')).toEqual({
      '+93790123456': ['IMO'],
    });
  });
});

describe('phoneEntries', () => {
  it('puts the primary first, then the additional numbers', () => {
    const result = phoneEntries(
      phones('790123456', [
        { number: '700111222', callingCode: '+93', countryCode: 'AF' },
      ]),
      '{"+93790123456":["WHATSAPP"]}',
    );

    expect(result.map((e) => [e.e164, e.isPrimary, e.apps])).toEqual([
      ['+93790123456', true, ['WHATSAPP']],
      ['+93700111222', false, []],
    ]);
  });

  it('is empty when the contact has no number at all', () => {
    expect(phoneEntries(phones(null), null)).toEqual([]);
    expect(phoneEntries(null, null)).toEqual([]);
  });

  it('ignores additionalPhones that is not an array or holds junk', () => {
    expect(phoneEntries(phones('790123456', 'nonsense'), null)).toHaveLength(1);
    expect(
      phoneEntries(phones('790123456', [null, {}, { number: 'abc', callingCode: '+93' }]), null),
    ).toHaveLength(1);
  });

  it('drops a duplicate of the primary rather than showing one number twice', () => {
    const result = phoneEntries(
      phones('790123456', [{ number: '0790123456', callingCode: '+93', countryCode: 'AF' }]),
      null,
    );
    expect(result).toHaveLength(1);
  });
});

describe('makePhoneEntry', () => {
  it('normalizes what a seller types', () => {
    expect(makePhoneEntry('0790 123 456', ['WHATSAPP'])).toEqual({
      callingCode: '+93',
      number: '790123456',
      e164: '+93790123456',
      isPrimary: false,
      apps: ['WHATSAPP'],
    });
  });

  it('accepts Persian digits, which is what an Afghan keyboard produces', () => {
    expect(makePhoneEntry('۰۷۹۰۱۲۳۴۵۶', [])?.e164).toBe('+93790123456');
  });

  it('is null for an unusable number', () => {
    expect(makePhoneEntry('', [])).toBeNull();
    expect(makePhoneEntry('12', [])).toBeNull();
    expect(makePhoneEntry('abc', [])).toBeNull();
  });
});

describe('toPhonesValue', () => {
  it('writes the first entry as the primary and the rest as additional', () => {
    const entries = [
      makePhoneEntry('0790123456', ['WHATSAPP'])!,
      makePhoneEntry('0700111222', [])!,
    ];

    expect(toPhonesValue(entries)).toEqual({
      primaryPhoneCallingCode: '+93',
      primaryPhoneNumber: '790123456',
      primaryPhoneCountryCode: 'AF',
      additionalPhones: [
        { number: '700111222', callingCode: '+93', countryCode: 'AF' },
      ],
    });
  });

  it('clears the whole field when the last number is removed', () => {
    expect(toPhonesValue([])).toEqual({
      primaryPhoneCallingCode: '',
      primaryPhoneNumber: '',
      primaryPhoneCountryCode: '',
      additionalPhones: null,
    });
  });
});

describe('serializePhoneApps', () => {
  it('stores only the numbers that actually have an app', () => {
    const entries = [
      makePhoneEntry('0790123456', ['WHATSAPP', 'TELEGRAM'])!,
      makePhoneEntry('0700111222', [])!,
    ];
    expect(serializePhoneApps(entries)).toBe(
      '{"+93790123456":["WHATSAPP","TELEGRAM"]}',
    );
  });

  it('round-trips through parsePhoneApps', () => {
    const entries = [makePhoneEntry('0790123456', ['IMO'])!];
    expect(parsePhoneApps(serializePhoneApps(entries))).toEqual({
      '+93790123456': ['IMO'],
    });
  });

  it('is an empty string when nothing has an app, so no row stores "{}"', () => {
    expect(serializePhoneApps([makePhoneEntry('0790123456', [])!])).toBe('');
    expect(serializePhoneApps([])).toBe('');
  });
});
