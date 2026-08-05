import { describe, expect, it } from 'vitest';

import {
  estimateProductPrice,
  hasPriceEstimate,
  metricDiscountAmount,
} from './productPricing';

describe('metricDiscountAmount', () => {
  const base = { name: 'doctor', unitPrice: 400 } as const;

  it('should take a percentage off the subtotal', () => {
    expect(
      metricDiscountAmount(2_000, {
        ...base,
        discountType: 'PERCENTAGE',
        discountValue: 10,
      }),
    ).toBe(200);
  });

  it('should take a fixed amount off the subtotal', () => {
    expect(
      metricDiscountAmount(2_000, {
        ...base,
        discountType: 'FIXED_AMOUNT',
        discountValue: 150,
      }),
    ).toBe(150);
  });

  it('should never discount more than the subtotal', () => {
    expect(
      metricDiscountAmount(100, {
        ...base,
        discountType: 'FIXED_AMOUNT',
        discountValue: 500,
      }),
    ).toBe(100);
    expect(
      metricDiscountAmount(100, {
        ...base,
        discountType: 'PERCENTAGE',
        discountValue: 250,
      }),
    ).toBe(100);
  });

  it('should discount nothing for a metric that carries no discount', () => {
    expect(metricDiscountAmount(2_000, base)).toBe(0);
    expect(
      metricDiscountAmount(2_000, {
        ...base,
        discountType: 'PERCENTAGE',
        discountValue: 0,
      }),
    ).toBe(0);
  });
});

describe('estimateProductPrice', () => {
  it('should add the one-time fixed fee to the monthly metric subtotals', () => {
    const estimate = estimateProductPrice({
      pricingFactors: [{ name: 'user', unitPrice: 100, billingFrequency: 'MONTHLY' }],
      factorQuantities: { user: 5 },
      fixedInstall: 50_000,
      fixedAnnual: 0,
    });

    expect(estimate.installTotal).toBe(50_500);
    expect(estimate.annualTotal).toBe(0);
  });

  it('should keep the fixed annual fee and annual metrics in the annual total', () => {
    const estimate = estimateProductPrice({
      pricingFactors: [
        { name: 'user', unitPrice: 100, billingFrequency: 'MONTHLY' },
        { name: 'branch', unitPrice: 1_200, billingFrequency: 'ANNUAL' },
      ],
      factorQuantities: { user: 2, branch: 3 },
      fixedInstall: 10_000,
      fixedAnnual: 6_000,
    });

    expect(estimate.installTotal).toBe(10_200);
    expect(estimate.annualTotal).toBe(9_600);
  });

  it('should accumulate hourly metrics into the install total without converting', () => {
    const estimate = estimateProductPrice({
      pricingFactors: [{ name: 'support', unitPrice: 50, billingFrequency: 'HOURLY' }],
      factorQuantities: { support: 4 },
      fixedInstall: 0,
      fixedAnnual: 0,
    });

    expect(estimate.hourly).toBe(200);
    expect(estimate.installTotal).toBe(200);
  });

  it('should return the fixed amounts alone when no quantities are entered', () => {
    const estimate = estimateProductPrice({
      pricingFactors: [{ name: 'user', unitPrice: 100, billingFrequency: 'MONTHLY' }],
      factorQuantities: {},
      fixedInstall: 75_000,
      fixedAnnual: 12_000,
    });

    expect(estimate.installTotal).toBe(75_000);
    expect(estimate.annualTotal).toBe(12_000);
  });

  it('should treat metrics without a billing frequency as monthly', () => {
    const estimate = estimateProductPrice({
      pricingFactors: [{ name: 'user', unitPrice: 100 }],
      factorQuantities: { user: 2 },
      fixedInstall: 0,
      fixedAnnual: 0,
    });

    expect(estimate.monthly).toBe(200);
  });

  it('should ignore zero and negative quantities, matching the server tier bands', () => {
    const estimate = estimateProductPrice({
      pricingFactors: [
        { name: 'user', unitPrice: 100, billingFrequency: 'MONTHLY' },
        { name: 'branch', unitPrice: 500, billingFrequency: 'MONTHLY' },
      ],
      factorQuantities: { user: 0, branch: -3 },
      fixedInstall: 1_000,
      fixedAnnual: 0,
    });

    expect(estimate.installTotal).toBe(1_000);
  });

  it('should ignore quantities for metrics the product does not define', () => {
    const estimate = estimateProductPrice({
      pricingFactors: [{ name: 'user', unitPrice: 100, billingFrequency: 'MONTHLY' }],
      factorQuantities: { user: 1, ghost: 99 },
      fixedInstall: 0,
      fixedAnnual: 0,
    });

    expect(estimate.installTotal).toBe(100);
  });
});

describe('hasPriceEstimate', () => {
  it('should be false when nothing is priced yet', () => {
    const estimate = estimateProductPrice({
      pricingFactors: [{ name: 'user', unitPrice: 100, billingFrequency: 'MONTHLY' }],
      factorQuantities: {},
      fixedInstall: 0,
      fixedAnnual: 0,
    });

    expect(hasPriceEstimate(estimate)).toBe(false);
  });

  it('should be true as soon as a fixed amount applies', () => {
    const estimate = estimateProductPrice({
      pricingFactors: [],
      factorQuantities: {},
      fixedInstall: 5_000,
      fixedAnnual: 0,
    });

    expect(hasPriceEstimate(estimate)).toBe(true);
  });
});

describe('estimateProductPrice with per-metric discounts', () => {
  it('should discount a metric within its own cadence bucket only', () => {
    const estimate = estimateProductPrice({
      pricingFactors: [
        { name: 'user', unitPrice: 100, billingFrequency: 'MONTHLY' },
        {
          name: 'employee',
          unitPrice: 1_000,
          billingFrequency: 'ANNUAL',
          discountType: 'PERCENTAGE',
          discountValue: 20,
        },
      ],
      factorQuantities: { user: 3, employee: 2 },
      fixedInstall: 0,
      fixedAnnual: 0,
    });

    // The undiscounted monthly metric is untouched by the annual discount.
    expect(estimate.monthly).toBe(300);
    // 2 employees at 1,000 = 2,000 annual, less 20%.
    expect(estimate.annualMetrics).toBe(1_600);
  });

  it('should leave a legacy metric with no discount keys priced as entered', () => {
    const estimate = estimateProductPrice({
      pricingFactors: [{ name: 'user', unitPrice: 100, billingFrequency: 'MONTHLY' }],
      factorQuantities: { user: 4 },
      fixedInstall: 0,
      fixedAnnual: 0,
    });

    expect(estimate.monthly).toBe(400);
  });
});
