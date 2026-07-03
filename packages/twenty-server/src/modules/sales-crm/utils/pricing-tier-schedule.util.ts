export type BillingFrequency = 'MONTHLY' | 'ANNUAL';
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

    if (factorSchedule.billingFrequency === 'MONTHLY') {
      totalMonthly += subtotal;
    } else {
      totalAnnual += subtotal;
    }
  }

  return { breakdown, totalMonthly, totalAnnual };
}
