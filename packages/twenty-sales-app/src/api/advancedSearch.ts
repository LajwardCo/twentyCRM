import { coreQuery } from './client';
import { globalSearch, type SearchHit } from './records';
import {
  makeSnippet,
  normalizeText,
  phoneQueryFragment,
  queryVariants,
  queryWords,
} from '../lib/searchText';

// Advanced ("deep") search.
//
// Twenty's native `search` query only looks at each record's search vector,
// which is built from its LABEL fields. That is why a seller searching for a
// phone number, an address, a line out of a visit note or a product brand gets
// nothing back — the text is in the database but not in the vector.
//
// This module sweeps the actual columns with `ilike`, one probe per
// object/field group, then folds the native search in on top. Every probe is
// independent and failure-tolerant: a field that doesn't exist in a given
// workspace (say `product.brand` before it was provisioned) drops that one
// probe instead of failing the whole search.

export type AdvancedHit = SearchHit & {
  description: string | null;
  // Which field actually matched, in Persian, for the result row's subtitle.
  matchedField: string | null;
  score: number;
};

const PER_PROBE_LIMIT = 12;

// ---------- scoring ----------

const SCORE_EXACT = 100;
const SCORE_PREFIX = 70;
const SCORE_LABEL = 50;
const SCORE_FIELD = 30;
const SCORE_RELATED = 18;

const labelScore = (label: string, query: string): number => {
  const haystack = normalizeText(label);
  const needle = normalizeText(query);
  if (needle === '') return 0;
  if (haystack === needle) return SCORE_EXACT;
  if (haystack.startsWith(needle)) return SCORE_PREFIX;
  if (haystack.includes(needle)) return SCORE_LABEL;

  // Every word present, in any order — "شرکت نور" finding "نور تجارت شرکت".
  const words = queryWords(query);
  if (words.length > 1 && words.every((word) => haystack.includes(word))) {
    return SCORE_LABEL - 5;
  }
  return 0;
};

// ---------- probe plumbing ----------

type Probe = {
  objectNameSingular: string;
  // Persian name of the field that matched, for the subtitle.
  matchedField: string;
  run: (variants: string[], phone: string | null) => Promise<RawMatch[]>;
};

type RawMatch = {
  recordId: string;
  label: string;
  detail: string | null;
};

const ilikeAny = (
  variants: string[],
  build: (pattern: string) => Record<string, unknown>,
): Record<string, unknown>[] =>
  variants.map((variant) => build(`%${variant}%`));

// Runs a probe and swallows its failure — one unsupported field must not cost
// the seller the other nine probes' results.
const safely = async (
  run: () => Promise<RawMatch[]>,
): Promise<RawMatch[]> => {
  try {
    return await run();
  } catch {
    return [];
  }
};

type Edge<TNode> = { edges: { node: TNode }[] };

const personLabel = (node: {
  name: { firstName: string | null; lastName: string | null } | null;
}): string =>
  [node.name?.firstName, node.name?.lastName].filter(Boolean).join(' ').trim();

// ---------- the probes ----------

const opportunityProbe: Probe = {
  objectNameSingular: 'opportunity',
  matchedField: 'نام لید',
  run: async (variants) => {
    const data = await coreQuery<{
      opportunities: Edge<{ id: string; name: string }>;
    }>(
      `query AdvOpportunities($filter: OpportunityFilterInput, $limit: Int) {
        opportunities(filter: $filter, first: $limit) {
          edges { node { id name } }
        }
      }`,
      {
        filter: { or: ilikeAny(variants, (p) => ({ name: { ilike: p } })) },
        limit: PER_PROBE_LIMIT,
      },
    );
    return data.opportunities.edges.map((e) => ({
      recordId: e.node.id,
      label: e.node.name,
      detail: null,
    }));
  },
};

