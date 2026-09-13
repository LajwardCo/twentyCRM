import { describe, expect, it } from 'vitest';

import { type DealProductLine } from '../api/records';
import { describeDealLine } from './salesOrderLineDetails';

const money = (units: number, currencyCode = 'AFN') => ({ amountMicros: units * 1_000_000, currencyCode });

const base: DealProductLine = {
  id: 'l1',
  name: 'Accounting',
  quantity: 1,
  discountPercent: null,
  lineStatus: null,
  installPrice: money(15000),
  annualPrice: money(7000),
  product: { id: 'p1', name: 'Accounting' },
};

const fixedProduct = { pricingModel: 'FIXED', pricingFactors: null };
const metricProduct = {
  pricingModel: 'PER_FACTOR',
  pricingFactors: [
    { name: 'کاربر', unitPrice: 500, billingFrequency: 'MONTHLY' as const },
    { name: 'انبار', unitPrice: 2000, billingFrequency: 'ANNUAL' as const },
  ],
};

describe('describeDealLine', () => {
  it('names the fixed amounts of a fixed-price line', () => {
    expect(describeDealLine(base, fixedProduct)).toEqual(['نصب: ۱۵٬۰۰۰ ؋', 'سالانه: ۷٬۰۰۰ ؋']);
  });

  it('says nothing for a bare line with no prices', () => {
    expect(describeDealLine({ ...base, installPrice: null, annualPrice: null }, fixedProduct)).toEqual([]);
  });

  it('prints one metric per line from the catalog rates, with the period', () => {
    const line: DealProductLine = {
      ...base,
      installPrice: money(2500),
      annualPrice: money(2000),
      factorQuantities: { کاربر: 5, انبار: 1 },
    };
    expect(describeDealLine(line, metricProduct)).toEqual([
      'کاربر × ۵ @ ۵۰۰ ؋ = ۲٬۵۰۰ ؋ (ماهانه)',
      'انبار × ۱ @ ۲٬۰۰۰ ؋ = ۲٬۰۰۰ ؋ (سالانه)',
    ]);
  });

  it('prefers the rate the seller restated over the catalog', () => {
    const line: DealProductLine = {
      ...base,
      installPrice: money(2000),
      annualPrice: null,
      factorQuantities: { کاربر: 5 },
      priceOverrides: { factorRates: { کاربر: 400 } },
    };
    expect(describeDealLine(line, metricProduct)).toEqual(['کاربر × ۵ @ ۴۰۰ ؋ = ۲٬۰۰۰ ؋ (ماهانه)']);
  });

  it('names only the fixed part of a fixed-plus-metrics line, from the catalog', () => {
    // installPrice (16,000) is fixed 15,000 + the metric's 1,000: the metric
    // line already says 1,000, so "install" must say 15,000, not 16,000.
    const line: DealProductLine = {
      ...base,
      installPrice: money(16000),
      annualPrice: money(7000),
      factorQuantities: { کاربر: 2 },
    };
    const product = {
      ...metricProduct,
      pricingModel: 'FIXED_PLUS_METRICS',
      baseInstallPrice: money(15000),
      baseAnnualPrice: money(7000),
    };
    expect(describeDealLine(line, product)).toEqual([
      'نصب: ۱۵٬۰۰۰ ؋',
      'سالانه: ۷٬۰۰۰ ؋',
      'کاربر × ۲ @ ۵۰۰ ؋ = ۱٬۰۰۰ ؋ (ماهانه)',
    ]);
  });

  it('prefers the restated fixed amount, then the price book of the line currency', () => {
    const line: DealProductLine = {
      ...base,
      installPrice: money(1200, 'USD'),
      annualPrice: null,
      factorQuantities: { کاربر: 2 },
      priceOverrides: { currencyCode: 'USD', fixedInstall: 180 },
    };
    const product = {
      ...metricProduct,
      baseInstallPrice: money(15000),
      priceBook: { USD: { install: 200, annual: 90 } },
    };
    // the catalog's ؋ metric rate does not apply to a $ line: quantity only
    expect(describeDealLine(line, product)).toEqual(['نصب: $۱۸۰', 'سالانه: $۹۰', 'کاربر × ۲ (ماهانه)']);
  });

  it('says nothing about fixed amounts for a metric-only line with no catalog amount', () => {
    const line: DealProductLine = { ...base, installPrice: money(1000), annualPrice: null, factorQuantities: { کاربر: 2 } };
    expect(describeDealLine(line, metricProduct)).toEqual(['کاربر × ۲ @ ۵۰۰ ؋ = ۱٬۰۰۰ ؋ (ماهانه)']);
  });

  it('reads the package, tier band and subtotals from the price snapshot', () => {
    const line: DealProductLine = {
      ...base,
      installPrice: money(4500, 'USD'),
      annualPrice: null,
      discountPercent: 10,
      factorQuantities: { doctor: 10 },
      priceOverrides: { currencyCode: 'USD' },
      priceSnapshot: {
        packageName: 'Clinic Pro',
        versionNumber: 3,
        breakdown: [
          { factor: 'doctor', quantity: 10, matchedBand: { amount: 450 }, subtotal: 4500, billingFrequency: 'MONTHLY' },
        ],
      },
    };
    expect(describeDealLine(line, metricProduct)).toEqual([
      'بسته: Clinic Pro (نسخه ۳)',
      'doctor × ۱۰ @ $۴۵۰ = $۴٬۵۰۰ (ماهانه)',
      'تخفیف: ۱۰٪',
    ]);
  });

  it('prints a metric it cannot price as quantity only', () => {
    const line: DealProductLine = { ...base, installPrice: null, annualPrice: null, factorQuantities: { seats: 3 } };
    expect(describeDealLine(line, undefined)).toEqual(['seats × ۳']);
  });
});
