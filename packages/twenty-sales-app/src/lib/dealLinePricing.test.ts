import { describe, expect, it } from 'vitest';

import {
  buildFactorQuantities,
  buildPriceOverrides,
  catalogFixedAmounts,
  catalogMetricRate,
  effectiveFixedAmounts,
  effectivePricingFactors,
  emptyDealLineDraft,
  lineCurrencyOptions,
  parseAmountInput,
} from './dealLinePricing';
import type { DealLineDraft, PricedProduct } from './dealLinePricing';

const product: PricedProduct = {
  pricingModel: 'PER_FACTOR',
  pricingFactors: [
    { name: 'Doctors', unitPrice: 100, billingFrequency: 'ANNUAL' },
    { name: 'Employees', unitPrice: 70, billingFrequency: 'MONTHLY' },
  ],
  priceBook: {
    AFN: { install: 15000, annual: 7000 },
    USD: { install: 200, annual: 100 },
  },
  baseInstallPrice: { amountMicros: 15_000_000_000, currencyCode: 'AFN' },
  baseAnnualPrice: { amountMicros: 7_000_000_000, currencyCode: 'AFN' },
};

const draftWith = (patch: Partial<DealLineDraft>): DealLineDraft => ({
  ...emptyDealLineDraft(),
  productId: 'p1',
  currencyCode: 'AFN',
  ...patch,
});

describe('parseAmountInput', () => {
  it('should read Persian digits and grouped numbers a seller may type', () => {
    expect(parseAmountInput('۱۲۵')).toBe(125);
    expect(parseAmountInput('15,000')).toBe(15000);
  });

  it('should treat an empty or invalid entry as "no value given"', () => {
    expect(parseAmountInput('')).toBeNull();
    expect(parseAmountInput('   ')).toBeNull();
    expect(parseAmountInput('abc')).toBeNull();
    expect(parseAmountInput(undefined)).toBeNull();
    expect(parseAmountInput('-5')).toBeNull();
  });

  it('should keep a typed zero, which is a real price decision', () => {
    expect(parseAmountInput('0')).toBe(0);
  });
});

describe('lineCurrencyOptions', () => {
  it('should list the currencies the product is priced in first', () => {
    expect(lineCurrencyOptions(product)).toEqual(['AFN', 'USD']);
  });

  it('should still offer the other currency for a single-currency product', () => {
    expect(
      lineCurrencyOptions({
        ...product,
        priceBook: null,
        baseInstallPrice: { amountMicros: 200_000_000, currencyCode: 'USD' },
        baseAnnualPrice: null,
      }),
    ).toEqual(['USD', 'AFN']);
  });
});

describe('catalogFixedAmounts', () => {
  it('should read the price book entry for the chosen currency', () => {
    expect(catalogFixedAmounts(product, 'USD')).toEqual({
      install: 200,
      annual: 100,
    });
  });

  it('should fall back to the base prices when there is no price book', () => {
    expect(catalogFixedAmounts({ ...product, priceBook: null }, 'AFN')).toEqual({
      install: 15000,
      annual: 7000,
    });
  });

  it('should offer no amount in a currency the catalog does not price', () => {
    expect(
      catalogFixedAmounts({ ...product, priceBook: null }, 'USD'),
    ).toEqual({ install: null, annual: null });
  });
});

describe('catalogMetricRate', () => {
  it('should suggest the catalog rate in the product primary currency', () => {
    expect(catalogMetricRate(product, 'Doctors', 'AFN')).toBe(100);
  });

  it('should suggest nothing in another currency, since metric rates are single-currency', () => {
    expect(catalogMetricRate(product, 'Doctors', 'USD')).toBeNull();
  });
});

describe('effectivePricingFactors', () => {
  it('should price at the catalog rates when the seller changes nothing', () => {
    expect(
      effectivePricingFactors(product, draftWith({}), ['Doctors', 'Employees']),
    ).toEqual([
      { name: 'Doctors', unitPrice: 100, billingFrequency: 'ANNUAL' },
      { name: 'Employees', unitPrice: 70, billingFrequency: 'MONTHLY' },
    ]);
  });

  it('should price at the restated rate and keep the catalog cadence', () => {
    expect(
      effectivePricingFactors(
        product,
        draftWith({ metricRates: { Doctors: '85' } }),
        ['Doctors'],
      ),
    ).toEqual([{ name: 'Doctors', unitPrice: 85, billingFrequency: 'ANNUAL' }]);
  });

  it('should drop a metric that has no rate in this currency rather than price it at zero', () => {
    expect(
      effectivePricingFactors(product, draftWith({ currencyCode: 'USD' }), [
        'Doctors',
      ]),
    ).toEqual([]);
  });
});

describe('effectiveFixedAmounts', () => {
  it('should use the catalog amounts for the chosen currency', () => {
    expect(effectiveFixedAmounts(product, draftWith({ currencyCode: 'USD' }))).toEqual(
      { install: 200, annual: 100 },
    );
  });

  it('should use what the seller typed over the catalog', () => {
    expect(
      effectiveFixedAmounts(product, draftWith({ fixedInstall: '12000' })),
    ).toEqual({ install: 12000, annual: 7000 });
  });
});

describe('buildFactorQuantities', () => {
  it('should send only the metrics that got a real quantity', () => {
    expect(
      buildFactorQuantities(
        draftWith({ metricQuantities: { Doctors: '5', Employees: '', Beds: '0' } }),
        ['Doctors', 'Employees', 'Beds'],
      ),
    ).toEqual({ Doctors: 5 });
  });

  it('should ignore quantities for metrics this line does not price', () => {
    expect(
      buildFactorQuantities(
        draftWith({ metricQuantities: { Doctors: '5', Stale: '9' } }),
        ['Doctors'],
      ),
    ).toEqual({ Doctors: 5 });
  });
});

describe('buildPriceOverrides', () => {
  it('should send nothing when the seller accepts every suggested number', () => {
    expect(
      buildPriceOverrides(
        product,
        draftWith({
          fixedInstall: '15000',
          fixedAnnual: '7000',
          metricRates: { Doctors: '100' },
        }),
        ['Doctors'],
      ),
    ).toBeNull();
  });

  it('should send only the metric rate the seller actually changed', () => {
    expect(
      buildPriceOverrides(
        product,
        draftWith({ metricRates: { Doctors: '85', Employees: '70' } }),
        ['Doctors', 'Employees'],
      ),
    ).toEqual({ factorRates: { Doctors: 85 } });
  });

  it('should send the currency when the line is quoted in another one', () => {
    expect(
      buildPriceOverrides(
        product,
        draftWith({ currencyCode: 'USD', fixedInstall: '200' }),
        [],
      ),
    ).toEqual({ currencyCode: 'USD' });
  });

  it('should send restated fixed amounts', () => {
    expect(
      buildPriceOverrides(
        product,
        draftWith({ fixedInstall: '12000', fixedAnnual: '0' }),
        [],
      ),
    ).toEqual({ fixedInstall: 12000, fixedAnnual: 0 });
  });

  it('should send a rate for a metric the catalog does not price in this currency', () => {
    expect(
      buildPriceOverrides(
        product,
        draftWith({ currencyCode: 'USD', metricRates: { Doctors: '2' } }),
        ['Doctors'],
      ),
    ).toEqual({ currencyCode: 'USD', factorRates: { Doctors: 2 } });
  });
});
