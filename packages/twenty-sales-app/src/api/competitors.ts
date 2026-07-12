// Competitor Product / Update / Usage — the nested sections shown on
// CompetitorDetailView. Same coreQuery + create<Singular>/update<Singular>
// pattern as catalog.ts. See tools/sales-crm/provision-competitor-intel.mjs
// for the exact object/field/relation names this maps onto.
import { type Competitor } from './admin';
import { coreQuery } from './client';

const COMPETITOR_DETAIL_FIELDS = `
  id name description strengths weaknesses status threatLevel tier
  website { primaryLinkUrl }
  createdAt
`;

export const fetchCompetitorById = async (id: string): Promise<Competitor | undefined> => {
  const data = await coreQuery<{ competitors: { edges: { node: Competitor }[] } }>(
    `query CompetitorById($id: UUID!) {
      competitors(filter: { id: { eq: $id } }, first: 1) {
        edges { node { ${COMPETITOR_DETAIL_FIELDS} } }
      }
    }`,
    { id },
  );
  return data.competitors.edges[0]?.node;
};

const toAmount = (afn: number | null | undefined): { amountMicros: number; currencyCode: string } | null =>
  afn || afn === 0 ? { amountMicros: Math.round(afn * 1_000_000), currencyCode: 'AFN' } : null;

// ---------- competitor product ----------

export type CompetitorProduct = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  demoUrl: { primaryLinkUrl: string | null } | null;
  pricingModel: string | null;
  startingPrice: { amountMicros: number | null; currencyCode: string | null } | null;
  pricingSummary: string | null;
  strengths: string | null;
  weaknesses: string | null;
  competitorId: string | null;
  createdAt: string;
};

const COMPETITOR_PRODUCT_FIELDS = `
  id name category description pricingModel pricingSummary strengths weaknesses competitorId createdAt
  demoUrl { primaryLinkUrl }
  startingPrice { amountMicros currencyCode }
`;

export const fetchCompetitorProducts = async (
  competitorId: string,
): Promise<CompetitorProduct[]> => {
  const data = await coreQuery<{
    competitorProducts: { edges: { node: CompetitorProduct }[] };
  }>(
    `query CompetitorProducts($competitorId: UUID!) {
      competitorProducts(filter: { competitorId: { eq: $competitorId } }, first: 100, orderBy: [{ name: AscNullsLast }]) {
        edges { node { ${COMPETITOR_PRODUCT_FIELDS} } }
      }
    }`,
    { competitorId },
  );
  return data.competitorProducts.edges.map((e) => e.node);
};

export type CompetitorProductInput = {
  name: string;
  competitorId: string;
  category?: string | null;
  description?: string | null;
  demoUrl?: string | null;
  pricingModel?: string | null;
  startingPriceAfn?: number | null;
  pricingSummary?: string | null;
  strengths?: string | null;
  weaknesses?: string | null;
};

export const saveCompetitorProduct = async (
  input: CompetitorProductInput,
  id?: string,
): Promise<string> => {
  const payload: Record<string, unknown> = {
    name: input.name,
    competitorId: input.competitorId,
    category: input.category || null,
    description: input.description || null,
    demoUrl: input.demoUrl ? { primaryLinkUrl: input.demoUrl } : null,
    pricingModel: input.pricingModel || null,
    startingPrice: toAmount(input.startingPriceAfn),
    pricingSummary: input.pricingSummary || null,
    strengths: input.strengths || null,
    weaknesses: input.weaknesses || null,
  };
  if (id) {
    const data = await coreQuery<{ updateCompetitorProduct: { id: string } }>(
      `mutation UpdateCompetitorProduct($id: UUID!, $data: CompetitorProductUpdateInput!) {
        updateCompetitorProduct(id: $id, data: $data) { id }
      }`,
      { id, data: payload },
    );
    return data.updateCompetitorProduct.id;
  }
  const data = await coreQuery<{ createCompetitorProduct: { id: string } }>(
    `mutation CreateCompetitorProduct($data: CompetitorProductCreateInput!) {
      createCompetitorProduct(data: $data) { id }
    }`,
    { data: payload },
  );
  return data.createCompetitorProduct.id;
};

