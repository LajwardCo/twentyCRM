import { type DealProductLine } from '../api/records';

// Turning a won lead into subscriptions. The drafts are PROPOSED, not saved:
// the annual price on a deal line is not always the recurring price (it often
// includes first-year setup), so a seller reviews every draft before it is
// written. A wrong subscription is worse than a missing one -- it becomes a
// renewal reminder for money nobody agreed to.

export type BillingPeriod = 'MONTHLY' | 'ANNUAL';

export type SubscriptionDraft = {
  // Which line this came from, so the UI can key rows and the seller can tell
  // two drafts of the same product apart.
  dealLineId: string;
  productId: string | null;
  productName: string;
  recurringAmountMicros: number;
  currencyCode: string;
  billingPeriod: BillingPeriod;
  startDate: string;
  endDate: string;
};

const DAY_MS = 86_400_000;

// A term ends the day before the same date next period, which is what makes a
// renewal fall on the anniversary rather than a day after it.
export const termEndDate = (
  start: Date,
  billingPeriod: BillingPeriod,
): Date => {
  const end = new Date(start.getTime());

  if (billingPeriod === 'ANNUAL') {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }

  return new Date(end.getTime() - DAY_MS);
};

// Lines with no recurring amount are skipped rather than drafted at zero: a
// one-off install fee is not a subscription, and a zero-amount renewal
// reminder is noise.
export const buildSubscriptionDrafts = (
  lines: DealProductLine[],
  now = new Date(),
): SubscriptionDraft[] => {
  const start = new Date(now.getTime());
  const startDate = start.toISOString();

  return lines.flatMap((line) => {
    const amountMicros = line.annualPrice?.amountMicros ?? 0;

    if (amountMicros <= 0) return [];

    const billingPeriod: BillingPeriod = 'ANNUAL';

    return [
      {
        dealLineId: line.id,
        productId: line.product?.id ?? null,
        productName: line.product?.name ?? line.name,
        recurringAmountMicros: amountMicros,
        currencyCode: line.annualPrice?.currencyCode ?? 'AFN',
        billingPeriod,
        startDate,
        endDate: termEndDate(start, billingPeriod).toISOString(),
      },
    ];
  });
};
