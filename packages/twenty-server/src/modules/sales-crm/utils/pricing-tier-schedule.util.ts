export type BillingFrequency = 'MONTHLY' | 'HOURLY' | 'ANNUAL';
export type TierBandMode = 'FLAT' | 'PER_UNIT';

export type TierBand = {
  minQty: number;
  maxQty: number | null;
  mode: TierBandMode;
  amount: number;
};

export type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT';

// A standing discount the catalog grants on one metric, applied to that
// metric's subtotal for its own billing period: PERCENTAGE takes `value` per
// cent off, FIXED_AMOUNT takes `value` (major units) off. It is a catalog-level
// concession -- "we always give 10% off the doctor rate" -- as opposed to the
// per-line rate a seller restates during negotiation.
export type FactorDiscount = {
  type: DiscountType;
  value: number;
};

export type FactorTierSchedule = {
  factor: string;
  billingFrequency: BillingFrequency;
  bands: TierBand[];
  discount?: FactorDiscount;
};

export type FactorBreakdownEntry = {
  factor: string;
  quantity: number;
  matchedBand: TierBand;
  // What the band alone came to, before the metric's discount.
  grossSubtotal: number;
  discountAmount: number;
  // What the line is actually charged: grossSubtotal - discountAmount.
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
  discountType?: DiscountType;
  discountValue?: number;
};

// The metric's discount, or nothing when it carries none. Rows saved before
// discounts existed have neither key, and a zero/negative value is not a
// discount -- both mean "charge the rate as entered".
export const productFactorDiscount = (
  factor: ProductPricingFactor,
): FactorDiscount | undefined =>
  (factor.discountType === 'PERCENTAGE' ||
    factor.discountType === 'FIXED_AMOUNT') &&
  typeof factor.discountValue === 'number' &&
  Number.isFinite(factor.discountValue) &&
  factor.discountValue > 0
    ? { type: factor.discountType, value: factor.discountValue }
    : undefined;

// Turns a flat per-unit product metric into a degenerate single-band schedule
// so both pricing sources run through one engine.
export function productFactorToTierSchedule(
  factor: ProductPricingFactor,
): FactorTierSchedule {
  const discount = productFactorDiscount(factor);

  return {
    factor: factor.name,
    billingFrequency: factor.billingFrequency ?? 'MONTHLY',
    bands: [
      { minQty: 1, maxQty: null, mode: 'PER_UNIT', amount: factor.unitPrice },
    ],
    ...(discount !== undefined ? { discount } : {}),
  };
}

// A discount never turns a charge into a credit, and a percentage past 100 is
// a data-entry slip rather than an instruction to pay the customer.
export const applyFactorDiscount = (
  subtotal: number,
  discount: FactorDiscount | undefined,
): number => {
  if (discount === undefined || subtotal <= 0) {
    return 0;
  }

  const raw =
    discount.type === 'PERCENTAGE'
      ? (subtotal * discount.value) / 100
      : discount.value;

  return Math.min(Math.max(raw, 0), subtotal);
};

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

    const grossSubtotal =
      matchedBand.mode === 'FLAT'
        ? matchedBand.amount
        : matchedBand.amount * quantity;

    // The metric's own discount comes off its band subtotal, before the
    // cadence buckets -- so a discounted annual metric discounts the annual
    // total and nothing else.
    const discountAmount = applyFactorDiscount(
      grossSubtotal,
      factorSchedule.discount,
    );
    const subtotal = grossSubtotal - discountAmount;

    breakdown.push({
      factor: factorSchedule.factor,
      quantity,
      matchedBand,
      grossSubtotal,
      discountAmount,
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
