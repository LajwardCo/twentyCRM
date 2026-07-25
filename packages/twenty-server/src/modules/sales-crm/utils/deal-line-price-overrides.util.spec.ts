import {
  applyFactorRateOverridesToProductFactors,
  applyFactorRateOverridesToTierSchedule,
  impliedDiscountPercent,
  parseLinePriceOverrides,
  parseProductPriceBook,
  resolveLineFixedAmounts,
} from 'src/modules/sales-crm/utils/deal-line-price-overrides.util';
import { type FactorTierSchedule } from 'src/modules/sales-crm/utils/pricing-tier-schedule.util';

describe('parseLinePriceOverrides', () => {
  it('should return an empty override set when the field is absent', () => {
    expect(parseLinePriceOverrides(null)).toEqual({});
    expect(parseLinePriceOverrides(undefined)).toEqual({});
  });

  it('should read a JSON string, since RAW_JSON round-trips as text on some drivers', () => {
    expect(
      parseLinePriceOverrides('{"currencyCode":"USD","fixedInstall":200}'),
    ).toEqual({ currencyCode: 'USD', fixedInstall: 200 });
  });

  it('should keep only well-formed values and drop junk', () => {
    expect(
      parseLinePriceOverrides({
        currencyCode: '',
        fixedInstall: 'abc',
        fixedAnnual: -5,
        factorRates: { Doctors: 12, Broken: 'x', Negative: -1 },
        unknownKey: 'ignored',
      }),
    ).toEqual({ factorRates: { Doctors: 12 } });
  });

  it('should accept a zero rate, since "this metric is free on this deal" is a real decision', () => {
    expect(parseLinePriceOverrides({ factorRates: { Doctors: 0 } })).toEqual({
      factorRates: { Doctors: 0 },
    });
  });
});

describe('parseProductPriceBook', () => {
  it('should return an empty book when the field is absent or malformed', () => {
    expect(parseProductPriceBook(undefined)).toEqual({});
    expect(parseProductPriceBook('not json')).toEqual({});
    expect(parseProductPriceBook([1, 2])).toEqual({});
  });

  it('should normalize currency codes and keep numeric amounts only', () => {
    expect(
      parseProductPriceBook({
        afn: { install: 15000, annual: 7000 },
        USD: { install: 200, annual: 'x' },
        EUR: 'nope',
      }),
    ).toEqual({
      AFN: { install: 15000, annual: 7000 },
      USD: { install: 200 },
    });
  });
});

describe('resolveLineFixedAmounts', () => {
  const baseInstallPrice = {
    amountMicros: 15_000_000_000,
    currencyCode: 'AFN',
  };
  const baseAnnualPrice = { amountMicros: 7_000_000_000, currencyCode: 'AFN' };

  it('should use the product base prices when there is no price book and no override', () => {
    expect(
      resolveLineFixedAmounts({
        priceBook: {},
        overrides: {},
        baseInstallPrice,
        baseAnnualPrice,
      }),
    ).toEqual({
      currencyCode: 'AFN',
      baseInstallMicros: 15_000_000_000,
      baseAnnualMicros: 7_000_000_000,
    });
  });

  it('should price in the requested currency from the price book', () => {
    expect(
      resolveLineFixedAmounts({
        priceBook: {
          AFN: { install: 15000 },
          USD: { install: 200, annual: 100 },
        },
        overrides: { currencyCode: 'USD' },
        baseInstallPrice,
        baseAnnualPrice,
      }),
    ).toEqual({
      currencyCode: 'USD',
      baseInstallMicros: 200_000_000,
      baseAnnualMicros: 100_000_000,
    });
  });

  it('should not carry the primary currency amounts into another currency', () => {
    expect(
      resolveLineFixedAmounts({
        priceBook: {},
        overrides: { currencyCode: 'USD' },
        baseInstallPrice,
        baseAnnualPrice,
      }),
    ).toEqual({
      currencyCode: 'USD',
      baseInstallMicros: 0,
      baseAnnualMicros: 0,
    });
  });

  it('should let an explicit line override beat both the price book and the base price', () => {
    expect(
      resolveLineFixedAmounts({
        priceBook: { USD: { install: 200, annual: 100 } },
        overrides: { currencyCode: 'USD', fixedInstall: 175, fixedAnnual: 0 },
        baseInstallPrice,
        baseAnnualPrice,
      }),
    ).toEqual({
      currencyCode: 'USD',
      baseInstallMicros: 175_000_000,
      baseAnnualMicros: 0,
    });
  });

  it('should fall back to the given currency when the product has no price at all', () => {
    expect(
      resolveLineFixedAmounts({
        priceBook: {},
        overrides: {},
        baseInstallPrice: null,
        baseAnnualPrice: null,
        fallbackCurrencyCode: 'USD',
      }),
    ).toEqual({
      currencyCode: 'USD',
      baseInstallMicros: 0,
      baseAnnualMicros: 0,
    });
  });
});

