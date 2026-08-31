import {
  normalizePhoneNumber,
  phoneMatchKey,
} from '../phone/normalizePhoneNumber';

describe('normalizePhoneNumber', () => {
  it('normalizes a local Afghan number with a trunk zero', () => {
    expect(normalizePhoneNumber('0790123456')).toEqual({
      callingCode: '+93',
      nationalNumber: '790123456',
      e164: '+93790123456',
    });
  });

  it('normalizes the same number written internationally', () => {
    expect(normalizePhoneNumber('+93790123456')?.e164).toBe('+93790123456');
  });

  it('treats a bare 93 prefix as the country code, not a local number', () => {
    expect(normalizePhoneNumber('93790123456')?.e164).toBe('+93790123456');
  });

  it('strips spaces, dashes and parentheses', () => {
    expect(normalizePhoneNumber('0790 123-456')?.e164).toBe('+93790123456');
  });

  it('converts Persian and Eastern Arabic digits', () => {
    expect(normalizePhoneNumber('۰۷۹۰۱۲۳۴۵۶')?.e164).toBe('+93790123456');
    expect(normalizePhoneNumber('٠٧٩٠١٢٣٤٥٦')?.e164).toBe('+93790123456');
  });

  it('keeps a foreign number intact', () => {
    expect(normalizePhoneNumber('+1 415 555 0132')?.e164).toBe('+14155550132');
  });

  it('returns null for empty or non-numeric input', () => {
    expect(normalizePhoneNumber('')).toBeNull();
    expect(normalizePhoneNumber('   ')).toBeNull();
    expect(normalizePhoneNumber('abc')).toBeNull();
  });

  it('returns null for a number too short to be real', () => {
    expect(normalizePhoneNumber('12345')).toBeNull();
  });

  it('phoneMatchKey returns the e164 string or null', () => {
    expect(phoneMatchKey('0790123456')).toBe('+93790123456');
    expect(phoneMatchKey('abc')).toBeNull();
  });

  it('gives every spelling of one number the same match key', () => {
    const keys = [
      '0790123456',
      '+93790123456',
      '93790123456',
      '0790 123 456',
      '۰۷۹۰۱۲۳۴۵۶',
    ].map(phoneMatchKey);

    expect(new Set(keys).size).toBe(1);
  });
});
