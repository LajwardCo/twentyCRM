import { isRtlLocale } from '@/localization/utils/isRtlLocale';

describe('isRtlLocale', () => {
  it('should return true for right-to-left locales', () => {
    expect(isRtlLocale('ar-SA')).toBe(true);
    expect(isRtlLocale('he-IL')).toBe(true);
    expect(isRtlLocale('fa-AF')).toBe(true);
  });

  it('should return false for left-to-right locales', () => {
    expect(isRtlLocale('en')).toBe(false);
    expect(isRtlLocale('fr-FR')).toBe(false);
    expect(isRtlLocale('zh-CN')).toBe(false);
  });

  it('should return false for nullish or unknown values', () => {
    expect(isRtlLocale(undefined)).toBe(false);
    expect(isRtlLocale(null)).toBe(false);
    expect(isRtlLocale('not-a-locale')).toBe(false);
  });
});
