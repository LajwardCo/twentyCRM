import {
  applyFactorDiscount,
  computePriceFromTierSchedule,
  matchTierBand,
  mergeProductFactorsIntoTierSchedule,
  productFactorDiscount,
} from 'src/modules/sales-crm/utils/pricing-tier-schedule.util';

const OPD_DOCTOR_SCHEDULE = {
  factor: 'doctor',
  billingFrequency: 'MONTHLY' as const,
  bands: [
    { minQty: 1, maxQty: 4, mode: 'FLAT' as const, amount: 2000 },
    { minQty: 5, maxQty: 9, mode: 'PER_UNIT' as const, amount: 400 },
    { minQty: 10, maxQty: 20, mode: 'PER_UNIT' as const, amount: 300 },
    { minQty: 21, maxQty: null, mode: 'PER_UNIT' as const, amount: 250 },
  ],
};

const PHARMACY_EMPLOYEE_SCHEDULE = {
  factor: 'employee',
  billingFrequency: 'ANNUAL' as const,
  bands: [
    { minQty: 1, maxQty: 99, mode: 'PER_UNIT' as const, amount: 0.9 },
    { minQty: 100, maxQty: 199, mode: 'PER_UNIT' as const, amount: 0.7 },
    { minQty: 200, maxQty: 299, mode: 'PER_UNIT' as const, amount: 0.6 },
    { minQty: 300, maxQty: null, mode: 'PER_UNIT' as const, amount: 0.5 },
  ],
};

describe('matchTierBand', () => {
  it('matches a FLAT band and stays flat across the whole band', () => {
    expect(matchTierBand(OPD_DOCTOR_SCHEDULE.bands, 1)).toEqual(
      OPD_DOCTOR_SCHEDULE.bands[0],
    );
    expect(matchTierBand(OPD_DOCTOR_SCHEDULE.bands, 4)).toEqual(
      OPD_DOCTOR_SCHEDULE.bands[0],
    );
  });

  it('matches band boundaries exactly, including the transition point', () => {
    expect(matchTierBand(OPD_DOCTOR_SCHEDULE.bands, 5)).toEqual(
      OPD_DOCTOR_SCHEDULE.bands[1],
    );
    expect(matchTierBand(OPD_DOCTOR_SCHEDULE.bands, 9)).toEqual(
      OPD_DOCTOR_SCHEDULE.bands[1],
    );
    expect(matchTierBand(OPD_DOCTOR_SCHEDULE.bands, 10)).toEqual(
      OPD_DOCTOR_SCHEDULE.bands[2],
    );
  });

  it('matches an unbounded top band (maxQty null) for any quantity at or above minQty', () => {
    expect(matchTierBand(OPD_DOCTOR_SCHEDULE.bands, 21)).toEqual(
      OPD_DOCTOR_SCHEDULE.bands[3],
    );
    expect(matchTierBand(OPD_DOCTOR_SCHEDULE.bands, 1000)).toEqual(
      OPD_DOCTOR_SCHEDULE.bands[3],
    );
  });

  it('returns undefined when quantity is below every band', () => {
    expect(matchTierBand(OPD_DOCTOR_SCHEDULE.bands, 0)).toBeUndefined();
  });
});