const personProbe: Probe = {
  objectNameSingular: 'person',
  matchedField: 'مشخصات شخص',
  run: async (variants, phone) => {
    const or = [
      ...ilikeAny(variants, (p) => ({ name: { firstName: { ilike: p } } })),
      ...ilikeAny(variants, (p) => ({ name: { lastName: { ilike: p } } })),
      ...ilikeAny(variants, (p) => ({ emails: { primaryEmail: { ilike: p } } })),
      ...ilikeAny(variants, (p) => ({ jobTitle: { ilike: p } })),
      ...ilikeAny(variants, (p) => ({ city: { ilike: p } })),
      ...(phone !== null
        ? [{ phones: { primaryPhoneNumber: { ilike: `%${phone}%` } } }]
        : []),
    ];

    const data = await coreQuery<{
      people: Edge<{
        id: string;
        name: { firstName: string | null; lastName: string | null } | null;
        jobTitle: string | null;
        city: string | null;
        emails: { primaryEmail: string | null } | null;
        phones: {
          primaryPhoneCallingCode: string | null;
          primaryPhoneNumber: string | null;
        } | null;
        company: { name: string } | null;
      }>;
    }>(
      `query AdvPeople($filter: PersonFilterInput, $limit: Int) {
        people(filter: $filter, first: $limit) {
          edges { node {
            id
            name { firstName lastName }
            jobTitle
            city
            emails { primaryEmail }
            phones { primaryPhoneCallingCode primaryPhoneNumber }
            company { name }
          } }
        }
      }`,
      { filter: { or }, limit: PER_PROBE_LIMIT },
    );

    return data.people.edges.map((e) => {
      const node = e.node;
      const phoneText = node.phones?.primaryPhoneNumber
        ? `${node.phones.primaryPhoneCallingCode ?? ''}${node.phones.primaryPhoneNumber}`
        : null;
      return {
        recordId: node.id,
        label: personLabel(node) || '—',
        detail:
          [
            node.company?.name,
            node.jobTitle,
            node.city,
            phoneText,
            node.emails?.primaryEmail,
          ]
            .filter(Boolean)
            .join(' · ') || null,
      };
    });
  },
};

