import { type BillingPeriod, type SubscriptionDraft } from '../lib/subscriptionDrafts';
import { coreQuery } from './client';

// What a converted customer actually pays. The CRM stopped at the won deal, so
// nobody could see whose renewal was due or what recurring revenue existed. See
// docs/superpowers/specs/2026-08-05-sales-pricing-subscriptions-referrals-design.md.
//
// Depends on the subscription object, which only exists once
// provision-subscriptions-referrals-offers.mjs has run; until then every call
// resolves to "unsupported" and the UI hides the section.

export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

export type Subscription = {
  id: string;
  startDate: string | null;
  endDate: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  billingPeriod: BillingPeriod | null;
  recurringAmount: { amountMicros: number | null; currencyCode: string | null } | null;
  autoRenew: boolean | null;
  note: string | null;
  product: { id: string; name: string } | null;
  company: { id: string; name: string } | null;
};

export type SubscriptionSupport<TValue> =
  | { supported: true; value: TValue }
  | { supported: false };

const UNSUPPORTED = { supported: false } as const;

const isUnsupported = (error: unknown): boolean =>
  error instanceof Error &&
  /(Cannot query field|is not defined by type|Unknown type).*"?(subscription|subscriptions|Subscription)/i.test(
    error.message,
  );

const SUBSCRIPTION_FIELDS = `
  id
  startDate
  endDate
  subscriptionStatus
  billingPeriod
  autoRenew
  note
  recurringAmount { amountMicros currencyCode }
  product { id name }
  company { id name }
`;

export const fetchLeadSubscriptions = async (
  opportunityId: string,
): Promise<SubscriptionSupport<Subscription[]>> => {
  try {
    const data = await coreQuery<{
      subscriptions: { edges: { node: Subscription }[] };
    }>(
      `query LeadSubscriptions($id: UUID!) {
        subscriptions(
          filter: { opportunityId: { eq: $id } }
          orderBy: [{ startDate: DescNullsLast }]
          first: 100
        ) {
          edges { node { ${SUBSCRIPTION_FIELDS} } }
        }
      }`,
      { id: opportunityId },
    );

    return {
      supported: true,
      value: data.subscriptions.edges.map((edge) => edge.node),
    };
  } catch (error) {
    if (isUnsupported(error)) return UNSUPPORTED;
    throw error;
  }
};

// Conversion writes each reviewed draft as its own subscription row, linked to
// both the customer (who pays, and who survives the lead) and the lead (the
// audit trail of where it came from).
//
// Rows are created one at a time and the ids collected, so a failure part-way
// leaves the subscriptions that did land rather than rolling back work the
// seller would have to redo. The caller reloads from the server afterwards,
// which is what makes a partial result visible instead of silent.
export const createSubscriptionsFromDrafts = async ({
  drafts,
  opportunityId,
  companyId,
}: {
  drafts: SubscriptionDraft[];
  opportunityId: string;
  companyId: string | null;
}): Promise<SubscriptionSupport<string[]>> => {
  const created: string[] = [];

  try {
    for (const draft of drafts) {
      const data = await coreQuery<{ createSubscription: { id: string } }>(
        `mutation CreateSubscription($data: SubscriptionCreateInput!) {
          createSubscription(data: $data) { id }
        }`,
        {
          data: {
            opportunityId,
            ...(companyId !== null ? { companyId } : {}),
            ...(draft.productId !== null ? { productId: draft.productId } : {}),
            startDate: draft.startDate,
            endDate: draft.endDate,
            billingPeriod: draft.billingPeriod,
            // PENDING, not ACTIVE: conversion records the intent to bill, and
            // whether the customer has actually started is a separate fact
            // somebody confirms.
            subscriptionStatus: 'PENDING',
            autoRenew: true,
            recurringAmount: {
              amountMicros: draft.recurringAmountMicros,
              currencyCode: draft.currencyCode,
            },
          },
        },
      );

      created.push(data.createSubscription.id);
    }

    return { supported: true, value: created };
  } catch (error) {
    if (isUnsupported(error)) return UNSUPPORTED;
    throw error;
  }
};

export const updateSubscriptionStatus = async (
  id: string,
  subscriptionStatus: SubscriptionStatus,
): Promise<void> => {
  await coreQuery(
    `mutation UpdateSubscription($id: UUID!, $data: SubscriptionUpdateInput!) {
      updateSubscription(id: $id, data: $data) { id }
    }`,
    { id, data: { subscriptionStatus } },
  );
};
