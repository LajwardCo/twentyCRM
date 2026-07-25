import { computeFixedPlusMetricsPrice } from 'src/modules/sales-crm/utils/product-fixed-plus-metrics-price.util';

const MICROS = 1_000_000;

describe('computeFixedPlusMetricsPrice', () => {
  it('should add the one-time fixed fee on top of the metric subtotals', () => {
    const result = computeFixedPlusMetricsPrice({
      pricingFactors: [
        { name: 'user', unitPrice: 100, billingFrequency: 'MONTHLY' },
      ],
      factorQuantities: { user: 5 },
      baseInstallMicros: 50_000 * MICROS,
      baseAnnualMicros: 0,
    });

    expect(result.installMicros).toBe(50_500 * MICROS);
    expect(result.annualMicros).toBe(0);
  });

  it('should add the fixed annual fee to annual metric subtotals only', () => {
    const result = computeFixedPlusMetricsPrice({
      pricingFactors: [
        { name: 'user', unitPrice: 100, billingFrequency: 'MONTHLY' },
        { name: 'branch', unitPrice: 1_200, billingFrequency: 'ANNUAL' },
      ],
      factorQuantities: { user: 2, branch: 3 },
      baseInstallMicros: 10_000 * MICROS,
      baseAnnualMicros: 6_000 * MICROS,
    });

    expect(result.installMicros).toBe(10_200 * MICROS);
    expect(result.annualMicros).toBe(9_600 * MICROS);
  });

  it('should accumulate hourly metrics into the install total, uncoverted', () => {
    const result = computeFixedPlusMetricsPrice({
      pricingFactors: [
        { name: 'support', unitPrice: 50, billingFrequency: 'HOURLY' },
      ],
      factorQuantities: { support: 4 },
      baseInstallMicros: 0,
      baseAnnualMicros: 0,
    });

    expect(result.installMicros).toBe(200 * MICROS);
  });

  it('should return the fixed amounts alone when no metric quantities are given', () => {
    const result = computeFixedPlusMetricsPrice({
      pricingFactors: [
        { name: 'user', unitPrice: 100, billingFrequency: 'MONTHLY' },
      ],
      factorQuantities: null,
      baseInstallMicros: 75_000 * MICROS,
      baseAnnualMicros: 12_000 * MICROS,
    });

    expect(result.installMicros).toBe(75_000 * MICROS);
    expect(result.annualMicros).toBe(12_000 * MICROS);
  });

  it('should price metrics alone when no fixed amounts are set', () => {
    const result = computeFixedPlusMetricsPrice({
      pricingFactors: [
        { name: 'user', unitPrice: 100, billingFrequency: 'MONTHLY' },
      ],
      factorQuantities: { user: 3 },
      baseInstallMicros: 0,
      baseAnnualMicros: 0,
    });

    expect(result.installMicros).toBe(300 * MICROS);
    expect(result.annualMicros).toBe(0);
  });

  it('should treat metric rows without a billingFrequency as monthly', () => {
    const result = computeFixedPlusMetricsPrice({
      pricingFactors: [{ name: 'user', unitPrice: 100 }],
      factorQuantities: { user: 2 },
      baseInstallMicros: 0,
      baseAnnualMicros: 0,
    });

    expect(result.installMicros).toBe(200 * MICROS);
    expect(result.annualMicros).toBe(0);
  });

  it('should ignore quantities for metrics the product does not define', () => {
    const result = computeFixedPlusMetricsPrice({
      pricingFactors: [
        { name: 'user', unitPrice: 100, billingFrequency: 'MONTHLY' },
      ],
      factorQuantities: { user: 1, ghost: 99 },
      baseInstallMicros: 1_000 * MICROS,
      baseAnnualMicros: 0,
    });

    expect(result.installMicros).toBe(1_100 * MICROS);
  });

  it('should handle an empty metric table as pure fixed pricing', () => {
    const result = computeFixedPlusMetricsPrice({
      pricingFactors: [],
      factorQuantities: { user: 5 },
      baseInstallMicros: 20_000 * MICROS,
      baseAnnualMicros: 0,
    });

    expect(result.installMicros).toBe(20_000 * MICROS);
  });
});
