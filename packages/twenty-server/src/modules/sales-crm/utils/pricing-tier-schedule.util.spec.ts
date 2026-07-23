import {
  computePriceFromTierSchedule,
  matchTierBand,
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
      bands: [{ minQty: 1, maxQty: null, mode: 'PER_UNIT' as const, amount: 5 }],
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
