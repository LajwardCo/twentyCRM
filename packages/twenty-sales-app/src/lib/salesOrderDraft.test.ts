import { describe, expect, it } from 'vitest';

import {
  defaultValidUntil,
  draftLinesFromDeal,
  draftTotal,
  validDraftLines,
} from './salesOrderDraft';

const money = (units: number, currencyCode = 'AFN') => ({
  amountMicros: units * 1_000_000,
  currencyCode,
});

describe('draftLinesFromDeal', () => {
  it('prices from the annual price, falling back to install, and drops removed lines', () => {
    const lines = draftLinesFromDeal([
      { id: 'a', name: 'Line A', quantity: 2, discountPercent: null, lineStatus: null, installPrice: money(1000), annualPrice: money(48000), product: { id: 'p1', name: 'Accounting' } },
      { id: 'b', name: 'Line B', quantity: null, discountPercent: null, lineStatus: null, installPrice: money(4000), annualPrice: null, product: null },
      { id: 'c', name: 'Gone', quantity: 1, discountPercent: null, lineStatus: 'REMOVED', installPrice: money(1), annualPrice: null, product: null },
    ]);
    expect(lines.map((l) => [l.description, l.quantity, l.unitPrice])).toEqual([
      ['Accounting', 2, 48000],
      ['Line B', 1, 4000],
    ]);
  });

  it('describes each line from its product, one detail per row', () => {
    const [line] = draftLinesFromDeal(
      [
        { id: 'a', name: 'Line A', quantity: 1, discountPercent: 5, lineStatus: null, installPrice: money(1500), annualPrice: null, product: { id: 'p1', name: 'Accounting' }, factorQuantities: { کاربر: 3 } },
      ],
      [{ id: 'p1', pricingModel: 'PER_FACTOR', pricingFactors: [{ name: 'کاربر', unitPrice: 500, billingFrequency: 'MONTHLY' }] }],
    );
    expect(line.details).toBe('کاربر × ۳ @ ۵۰۰ ؋ = ۱٬۵۰۰ ؋ (ماهانه)\nتخفیف: ۵٪');
  });
});

describe('validDraftLines / draftTotal', () => {
  it('keeps only priced, named lines and totals them', () => {
    const lines = [
      { key: '1', description: ' Package ', quantity: 2, unitPrice: 10, unit: ' license ', details: ' نصب: ۱۰ ؋ \n' },
      { key: '2', description: '', quantity: 1, unitPrice: 5, unit: '', details: '' },
      { key: '3', description: 'Zero qty', quantity: 0, unitPrice: 5, unit: '', details: '' },
      { key: '4', description: 'Plain', quantity: 1, unitPrice: 5, unit: '', details: '   ' },
    ];
    expect(validDraftLines(lines)).toEqual([
      { description: 'Package', quantity: 2, unitPrice: 10, unit: 'license', details: 'نصب: ۱۰ ؋' },
      { description: 'Plain', quantity: 1, unitPrice: 5 },
    ]);
    expect(draftTotal(lines)).toBe(30);
  });
});

describe('defaultValidUntil', () => {
  it('is thirty days after the given day', () => {
    expect(defaultValidUntil(new Date('2026-09-10T12:00:00Z'))).toBe('2026-10-10');
  });
});
