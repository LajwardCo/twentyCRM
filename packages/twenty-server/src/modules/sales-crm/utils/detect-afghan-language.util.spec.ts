import { detectAfghanLanguage } from 'src/modules/sales-crm/utils/detect-afghan-language.util';

describe('detectAfghanLanguage', () => {
  it('labels Dari as fa', () => {
    // Real gpt-4o-transcribe output, production, 2026-09-03.
    expect(
      detectAfghanLanguage(
        'سلام دکتر صاحب، در مورد سیستم مدیریت شفاخانه تماس گرفتم.',
      ),
    ).toBe('fa');
  });

  it('labels Pashto as ps on its own letters', () => {
    expect(
      detectAfghanLanguage('سلام ښاغلیه، زه د روغتون د مدیریت سیسټم په اړه زنګ وهم.'),
    ).toBe('ps');
  });

  it('labels English as en', () => {
    expect(detectAfghanLanguage('Interested, wants a demo next week.')).toBe('en');
  });

  it('calls a code-switched line Pashto when any Pashto letter appears', () => {
    // Agents mix languages mid-sentence; the distinctive script wins.
    expect(detectAfghanLanguage('okay ډاکټر, call me tomorrow')).toBe('ps');
  });

  it('prefers Arabic script over incidental Latin', () => {
    expect(detectAfghanLanguage('CRM سیستم مدیریت')).toBe('fa');
  });

  it('returns null for text with no letters at all', () => {
    expect(detectAfghanLanguage('   ۱۲۳ ... ')).toBeNull();
    expect(detectAfghanLanguage('')).toBeNull();
  });
});
