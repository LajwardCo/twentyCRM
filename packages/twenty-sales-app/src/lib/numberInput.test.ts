import { describe, expect, it } from 'vitest';

import {
  isPartialNumber,
  normalizeNumericText,
  numberToInputText,
  parseDecimalInput,
} from './numberInput';

describe('normalizeNumericText', () => {
  it('should turn a Persian-typed price into something Number() understands', () => {
    expect(normalizeNumericText('۱۲٬۵۰۰٫۷۵')).toBe('12500.75');
  });

  it('should read Arabic-Indic digits as well as Persian ones', () => {
    expect(normalizeNumericText('١٢٣')).toBe('123');
  });

  it('should drop grouping, spaces and the bidi marks a paste drags along', () => {
    expect(normalizeNumericText('15,000')).toBe('15000');
    expect(normalizeNumericText('‏12 500 ')).toBe('12500');
  });
});

describe('parseDecimalInput', () => {
  it('should keep the fractional part of a price', () => {
    expect(parseDecimalInput('12.5')).toBe(12.5);
    expect(parseDecimalInput('۱۲٫۵')).toBe(12.5);
    expect(parseDecimalInput('0.05')).toBe(0.05);
  });

  it('should treat an unfinished or empty entry as "no value given"', () => {
    expect(parseDecimalInput('')).toBeNull();
    expect(parseDecimalInput('   ')).toBeNull();
    expect(parseDecimalInput('.')).toBeNull();
    expect(parseDecimalInput('-')).toBeNull();
    expect(parseDecimalInput('abc')).toBeNull();
    expect(parseDecimalInput(null)).toBeNull();
    expect(parseDecimalInput(undefined)).toBeNull();
  });

  it('should keep a typed zero, which is a real price decision', () => {
    expect(parseDecimalInput('0')).toBe(0);
    expect(parseDecimalInput('0.0')).toBe(0);
  });

  it('should reject a negative unless the field allows one', () => {
    expect(parseDecimalInput('-5')).toBeNull();
    expect(parseDecimalInput('-5', { allowNegative: true })).toBe(-5);
  });

  it('should reject a fraction in a counted field', () => {
    expect(parseDecimalInput('2.5', { integer: true })).toBeNull();
    expect(parseDecimalInput('2', { integer: true })).toBe(2);
  });
});

describe('isPartialNumber', () => {
  it('should let a half-typed decimal stay in the box', () => {
    expect(isPartialNumber('')).toBe(true);
    expect(isPartialNumber('12.')).toBe(true);
    expect(isPartialNumber('.5')).toBe(true);
    expect(isPartialNumber('12.50')).toBe(true);
    expect(isPartialNumber('۱۲٫')).toBe(true);
    expect(isPartialNumber('15,000')).toBe(true);
  });

  it('should refuse text that can never become a number', () => {
    expect(isPartialNumber('abc')).toBe(false);
    expect(isPartialNumber('1.2.3')).toBe(false);
    expect(isPartialNumber('1e5')).toBe(false);
  });

  it('should refuse a decimal point in a counted field', () => {
    expect(isPartialNumber('2.', { integer: true })).toBe(false);
  });

  it('should refuse a minus unless the field allows one', () => {
    expect(isPartialNumber('-')).toBe(false);
    expect(isPartialNumber('-', { allowNegative: true })).toBe(true);
  });
});

describe('numberToInputText', () => {
  it('should show nothing for a value the record does not have', () => {
    expect(numberToInputText(null)).toBe('');
    expect(numberToInputText(undefined)).toBe('');
  });

  it('should show a stored number as plain Latin text', () => {
    expect(numberToInputText(12.5)).toBe('12.5');
    expect(numberToInputText(0)).toBe('0');
  });
});