// ---------- competitor update (news / timeline entries — "notes") ----------

export type CompetitorUpdateEntry = {
  id: string;
  title: string;
  updateType: string | null;
  date: string | null;
  body: string | null;
  source: { primaryLinkUrl: string | null } | null;
  competitorId: string | null;
  productId: string | null;
  createdAt: string;
};

const COMPETITOR_UPDATE_FIELDS = `
  id title updateType date body competitorId productId createdAt
  source { primaryLinkUrl }
`;

export const fetchCompetitorUpdates = async (
  competitorId: string,
): Promise<CompetitorUpdateEntry[]> => {
  const data = await coreQuery<{
    competitorUpdates: { edges: { node: CompetitorUpdateEntry }[] };
  }>(
    `query CompetitorUpdates($competitorId: UUID!) {
      competitorUpdates(filter: { competitorId: { eq: $competitorId } }, first: 100, orderBy: [{ date: DescNullsLast }]) {
        edges { node { ${COMPETITOR_UPDATE_FIELDS} } }
      }
    }`,
    { competitorId },
  );
  return data.competitorUpdates.edges.map((e) => e.node);
};

export type CompetitorUpdateInput = {
  title: string;
  competitorId: string;
  updateType?: string | null;
  date?: string | null;
  body?: string | null;
  source?: string | null;
};

export const saveCompetitorUpdate = async (
  input: CompetitorUpdateInput,
  id?: string,
): Promise<string> => {
  const payload: Record<string, unknown> = {
    title: input.title,
    competitorId: input.competitorId,
    updateType: input.updateType || null,
    date: input.date ?? new Date().toISOString(),
    body: input.body || null,
    source: input.source ? { primaryLinkUrl: input.source } : null,
  };
  if (id) {
    const data = await coreQuery<{ updateCompetitorUpdate: { id: string } }>(
      `mutation UpdateCompetitorUpdate($id: UUID!, $data: CompetitorUpdateUpdateInput!) {
        updateCompetitorUpdate(id: $id, data: $data) { id }
      }`,
      { id, data: payload },
    );
    return data.updateCompetitorUpdate.id;
  }
  const data = await coreQuery<{ createCompetitorUpdate: { id: string } }>(
    `mutation CreateCompetitorUpdate($data: CompetitorUpdateCreateInput!) {
      createCompetitorUpdate(data: $data) { id }
    }`,
    { data: payload },
  );
  return data.createCompetitorUpdate.id;
};

// ---------- competitor usage ("users" — who of ours uses this competitor) ----------

export type CompetitorUsage = {
  id: string;
  name: string | null;
  status: string | null;
  satisfaction: string | null;
  switchingSignal: string | null;
  renewalDate: string | null;
  notes: string | null;
  competitorId: string | null;
  productId: string | null;
  personId: string | null;
  opportunityId: string | null;
  person: { id: string; name: { firstName: string; lastName: string } } | null;
  opportunity: { id: string; name: string } | null;
  createdAt: string;
};

const COMPETITOR_USAGE_FIELDS = `
  id name status satisfaction switchingSignal renewalDate notes
  competitorId productId personId opportunityId createdAt
  person { id name { firstName lastName } }
  opportunity { id name }
`;

export const fetchCompetitorUsages = async (
  competitorId: string,
): Promise<CompetitorUsage[]> => {
  const data = await coreQuery<{
    competitorUsages: { edges: { node: CompetitorUsage }[] };
  }>(
    `query CompetitorUsages($competitorId: UUID!) {
      competitorUsages(filter: { competitorId: { eq: $competitorId } }, first: 100, orderBy: [{ createdAt: DescNullsLast }]) {
        edges { node { ${COMPETITOR_USAGE_FIELDS} } }
      }
    }`,
    { competitorId },
  );
  return data.competitorUsages.edges.map((e) => e.node);
};
