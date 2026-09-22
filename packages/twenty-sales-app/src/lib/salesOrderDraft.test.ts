import { describe, expect, it } from 'vitest';

import {
  buildPayloadLines,
  defaultValidUntil,
  type DraftLine,
  draftLinesFromDeal,
  summarizeDraft,
  validDraftLines,
} from './salesOrderDraft';

const money = (units: number, currencyCode = 'AFN') => ({
  amountMicros: units * 1_000_000,
  currencyCode,
});

describe('draftLinesFromDeal', () => {
  it('splits a line into separate one-time and annual lines, and drops removed lines', () => {
    const lines = draftLinesFromDeal([
      { id: 'a', name: 'Line A', quantity: 2, discountPercent: null, lineStatus: null, installPrice: money(1000), annualPrice: money(48000), product: { id: 'p1', name: 'Accounting' } },
      { id: 'b', name: 'Line B', quantity: null, discountPercent: null, lineStatus: null, installPrice: money(4000), annualPrice: null, product: null },
      { id: 'c', name: 'Gone', quantity: 1, discountPercent: null, lineStatus: 'REMOVED', installPrice: money(1), annualPrice: null, product: null },
    ]);
    // The old code dropped the one-time install whenever an annual price existed;
    // now the two cadences are separate lines and no amount is lost.
    expect(lines.map((l) => [l.description, l.quantity, l.unitPrice, l.cadence])).toEqual([
      ['Accounting — یک‌بار (نصب)', 2, 1000, 'oneTime'],
      ['Accounting — سالانه', 2, 48000, 'annual'],
      ['Line B', 1, 4000, 'oneTime'],
    ]);
  });

  it('separates the fixed one-time fee from the monthly metric part folded into install', () => {
    // installPrice = fixed install (500) + monthly metric (1500) = 2000.
    const lines = draftLinesFromDeal(
      [
        { id: 'a', name: 'Line A', quantity: 1, discountPercent: 5, lineStatus: null, installPrice: money(2000), annualPrice: null, product: { id: 'p1', name: 'Accounting' }, factorQuantities: { کاربر: 3 }, priceOverrides: { fixedInstall: 500 } },
      ],
      [{ id: 'p1', pricingModel: 'PER_FACTOR', pricingFactors: [{ name: 'کاربر', unitPrice: 500, billingFrequency: 'MONTHLY' }] }],
    );
    expect(lines.map((l) => [l.cadence, l.unitPrice])).toEqual([
      ['oneTime', 500],
      ['monthly', 1500],
    ]);
    // The line breakdown is preserved on the first split line.
    expect(lines[0].details).toContain('کاربر');
    expect(lines[0].details).toContain('تخفیف');
  });
});

describe('summarizeDraft', () => {
  it('multiplies monthly by the months and applies the extra discount', () => {
    const lines: DraftLine[] = [
      { key: '1', description: 'Install', quantity: 1, unitPrice: 1000, unit: '', details: '', cadence: 'oneTime' },
      { key: '2', description: 'Monthly', quantity: 2, unitPrice: 100, unit: '', details: '', cadence: 'monthly' },
    ];
    const summary = summarizeDraft(lines, 12, 10);
    expect(summary.oneTime).toBe(1000);
    expect(summary.monthly).toBe(200);
    expect(summary.monthlyContract).toBe(2400); // 200 × 12 months
    expect(summary.subtotal).toBe(3400); // 1000 one-time + 2400 recurring
    expect(summary.discount).toBeCloseTo(340); // 10%
    expect(summary.grandTotal).toBeCloseTo(3060);
  });
});

describe('buildPayloadLines', () => {
  it('trims lines, multiplies monthly qty by months, and bakes the discount into unit price', () => {
    const lines: DraftLine[] = [
      { key: '1', description: ' Install ', quantity: 1, unitPrice: 1000, unit: ' license ', details: ' نصب \n', cadence: 'oneTime' },
      { key: '2', description: 'Monthly', quantity: 2, unitPrice: 100, unit: '', details: '', cadence: 'monthly' },
      { key: '3', description: '', quantity: 1, unitPrice: 5, unit: '', details: '', cadence: 'oneTime' },
    ];
    expect(buildPayloadLines(lines, 12, 10)).toEqual([
      { description: 'Install', quantity: 1, unitPrice: 900, unit: 'license', details: 'نصب' },
      { description: 'Monthly', quantity: 24, unitPrice: 90 },
    ]);
  });
});

describe('validDraftLines', () => {
  it('keeps only named, priced lines', () => {
    const lines: DraftLine[] = [
      { key: '1', description: 'Keep', quantity: 1, unitPrice: 5, unit: '', details: '', cadence: 'oneTime' },
      { key: '2', description: '', quantity: 1, unitPrice: 5, unit: '', details: '', cadence: 'oneTime' },
      { key: '3', description: 'ZeroQty', quantity: 0, unitPrice: 5, unit: '', details: '', cadence: 'oneTime' },
    ];
    expect(validDraftLines(lines).map((l) => l.description)).toEqual(['Keep']);
  });
});

describe('defaultValidUntil', () => {
  it('is thirty days after the given day', () => {
    expect(defaultValidUntil(new Date('2026-09-10T12:00:00Z'))).toBe('2026-10-10');
  });
});