describe('computePriceFromTierSchedule', () => {
  it('computes a FLAT band subtotal regardless of quantity within the band', () => {
    const result = computePriceFromTierSchedule([OPD_DOCTOR_SCHEDULE], {
      doctor: 3,
    });

    expect(result.breakdown).toEqual([
      {
        factor: 'doctor',
        quantity: 3,
        matchedBand: OPD_DOCTOR_SCHEDULE.bands[0],
        grossSubtotal: 2000,
        discountAmount: 0,
        subtotal: 2000,
        billingFrequency: 'MONTHLY',
      },
    ]);
    expect(result.totalMonthly).toBe(2000);
    expect(result.totalAnnual).toBe(0);
  });

  it('computes a PER_UNIT band subtotal as amount times quantity', () => {
    const result = computePriceFromTierSchedule([OPD_DOCTOR_SCHEDULE], {
      doctor: 9,
    });

    expect(result.breakdown[0].subtotal).toBe(3600);
    expect(result.totalMonthly).toBe(3600);
  });

  it('aggregates multiple factors into separate monthly/annual totals', () => {
    const result = computePriceFromTierSchedule(
      [OPD_DOCTOR_SCHEDULE, PHARMACY_EMPLOYEE_SCHEDULE],
      { doctor: 5, employee: 150 },
    );

    expect(result.totalMonthly).toBe(2000);
    expect(result.totalAnnual).toBe(105);
    expect(result.breakdown).toHaveLength(2);
  });

  it('routes an HOURLY factor to its own bucket, separate from monthly/annual', () => {
    const inventoryHourly = {
      factor: 'inventory',
      billingFrequency: 'HOURLY' as const,
      bands: [
        { minQty: 1, maxQty: null, mode: 'PER_UNIT' as const, amount: 5 },
      ],
    };

    const result = computePriceFromTierSchedule(
      [OPD_DOCTOR_SCHEDULE, inventoryHourly, PHARMACY_EMPLOYEE_SCHEDULE],
      { doctor: 3, inventory: 10, employee: 150 },
    );

    expect(result.totalMonthly).toBe(2000);
    expect(result.totalHourly).toBe(50);
    expect(result.totalAnnual).toBe(105);
    expect(result.breakdown).toHaveLength(3);
  });

  it('skips a factor with no matching quantity entry, without throwing', () => {
    const result = computePriceFromTierSchedule(
      [OPD_DOCTOR_SCHEDULE, PHARMACY_EMPLOYEE_SCHEDULE],
      { doctor: 5 },
    );

    expect(result.breakdown).toHaveLength(1);
    expect(result.totalAnnual).toBe(0);
  });

  it('skips a factor whose quantity matches no band, without throwing', () => {
    const result = computePriceFromTierSchedule([OPD_DOCTOR_SCHEDULE], {
      doctor: 0,
    });

    expect(result.breakdown).toHaveLength(0);
    expect(result.totalMonthly).toBe(0);
  });
});

describe('mergeProductFactorsIntoTierSchedule', () => {
  // The real MedUniversal OPD catalog: the product prices doctor 500/month and
  // employee 70/year; the package only tiers doctors, so employees must still
  // be billed on top at the product rate.
  const OPD_PRODUCT_FACTORS = [
    { name: 'doctor', unitPrice: 500, billingFrequency: 'MONTHLY' as const },
    { name: 'employee', unitPrice: 70, billingFrequency: 'ANNUAL' as const },
  ];

  it('adds product metrics the package does not tier', () => {
    const merged = mergeProductFactorsIntoTierSchedule(
      [OPD_DOCTOR_SCHEDULE],
      OPD_PRODUCT_FACTORS,
    );

    expect(merged.map((entry) => entry.factor)).toEqual(['doctor', 'employee']);
    expect(merged[1].billingFrequency).toBe('ANNUAL');
    expect(merged[1].bands).toEqual([
      { minQty: 1, maxQty: null, mode: 'PER_UNIT', amount: 70 },
    ]);
  });

  it('lets the package bands win over the product rate for the same metric', () => {
    const merged = mergeProductFactorsIntoTierSchedule(
      [OPD_DOCTOR_SCHEDULE],
      OPD_PRODUCT_FACTORS,
    );

    expect(merged[0]).toBe(OPD_DOCTOR_SCHEDULE);
    expect(merged.filter((entry) => entry.factor === 'doctor')).toHaveLength(1);
  });

  it('prices a tiered package plus an untiered metric in one pass', () => {
    const merged = mergeProductFactorsIntoTierSchedule(
      [OPD_DOCTOR_SCHEDULE],
      OPD_PRODUCT_FACTORS,
    );

    const result = computePriceFromTierSchedule(merged, {
      doctor: 12,
      employee: 40,
    });

    // 12 doctors falls in the 10-20 band: 12 * 300 monthly.
    expect(result.totalMonthly).toBe(3600);
    // 40 employees at the product's own annual rate, untouched by the package.
    expect(result.totalAnnual).toBe(2800);
  });

  it('treats a product metric with no billingFrequency as monthly', () => {
    const merged = mergeProductFactorsIntoTierSchedule(
      [],
      [{ name: 'employee', unitPrice: 70 }],
    );

    expect(merged[0].billingFrequency).toBe('MONTHLY');
  });
});

