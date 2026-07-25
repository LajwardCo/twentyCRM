export type BillingFrequency = 'MONTHLY' | 'HOURLY' | 'ANNUAL';
export type TierBandMode = 'FLAT' | 'PER_UNIT';

export type TierBand = {
  minQty: number;
  maxQty: number | null;
  mode: TierBandMode;
  amount: number;
};

export type FactorTierSchedule = {
  factor: string;
  billingFrequency: BillingFrequency;
  bands: TierBand[];
};

export type FactorBreakdownEntry = {
  factor: string;
  quantity: number;
  matchedBand: TierBand;
  subtotal: number;
  billingFrequency: BillingFrequency;
};

export type TierScheduleComputation = {
  breakdown: FactorBreakdownEntry[];
  totalMonthly: number;
  totalHourly: number;
  totalAnnual: number;
};

// A per-unit rate entered on the Product itself (Product.pricingFactors).
export type ProductPricingFactor = {
  name: string;
  unitPrice: number;
  billingFrequency?: BillingFrequency;
};

// Turns a flat per-unit product metric into a degenerate single-band schedule
// so both pricing sources run through one engine.
export function productFactorToTierSchedule(
  factor: ProductPricingFactor,
): FactorTierSchedule {
  return {
    factor: factor.name,
    billingFrequency: factor.billingFrequency ?? 'MONTHLY',
    bands: [
      { minQty: 1, maxQty: null, mode: 'PER_UNIT', amount: factor.unitPrice },
    ],
  };
}

// Metrics are independent price lines, and a Package only tiers the ones it
// names. So a Package that tiers "doctor" must NOT silently drop the
// product's "employee" rate -- every metric the package doesn't override is
// billed on top at its product-level unit price and its own cadence. Package
// bands win for the factors they define (that's the point of the package).
export function mergeProductFactorsIntoTierSchedule(
  tierSchedule: FactorTierSchedule[],
  productFactors: ProductPricingFactor[],
): FactorTierSchedule[] {
  const tieredFactorNames = new Set(tierSchedule.map((entry) => entry.factor));

  return [
    ...tierSchedule,
    ...productFactors
      .filter((factor) => !tieredFactorNames.has(factor.name))
      .map(productFactorToTierSchedule),
  ];
}

// Volume/threshold tiering: the matched band's rate applies to the ENTIRE
// quantity, not a graduated/marginal split across bands (see design spec
// "Tiering model" section for why).
export function matchTierBand(
  bands: TierBand[],
  quantity: number,
): TierBand | undefined {
  return bands.find(
    (band) =>
      quantity >= band.minQty &&
      (band.maxQty === null || quantity <= band.maxQty),
  );
}

export function computePriceFromTierSchedule(
  tierSchedule: FactorTierSchedule[],
  factorQuantities: Record<string, number>,
): TierScheduleComputation {
  const breakdown: FactorBreakdownEntry[] = [];
  let totalMonthly = 0;
  let totalHourly = 0;
  let totalAnnual = 0;

  for (const factorSchedule of tierSchedule) {
    const quantity = factorQuantities[factorSchedule.factor];

    if (typeof quantity !== 'number') {
      continue;
    }

    const matchedBand = matchTierBand(factorSchedule.bands, quantity);

    if (!matchedBand) {
      continue;
    }

    const subtotal =
      matchedBand.mode === 'FLAT'
        ? matchedBand.amount
        : matchedBand.amount * quantity;

    breakdown.push({
      factor: factorSchedule.factor,
      quantity,
      matchedBand,
      subtotal,
      billingFrequency: factorSchedule.billingFrequency,
    });

    // Each cadence accumulates into its own bucket -- no cross-conversion
    // between hours/months/years (that would hardcode a business assumption
    // like hours-per-month). Callers decide how to surface each bucket.
    if (factorSchedule.billingFrequency === 'HOURLY') {
      totalHourly += subtotal;
    } else if (factorSchedule.billingFrequency === 'ANNUAL') {
      totalAnnual += subtotal;
    } else {
      totalMonthly += subtotal;
    }
  }

  return { breakdown, totalMonthly, totalHourly, totalAnnual };
}
