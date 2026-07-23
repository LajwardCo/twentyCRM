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
