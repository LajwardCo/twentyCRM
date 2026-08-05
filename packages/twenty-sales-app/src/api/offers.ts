import { coreQuery } from './client';

// Offer history on a lead. `opportunity.amount` is a single number that
// negotiation overwrites, so without these rows nobody can answer what was
// first quoted or how far the price moved -- see
// docs/superpowers/specs/2026-08-05-sales-pricing-subscriptions-referrals-design.md.
//
// The whole feature depends on the `leadOffer` object, which only exists once
// provision-subscriptions-referrals-offers.mjs has run. Until then every call
// here resolves to "unsupported" and the UI hides the section, rather than
// erroring the lead screen.

export type OfferStatus = 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED';

export type LeadOffer = {
  id: string;
  offeredAt: string | null;
  amount: { amountMicros: number | null; currencyCode: string | null } | null;
  offerStatus: OfferStatus | null;
  note: string | null;
  offeredBy: { id: string; name: { firstName: string; lastName: string } } | null;
  createdAt: string;
};

const OFFER_FIELDS = `
  id
  offeredAt
  offerStatus
  note
  createdAt
  amount { amountMicros currencyCode }
  offeredBy { id name { firstName lastName } }
`;

// Twenty rejects a whole document over one unknown field or object, so an
// instance without the leadOffer object fails every query here identically.
// Same detection as catalog.ts's optional product fields, widened to cover the
// object itself (`Cannot query field "leadOffers" on type "Query"`).
const isUnsupported = (error: unknown): boolean =>
  error instanceof Error &&
  /(Cannot query field|is not defined by type|Unknown type).*"?(leadOffer|leadOffers|LeadOffer)/i.test(
    error.message,
  );

export type OffersSupport<TValue> =
  | { supported: true; value: TValue }
  | { supported: false };

const UNSUPPORTED = { supported: false } as const;

export const fetchLeadOffers = async (
  opportunityId: string,
): Promise<OffersSupport<LeadOffer[]>> => {
  try {
    const data = await coreQuery<{
      leadOffers: { edges: { node: LeadOffer }[] };
    }>(
      `query LeadOffers($id: UUID!) {
        leadOffers(
          filter: { opportunityId: { eq: $id } }
          orderBy: [{ offeredAt: DescNullsLast }, { createdAt: DescNullsLast }]
          first: 100
        ) {
          edges { node { ${OFFER_FIELDS} } }
        }
      }`,
      { id: opportunityId },
    );

    return {
      supported: true,
      value: data.leadOffers.edges.map((edge) => edge.node),
    };
  } catch (error) {
    if (isUnsupported(error)) return UNSUPPORTED;
    throw error;
  }
};

export type NewOffer = {
  opportunityId: string;
  amountMicros: number;
  currencyCode: string;
  note: string | null;
  offeredById: string | null;
  // Defaults to now; explicit so a seller can log an offer they made yesterday.
  offeredAt?: string;
};

export const createLeadOffer = async (
  offer: NewOffer,
): Promise<OffersSupport<string>> => {
  try {
    const data = await coreQuery<{ createLeadOffer: { id: string } }>(
      `mutation CreateLeadOffer($data: LeadOfferCreateInput!) {
        createLeadOffer(data: $data) { id }
      }`,
      {
        data: {
          opportunityId: offer.opportunityId,
          offeredAt: offer.offeredAt ?? new Date().toISOString(),
          offerStatus: 'PROPOSED',
          note: offer.note,
          amount: {
            amountMicros: offer.amountMicros,
            currencyCode: offer.currencyCode,
          },
          ...(offer.offeredById !== null
            ? { offeredById: offer.offeredById }
            : {}),
        },
      },
    );

    return { supported: true, value: data.createLeadOffer.id };
  } catch (error) {
    if (isUnsupported(error)) return UNSUPPORTED;
    throw error;
  }
};

const updateOfferStatus = async (id: string, offerStatus: OfferStatus) => {
  await coreQuery(
    `mutation UpdateLeadOffer($id: UUID!, $data: LeadOfferUpdateInput!) {
      updateLeadOffer(id: $id, data: $data) { id }
    }`,
    { id, data: { offerStatus } },
  );
};

// Accepting an offer is three writes, not one: the offer becomes ACCEPTED,
// every other still-open offer on the lead becomes SUPERSEDED (they are no
// longer on the table), and the agreed price is copied onto the lead so
// reports never have to walk the relation to answer what was settled.
//
// The supersede writes run before the accept so a failure part-way leaves the
// lead with no accepted offer rather than two, which is the recoverable state.
export const acceptLeadOffer = async ({
  offer,
  opportunityId,
  otherOffers,
}: {
  offer: LeadOffer;
  opportunityId: string;
  otherOffers: LeadOffer[];
}): Promise<void> => {
  for (const other of otherOffers) {
    if (other.id !== offer.id && other.offerStatus === 'PROPOSED') {
      await updateOfferStatus(other.id, 'SUPERSEDED');
    }
  }

  await updateOfferStatus(offer.id, 'ACCEPTED');

  await coreQuery(
    `mutation SetAgreedPrice($id: UUID!, $data: OpportunityUpdateInput!) {
      updateOpportunity(id: $id, data: $data) { id }
    }`,
    {
      id: opportunityId,
      data: {
        agreedPrice: {
          amountMicros: offer.amount?.amountMicros ?? 0,
          currencyCode: offer.amount?.currencyCode ?? 'AFN',
        },
        agreedAt: new Date().toISOString(),
      },
    },
  );
};

export const rejectLeadOffer = (id: string): Promise<void> =>
  updateOfferStatus(id, 'REJECTED');
