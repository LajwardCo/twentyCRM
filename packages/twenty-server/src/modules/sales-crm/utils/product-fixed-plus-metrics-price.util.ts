import {
  computePriceFromTierSchedule,
  type FactorTierSchedule,
  productFactorToTierSchedule,
  type ProductPricingFactor,
} from 'src/modules/sales-crm/utils/pricing-tier-schedule.util';

export { type ProductPricingFactor };

export type FixedPlusMetricsPrice = {
  installMicros: number;
  annualMicros: number;
};

const MICROS_PER_UNIT = 1_000_000;

// A PER_FACTOR product may carry fixed amounts alongside its metrics -- a
// one-time install fee (baseInstallPrice) and/or a fixed annual fee
// (baseAnnualPrice) that apply on top of the per-metric rates. Both are
// optional: all-zero fixed amounts reproduce the pure-metrics behaviour, and
// an empty metric table reproduces flat pricing.
//
// Sub-annual metric cadences (monthly + hourly) accumulate into installMicros
// because the deal line has no dedicated hourly/monthly field -- no cadence is
// converted into another, matching computePriceFromTierSchedule's buckets.
export const computeFixedPlusMetricsPrice = ({
  pricingFactors,
  factorQuantities,
  baseInstallMicros,
  baseAnnualMicros,
}: {
  pricingFactors: ProductPricingFactor[] | null | undefined;
  factorQuantities: Record<string, number> | null | undefined;
  baseInstallMicros: number;
  baseAnnualMicros: number;
}): FixedPlusMetricsPrice => {
  // Each metric is a degenerate single-band per-unit tier schedule, so
  // product-level metrics and volume-tiered Package pricing stay on one
  // engine -- and each metric's catalog discount comes along with it.
  const schedule: FactorTierSchedule[] = (pricingFactors ?? []).map(
    productFactorToTierSchedule,
  );

  const { totalMonthly, totalHourly, totalAnnual } =
    computePriceFromTierSchedule(schedule, factorQuantities ?? {});

  return {
    installMicros:
      baseInstallMicros +
      Math.round((totalMonthly + totalHourly) * MICROS_PER_UNIT),
    annualMicros: baseAnnualMicros + Math.round(totalAnnual * MICROS_PER_UNIT),
  };
};