const companyProbe: Probe = {
  objectNameSingular: 'company',
  matchedField: 'مشخصات شرکت',
  run: async (variants) => {
    const or = [
      ...ilikeAny(variants, (p) => ({ name: { ilike: p } })),
      ...ilikeAny(variants, (p) => ({
        domainName: { primaryLinkUrl: { ilike: p } },
      })),
      ...ilikeAny(variants, (p) => ({
        address: { addressCity: { ilike: p } },
      })),
      ...ilikeAny(variants, (p) => ({
        address: { addressStreet1: { ilike: p } },
      })),
    ];

    const data = await coreQuery<{
      companies: Edge<{
        id: string;
        name: string;
        domainName: { primaryLinkUrl: string | null } | null;
        address: {
          addressCity: string | null;
          addressStreet1: string | null;
        } | null;
      }>;
    }>(
      `query AdvCompanies($filter: CompanyFilterInput, $limit: Int) {
        companies(filter: $filter, first: $limit) {
          edges { node {
            id
            name
            domainName { primaryLinkUrl }
            address { addressCity addressStreet1 }
          } }
        }
      }`,
      { filter: { or }, limit: PER_PROBE_LIMIT },
    );

    return data.companies.edges.map((e) => ({
      recordId: e.node.id,
      label: e.node.name,
      detail:
        [
          e.node.address?.addressCity,
          e.node.address?.addressStreet1,
          e.node.domainName?.primaryLinkUrl?.replace(/^https?:\/\//, ''),
        ]
          .filter(Boolean)
          .join(' · ') || null,
    }));
  },
};

// Task and Note share a shape: a title plus a rich-text body whose markdown
// sub-column is where visit reports and call notes actually live.
const bodyProbe = (
  plural: 'tasks' | 'notes',
  singular: string,
  filterType: string,
  query: string,
): Probe => ({
  objectNameSingular: singular,
  matchedField: 'متن',
  run: async (variants) => {
    const or = [
      ...ilikeAny(variants, (p) => ({ title: { ilike: p } })),
      ...ilikeAny(variants, (p) => ({ bodyV2: { markdown: { ilike: p } } })),
    ];

    const data = await coreQuery<
      Record<
        string,
        Edge<{
          id: string;
          title: string | null;
          bodyV2: { markdown: string | null } | null;
        }>
      >
    >(
      `query AdvBodies($filter: ${filterType}, $limit: Int) {
        ${plural}(filter: $filter, first: $limit) {
          edges { node { id title bodyV2 { markdown } } }
        }
      }`,
      { filter: { or }, limit: PER_PROBE_LIMIT },
    );

    return data[plural].edges.map((e) => ({
      recordId: e.node.id,
      label: e.node.title ?? '—',
      detail: makeSnippet(e.node.bodyV2?.markdown ?? '', query),
    }));
  },
});

// Catalog search. `brand`/`category` are provisioned separately, so a
// workspace without them simply loses this probe rather than the search.
const productProbe: Probe = {
  objectNameSingular: 'product',
  matchedField: 'محصول',
  run: async (variants) => {
    const or = [
      ...ilikeAny(variants, (p) => ({ name: { ilike: p } })),
      ...ilikeAny(variants, (p) => ({ brand: { ilike: p } })),
      ...ilikeAny(variants, (p) => ({ category: { ilike: p } })),
    ];

    const data = await coreQuery<{
      products: Edge<{
        id: string;
        name: string;
        brand: string | null;
        category: string | null;
      }>;
    }>(
      `query AdvProducts($filter: ProductFilterInput, $limit: Int) {
        products(filter: $filter, first: $limit) {
          edges { node { id name brand category } }
        }
      }`,
      { filter: { or }, limit: PER_PROBE_LIMIT },
    );

    return data.products.edges.map((e) => ({
      recordId: e.node.id,
      label: e.node.name,
      detail: [e.node.brand, e.node.category].filter(Boolean).join(' · ') || null,
    }));
  },
};

// ---------- relation expansion ----------

// A seller who searches a contact's phone number almost always wants the LEAD,
// not the contact card. Once people/companies have matched, pull the
// opportunities hanging off them and offer those too.
const relatedLeads = async (
  personIds: string[],
  companyIds: string[],
): Promise<RawMatch[]> => {
  if (personIds.length === 0 && companyIds.length === 0) return [];

  const or: Record<string, unknown>[] = [];
  if (personIds.length > 0) or.push({ pointOfContactId: { in: personIds } });
  if (companyIds.length > 0) or.push({ companyId: { in: companyIds } });

  const data = await coreQuery<{
    opportunities: Edge<{
      id: string;
      name: string;
      company: { name: string } | null;
      pointOfContact: {
        name: { firstName: string | null; lastName: string | null } | null;
      } | null;
    }>;
  }>(
    `query AdvRelatedLeads($filter: OpportunityFilterInput, $limit: Int) {
      opportunities(filter: $filter, first: $limit) {
        edges { node {
          id
          name
          company { name }
          pointOfContact { name { firstName lastName } }
        } }
      }
    }`,
    { filter: { or }, limit: PER_PROBE_LIMIT * 2 },
  );

  return data.opportunities.edges.map((e) => ({
    recordId: e.node.id,
    label: e.node.name,
    detail:
      [
        e.node.company?.name,
        e.node.pointOfContact ? personLabel(e.node.pointOfContact) : null,
      ]
        .filter(Boolean)
        .join(' · ') || null,
  }));
};

// ---------- the search ----------

type Accumulator = Map<string, AdvancedHit>;

const add = (
  accumulator: Accumulator,
  hit: Omit<AdvancedHit, 'score'> & { score: number },
) => {
  const key = `${hit.objectNameSingular}:${hit.recordId}`;
  const existing = accumulator.get(key);
  if (existing === undefined) {
    accumulator.set(key, hit);
    return;
  }
  // Same record found by two probes: keep the better score, and let the
  // stronger match decide how the row explains itself.
  const stronger = hit.score > existing.score ? hit : existing;
  accumulator.set(key, {
    ...stronger,
    score: Math.max(existing.score, hit.score),
    description: existing.description ?? hit.description,
  });
};

export const advancedSearch = async (
  query: string,
  limit = 30,
): Promise<AdvancedHit[]> => {
  const trimmed = query.trim();
  if (trimmed === '') return [];

  const variants = queryVariants(trimmed);
  const phone = phoneQueryFragment(trimmed);

  const probes: Probe[] = [
    opportunityProbe,
    personProbe,
    companyProbe,
    bodyProbe('tasks', 'task', 'TaskFilterInput', trimmed),
    bodyProbe('notes', 'note', 'NoteFilterInput', trimmed),
    productProbe,
  ];

  const [probeResults, nativeHits] = await Promise.all([
    Promise.all(
      probes.map((probe) => safely(() => probe.run(variants, phone))),
    ),
    // The native vector search still earns its keep: it catches fields we
    // don't probe and it ranks by Postgres' own relevance.
    globalSearch(trimmed, limit).catch((): SearchHit[] => []),
  ]);

  const accumulator: Accumulator = new Map();

  probes.forEach((probe, index) => {
    for (const match of probeResults[index]) {
      const fromLabel = labelScore(match.label, trimmed);
      add(accumulator, {
        recordId: match.recordId,
        objectNameSingular: probe.objectNameSingular,
        label: match.label,
        description: match.detail,
        matchedField: fromLabel > 0 ? null : probe.matchedField,
        score: Math.max(fromLabel, SCORE_FIELD),
      });
    }
  });

  for (const hit of nativeHits) {
    add(accumulator, {
      ...hit,
      description: null,
      matchedField: null,
      score: Math.max(labelScore(hit.label, trimmed), SCORE_FIELD),
    });
  }

  // Second pass: leads reachable through the contacts and companies we found.
  const personIds = probeResults[1].map((m) => m.recordId);
  const companyIds = probeResults[2].map((m) => m.recordId);
  const related = await safely(() => relatedLeads(personIds, companyIds));

  for (const match of related) {
    add(accumulator, {
      recordId: match.recordId,
      objectNameSingular: 'opportunity',
      label: match.label,
      description: match.detail,
      matchedField: 'از طریق مخاطب یا شرکت',
      score: SCORE_RELATED,
    });
  }

  return [...accumulator.values()]
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'fa'))
    .slice(0, limit);
};
