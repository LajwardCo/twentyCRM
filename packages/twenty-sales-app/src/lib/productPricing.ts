import { type PricingFactor } from '../api/catalog';

// Client-side mirror of the server's pricing rule
// (product-fixed-plus-metrics-price.util.ts) so the seller sees the same
// number before saving the deal line as the server computes afterwards. A
// PER_FACTOR product may carry fixed amounts on top of its metrics: a
// one-time install fee and/or a fixed annual fee, either of which may be
// blank. Amounts here are in major units (؋/$), not micros.
export type ProductPriceEstimate = {
  fixedInstall: number;
  fixedAnnual: number;
  monthly: number;
  hourly: number;
  annualMetrics: number;
  installTotal: number;
  annualTotal: number;
};

// Sub-annual cadences (monthly + hourly) land in installTotal because the
// deal line has no dedicated field for them -- same bucketing as the server,
// with no conversion between cadences.
// Mirrors the server's applyFactorDiscount: a discount never turns a charge
// into a credit, and a percentage past 100 is a data-entry slip rather than an
// instruction to pay the customer.
export const metricDiscountAmount = (
  subtotal: number,
  factor: PricingFactor,
): number => {
  const { discountType, discountValue } = factor;

  if (
    (discountType !== 'PERCENTAGE' && discountType !== 'FIXED_AMOUNT') ||
    typeof discountValue !== 'number' ||
    !Number.isFinite(discountValue) ||
    discountValue <= 0 ||
    subtotal <= 0
  ) {
    return 0;
  }

  const raw =
    discountType === 'PERCENTAGE' ? (subtotal * discountValue) / 100 : discountValue;

  return Math.min(Math.max(raw, 0), subtotal);
};

export const estimateProductPrice = ({
  pricingFactors,
  factorQuantities,
  fixedInstall,
  fixedAnnual,
}: {
  pricingFactors: PricingFactor[] | null | undefined;
  factorQuantities: Record<string, number> | null | undefined;
  fixedInstall: number;
  fixedAnnual: number;
}): ProductPriceEstimate => {
  let monthly = 0;
  let hourly = 0;
  let annualMetrics = 0;

  for (const factor of pricingFactors ?? []) {
    const quantity = factorQuantities?.[factor.name];

    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 1) {
      continue;
    }

    const grossSubtotal = factor.unitPrice * quantity;
    // The metric's own discount comes off before the cadence buckets, so a
    // discounted annual metric discounts the annual total and nothing else.
    const subtotal = grossSubtotal - metricDiscountAmount(grossSubtotal, factor);

    if (factor.billingFrequency === 'HOURLY') {
      hourly += subtotal;
    } else if (factor.billingFrequency === 'ANNUAL') {
      annualMetrics += subtotal;
    } else {
      monthly += subtotal;
    }
  }

  return {
    fixedInstall,
    fixedAnnual,
    monthly,
    hourly,
    annualMetrics,
    installTotal: fixedInstall + monthly + hourly,
    annualTotal: fixedAnnual + annualMetrics,
  };
};

export const hasPriceEstimate = (estimate: ProductPriceEstimate): boolean =>
  estimate.installTotal > 0 || estimate.annualTotal > 0;
