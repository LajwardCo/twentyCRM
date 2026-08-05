import { coreQuery } from './client';
import { type Referrer } from './records';

// Additional referrers credited on a lead. `opportunity.referrer` stays the
// PRIMARY referrer -- the CRM's own table views and the existing reports read
// it, and removing it would break both silently -- so these join rows are
// additive credit on top of it. See
// docs/superpowers/specs/2026-08-05-sales-pricing-subscriptions-referrals-design.md.
//
// commissionPercent lives on the join row rather than on the partner: the
// partner's own percent is their default rate, and what they are owed on a
// particular deal is negotiated per deal.
//
// Depends on the leadReferrer object, which only exists once
// provision-subscriptions-referrals-offers.mjs has run; until then every call
// resolves to "unsupported" and the UI hides the section.

export type ReferrerRole = 'FINDER' | 'INTRODUCER' | 'CLOSER' | 'OTHER';

export type LeadReferrer = {
  id: string;
  commissionPercent: number | null;
  referrerRole: ReferrerRole | null;
  note: string | null;
  partner: Referrer | null;
};

export type ReferrerSupport<TValue> =
  | { supported: true; value: TValue }
  | { supported: false };

const UNSUPPORTED = { supported: false } as const;

const isUnsupported = (error: unknown): boolean =>
  error instanceof Error &&
  /(Cannot query field|is not defined by type|Unknown type).*"?(leadReferrer|leadReferrers|LeadReferrer)/i.test(
    error.message,
  );

export const fetchLeadReferrers = async (
  opportunityId: string,
): Promise<ReferrerSupport<LeadReferrer[]>> => {
  try {
    const data = await coreQuery<{
      leadReferrers: { edges: { node: LeadReferrer }[] };
    }>(
      `query LeadReferrers($id: UUID!) {
        leadReferrers(
          filter: { opportunityId: { eq: $id } }
          orderBy: [{ createdAt: AscNullsLast }]
          first: 50
        ) {
          edges {
            node {
              id
              commissionPercent
              referrerRole
              note
              partner { id name partnerType commissionPercent }
            }
          }
        }
      }`,
      { id: opportunityId },
    );

    return {
      supported: true,
      value: data.leadReferrers.edges.map((edge) => edge.node),
    };
  } catch (error) {
    if (isUnsupported(error)) return UNSUPPORTED;
    throw error;
  }
};

export const addLeadReferrer = async ({
  opportunityId,
  partnerId,
  commissionPercent,
  referrerRole,
  note,
}: {
  opportunityId: string;
  partnerId: string;
  commissionPercent: number | null;
  referrerRole: ReferrerRole;
  note: string | null;
}): Promise<ReferrerSupport<string>> => {
  try {
    const data = await coreQuery<{ createLeadReferrer: { id: string } }>(
      `mutation CreateLeadReferrer($data: LeadReferrerCreateInput!) {
        createLeadReferrer(data: $data) { id }
      }`,
      {
        data: {
          opportunityId,
          partnerId,
          commissionPercent,
          referrerRole,
          note,
        },
      },
    );

    return { supported: true, value: data.createLeadReferrer.id };
  } catch (error) {
    if (isUnsupported(error)) return UNSUPPORTED;
    throw error;
  }
};

export const removeLeadReferrer = async (id: string): Promise<void> => {
  await coreQuery(
    `mutation DeleteLeadReferrer($id: UUID!) {
      deleteLeadReferrer(id: $id) { id }
    }`,
    { id },
  );
};

// The commission the business has committed on one deal: the primary
// referrer's own rate plus every additional referrer's negotiated share.
// Returned as a percentage, and deliberately NOT capped at 100 -- a total past
// 100% is a real data-entry problem the UI should show rather than hide.
export const totalCommissionPercent = (
  primary: Referrer | null | undefined,
  additional: LeadReferrer[],
): number =>
  (primary?.commissionPercent ?? 0) +
  additional.reduce(
    (sum, entry) => sum + (entry.commissionPercent ?? 0),
    0,
  );
