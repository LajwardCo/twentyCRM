import { coreQuery } from './client';
import {
  type Connection,
  fetchAllPages,
  PAGE_SIZE,
  type Referrer,
} from './records';

// Managing the people who bring business in: marketers, referrers and
// partners. All three are the same `partner` record distinguished by
// partnerType, which is why one screen manages the lot.
//
// Until this existed the only way to create one was a provisioning script, so
// the marketer picker on a lead and the referrer picker on a deal could only
// ever offer the names some script had already seeded -- which is exactly the
// "can't add a marketer" and "can't define a referral" the sellers hit.
//
// The `partner` object comes from provision-external-partners.mjs; on an
// instance that never ran it every call here reports "unsupported" and the
// screens say so rather than failing.

export type PartnerType = 'MARKETER' | 'SELLER' | 'PARTNER';

export const PARTNER_TYPES: PartnerType[] = ['MARKETER', 'SELLER', 'PARTNER'];

export type Partner = Referrer & {
  createdAt: string;
  // How many leads this partner is credited on, as marketer or as referrer.
  // Read separately because the counts come from opportunity, not partner.
  leadCount?: number;
};

export type PartnerSupport<TValue> =
  | { supported: true; value: TValue }
  | { supported: false };

const UNSUPPORTED = { supported: false } as const;

// The object or one of its fields is missing on this instance. Matched on the
// shape of a GraphQL schema error rather than on a message, so a genuine
// server failure still surfaces as an error instead of being read as "the
// feature isn't installed here".
const isUnsupported = (error: unknown): boolean =>
  error instanceof Error &&
  /(Cannot query field|is not defined by type|Unknown type|Unknown argument).*"?(partner|partners|Partner)/i.test(
    error.message,
  );

const PARTNER_FIELDS = 'id name partnerType commissionPercent createdAt';

export const fetchPartners = async (): Promise<PartnerSupport<Partner[]>> => {
  try {
    const data = await coreQuery<{ partners: { edges: { node: Partner }[] } }>(
      `query Partners {
        partners(first: 200, orderBy: [{ name: AscNullsLast }]) {
          edges { node { ${PARTNER_FIELDS} } }
        }
      }`,
    );
    return { supported: true, value: data.partners.edges.map((e) => e.node) };
  } catch (error) {
    if (isUnsupported(error)) return UNSUPPORTED;
    throw error;
  }
};

export type PartnerInput = {
  name: string;
  partnerType: PartnerType;
  commissionPercent: number | null;
};

export const createPartner = async (
  input: PartnerInput,
): Promise<PartnerSupport<Partner>> => {
  try {
    const data = await coreQuery<{ createPartner: Partner }>(
      `mutation CreatePartner($data: PartnerCreateInput!) {
        createPartner(data: $data) { ${PARTNER_FIELDS} }
      }`,
      {
        data: {
          name: input.name.trim(),
          partnerType: input.partnerType,
          commissionPercent: input.commissionPercent,
        },
      },
    );
    return { supported: true, value: data.createPartner };
  } catch (error) {
    if (isUnsupported(error)) return UNSUPPORTED;
    throw error;
  }
};

export const updatePartner = async (
  id: string,
  input: PartnerInput,
): Promise<Partner> => {
  const data = await coreQuery<{ updatePartner: Partner }>(
    `mutation UpdatePartner($id: UUID!, $data: PartnerUpdateInput!) {
      updatePartner(id: $id, data: $data) { ${PARTNER_FIELDS} }
    }`,
    {
      id,
      data: {
        name: input.name.trim(),
        partnerType: input.partnerType,
        commissionPercent: input.commissionPercent,
      },
    },
  );
  return data.updatePartner;
};

// Soft delete, like every other removal in this app: the leads this partner is
// credited on keep their relation, and the record can be restored from the
// main CRM if someone deletes the wrong one.
export const deletePartner = async (id: string): Promise<void> => {
  await coreQuery(
    `mutation DeletePartner($id: UUID!) {
      deletePartner(id: $id) { id }
    }`,
    { id },
  );
};

// How many leads each partner is credited on -- as the marketer who brought it
// or the referrer who introduced it. Counted from opportunity so that a partner
// with live credit can be flagged before someone deletes them.
export const fetchPartnerLeadCounts = async (): Promise<
  Record<string, number>
> => {
  const counts: Record<string, number> = {};

  const bump = (id: string | null | undefined) => {
    if (typeof id !== 'string' || id === '') return;
    counts[id] = (counts[id] ?? 0) + 1;
  };

  type CreditedLead = {
    marketerPartner: { id: string } | null;
    referrer: { id: string } | null;
  };

  try {
    // Followed across pages rather than asked for in one oversized page:
    // `first` above the server's cap silently truncates, which would quietly
    // under-count exactly the partners who bring the most leads.
    const { items } = await fetchAllPages<CreditedLead>(async (after) => {
      const data = await coreQuery<{ opportunities: Connection<CreditedLead> }>(
        `query PartnerLeadCounts($limit: Int!, $after: String) {
          opportunities(first: $limit, after: $after) {
            edges { node { marketerPartner { id } referrer { id } } }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { limit: PAGE_SIZE, after },
      );
      return data.opportunities;
    });

    for (const lead of items) {
      bump(lead.marketerPartner?.id);
      bump(lead.referrer?.id);
    }
  } catch {
    // marketerPartner is absent on instances that predate
    // provision-external-partners; the screen simply shows no counts.
    return {};
  }

  return counts;
};