describe('applyFactorRateOverridesToProductFactors', () => {
  const factors = [
    { name: 'Doctors', unitPrice: 10, billingFrequency: 'MONTHLY' as const },
    { name: 'Employees', unitPrice: 70, billingFrequency: 'ANNUAL' as const },
  ];

  it('should return the catalog rates untouched when nothing is overridden', () => {
    expect(
      applyFactorRateOverridesToProductFactors(factors, undefined),
    ).toEqual(factors);
  });

  it('should replace the unit price of an overridden metric and keep its cadence', () => {
    expect(
      applyFactorRateOverridesToProductFactors(factors, { Doctors: 12.5 }),
    ).toEqual([
      { name: 'Doctors', unitPrice: 12.5, billingFrequency: 'MONTHLY' },
      { name: 'Employees', unitPrice: 70, billingFrequency: 'ANNUAL' },
    ]);
  });

  it('should add a metric the seller priced that the catalog does not carry', () => {
    expect(
      applyFactorRateOverridesToProductFactors(factors, { Beds: 4 }),
    ).toEqual([
      ...factors,
      { name: 'Beds', unitPrice: 4, billingFrequency: 'MONTHLY' },
    ]);
  });
});

describe('applyFactorRateOverridesToTierSchedule', () => {
  const schedule: FactorTierSchedule[] = [
    {
      factor: 'Doctors',
      billingFrequency: 'ANNUAL',
      bands: [
        { minQty: 1, maxQty: 10, mode: 'PER_UNIT', amount: 100 },
        { minQty: 11, maxQty: null, mode: 'PER_UNIT', amount: 80 },
      ],
    },
  ];

  it('should leave the package tiers alone when nothing is overridden', () => {
    expect(applyFactorRateOverridesToTierSchedule(schedule, {})).toEqual(
      schedule,
    );
  });

  it('should let a negotiated rate beat the package volume tiers', () => {
    expect(
      applyFactorRateOverridesToTierSchedule(schedule, { Doctors: 75 }),
    ).toEqual([
      {
        factor: 'Doctors',
        billingFrequency: 'ANNUAL',
        bands: [{ minQty: 1, maxQty: null, mode: 'PER_UNIT', amount: 75 }],
      },
    ]);
  });

  it('should append a metric the schedule does not price', () => {
    expect(
      applyFactorRateOverridesToTierSchedule(schedule, { Beds: 4 }),
    ).toEqual([
      ...schedule,
      {
        factor: 'Beds',
        billingFrequency: 'MONTHLY',
        bands: [{ minQty: 1, maxQty: null, mode: 'PER_UNIT', amount: 4 }],
      },
    ]);
  });
});

describe('impliedDiscountPercent', () => {
  it('should report how far below the catalog price the line was overridden', () => {
    expect(impliedDiscountPercent(100_000_000, 80_000_000)).toBe(20);
  });

  it('should report no discount when the line is priced at or above catalog', () => {
    expect(impliedDiscountPercent(100_000_000, 100_000_000)).toBe(0);
    expect(impliedDiscountPercent(100_000_000, 120_000_000)).toBe(0);
  });

  it('should report no discount when there is no catalog price to compare against', () => {
    expect(impliedDiscountPercent(0, 50_000_000)).toBe(0);
  });

  it('should round to two decimals so a floating-point tail cannot trip the ceiling', () => {
    expect(impliedDiscountPercent(3_000_000, 2_000_000)).toBe(33.33);
  });
});