describe('productFactorDiscount', () => {
  it('reads a percentage discount off a product metric', () => {
    expect(
      productFactorDiscount({
        name: 'doctor',
        unitPrice: 400,
        discountType: 'PERCENTAGE',
        discountValue: 10,
      }),
    ).toEqual({ type: 'PERCENTAGE', value: 10 });
  });

  it('returns nothing for a legacy row that predates discounts', () => {
    expect(
      productFactorDiscount({ name: 'doctor', unitPrice: 400 }),
    ).toBeUndefined();
  });

  it('treats a zero or negative value as no discount', () => {
    expect(
      productFactorDiscount({
        name: 'doctor',
        unitPrice: 400,
        discountType: 'FIXED_AMOUNT',
        discountValue: 0,
      }),
    ).toBeUndefined();
    expect(
      productFactorDiscount({
        name: 'doctor',
        unitPrice: 400,
        discountType: 'PERCENTAGE',
        discountValue: -5,
      }),
    ).toBeUndefined();
  });

  it('ignores a value with no type and a type with no value', () => {
    expect(
      productFactorDiscount({
        name: 'doctor',
        unitPrice: 400,
        discountValue: 10,
      }),
    ).toBeUndefined();
    expect(
      productFactorDiscount({
        name: 'doctor',
        unitPrice: 400,
        discountType: 'PERCENTAGE',
      }),
    ).toBeUndefined();
  });
});

describe('applyFactorDiscount', () => {
  it('takes a percentage off the subtotal', () => {
    expect(applyFactorDiscount(2000, { type: 'PERCENTAGE', value: 10 })).toBe(
      200,
    );
  });

  it('takes a fixed amount off the subtotal', () => {
    expect(
      applyFactorDiscount(2000, { type: 'FIXED_AMOUNT', value: 150 }),
    ).toBe(150);
  });

  it('never discounts more than the subtotal, so a charge cannot become a credit', () => {
    expect(applyFactorDiscount(100, { type: 'FIXED_AMOUNT', value: 500 })).toBe(
      100,
    );
    expect(applyFactorDiscount(100, { type: 'PERCENTAGE', value: 250 })).toBe(
      100,
    );
  });

  it('discounts nothing when there is no discount or nothing to charge', () => {
    expect(applyFactorDiscount(2000, undefined)).toBe(0);
    expect(applyFactorDiscount(0, { type: 'PERCENTAGE', value: 10 })).toBe(0);
  });
});

describe('computePriceFromTierSchedule with per-metric discounts', () => {
  it('reports gross, discount and net subtotals for a discounted metric', () => {
    const result = computePriceFromTierSchedule(
      [
        {
          ...OPD_DOCTOR_SCHEDULE,
          discount: { type: 'PERCENTAGE' as const, value: 10 },
        },
      ],
      { doctor: 9 },
    );

    // 9 doctors in the 5-9 band: 9 * 400 = 3600 gross, less 10%.
    expect(result.breakdown[0].grossSubtotal).toBe(3600);
    expect(result.breakdown[0].discountAmount).toBe(360);
    expect(result.breakdown[0].subtotal).toBe(3240);
    expect(result.totalMonthly).toBe(3240);
  });

  it('discounts each metric in its own cadence bucket only', () => {
    const result = computePriceFromTierSchedule(
      [
        OPD_DOCTOR_SCHEDULE,
        {
          ...PHARMACY_EMPLOYEE_SCHEDULE,
          discount: { type: 'FIXED_AMOUNT' as const, value: 20 },
        },
      ],
      { doctor: 9, employee: 150 },
    );

    // The undiscounted monthly metric is untouched by the annual discount.
    expect(result.totalMonthly).toBe(3600);
    // 150 employees at 0.7 = 105 annual, less the fixed 20.
    expect(result.totalAnnual).toBe(85);
  });

  it('leaves an undiscounted metric reporting a zero discount', () => {
    const result = computePriceFromTierSchedule([OPD_DOCTOR_SCHEDULE], {
      doctor: 9,
    });

    expect(result.breakdown[0].discountAmount).toBe(0);
    expect(result.breakdown[0].grossSubtotal).toBe(
      result.breakdown[0].subtotal,
    );
  });

  it('carries a product metric discount through the merge into pricing', () => {
    const merged = mergeProductFactorsIntoTierSchedule(
      [],
      [
        {
          name: 'employee',
          unitPrice: 100,
          billingFrequency: 'MONTHLY',
          discountType: 'PERCENTAGE',
          discountValue: 25,
        },
      ],
    );

    const result = computePriceFromTierSchedule(merged, { employee: 4 });

    expect(result.totalMonthly).toBe(300);
  });
});
