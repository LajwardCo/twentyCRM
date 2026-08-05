// Finds records that look like the lead a seller is about to register.
//
// Three signals, run in parallel: company/lead names by ILIKE on the most
// distinctive word, and phone/email through Twenty's search vector, which
// indexes person phones and emails so a contact is reachable without a
// composite-field filter.

import { coreQuery } from './client';
import {
  classifyMatch,
  type DuplicateMatch,
  nameSimilarity,
  normalizeName,
  phoneKey,
  rankMatches,
} from '../lib/duplicates';
import { globalSearch, searchHitRoute } from './records';

export type DuplicateQuery = {
  companyName: string;
  phone: string;
  email: string;
};

type NamedRecord = { id: string; name: string };

// The longest normalized word: the most distinctive part of the name, and the
// one least likely to be shared with an unrelated company.
const searchToken = (companyName: string): string | null => {
  const tokens = normalizeName(companyName).split(' ').filter((t) => t.length >= 3);
  if (tokens.length === 0) return null;
  return tokens.reduce((longest, t) => (t.length > longest.length ? t : longest));
};

const fetchCompaniesByName = async (token: string): Promise<NamedRecord[]> => {
  const data = await coreQuery<{
    companies: { edges: { node: NamedRecord }[] };
  }>(
    `query DuplicateCompanies($pattern: String!) {
      companies(filter: { name: { ilike: $pattern } }, first: 20) {
        edges { node { id name } }
      }
    }`,
    { pattern: `%${token}%` },
  );
  return data.companies.edges.map((e) => e.node);
};

const fetchLeadsByName = async (
  token: string,
): Promise<(NamedRecord & { stage: string | null })[]> => {
  const data = await coreQuery<{
    opportunities: { edges: { node: NamedRecord & { stage: string | null } }[] };
  }>(
    `query DuplicateLeads($pattern: String!) {
      opportunities(filter: { name: { ilike: $pattern } }, first: 20) {
        edges { node { id name stage } }
      }
    }`,
    { pattern: `%${token}%` },
  );
  return data.opportunities.edges.map((e) => e.node);
};

// The search vector tokenizes the number as stored, so the normalized key is
// tried alongside the raw digits the seller typed.
const contactSearchTerms = (query: DuplicateQuery): string[] => {
  const terms: string[] = [];
  const key = phoneKey(query.phone);
  if (key) {
    terms.push(key.replace('+', ''));
    const local = query.phone.replace(/[\s\-()+]/g, '');
    if (local !== '' && local !== key.replace('+', '')) terms.push(local);
  }
  if (query.email.trim() !== '') terms.push(query.email.trim());
  return terms;
};

// Every query is defensive: a duplicate check that throws must never stop a
// seller from registering a lead. A missed duplicate is a nuisance; a lead that
// cannot be saved is a lost sale.
const settled = async <T>(run: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await run();
  } catch {
    return fallback;
  }
};

export const findLeadDuplicates = async (
  query: DuplicateQuery,
): Promise<DuplicateMatch[]> => {
  const token = searchToken(query.companyName);
  const contactTerms = contactSearchTerms(query);

  if (token === null && contactTerms.length === 0) return [];

  const [companies, leads, contactHits] = await Promise.all([
    token ? settled(() => fetchCompaniesByName(token), []) : Promise.resolve([]),
    token ? settled(() => fetchLeadsByName(token), []) : Promise.resolve([]),
    Promise.all(
      contactTerms.map((term) => settled(() => globalSearch(term, 8), [])),
    ).then((results) => results.flat()),
  ]);

  const matches: DuplicateMatch[] = [];

  for (const lead of leads) {
    const score = nameSimilarity(query.companyName, lead.name);
    const level = classifyMatch({ nameScore: score, exactContact: false });
    if (!level) continue;
    matches.push({
      id: lead.id,
      kind: 'lead',
      label: lead.name,
      sub: lead.stage ?? '',
      score,
      level,
      route: `/lead/${lead.id}`,
    });
  }

  for (const company of companies) {
    const score = nameSimilarity(query.companyName, company.name);
    const level = classifyMatch({ nameScore: score, exactContact: false });
    if (!level) continue;
    matches.push({
      id: company.id,
      kind: 'company',
      label: company.name,
      sub: '',
      score,
      level,
      route: `/company/${company.id}`,
    });
  }

  // A phone or email hit is exact by construction — the search matched the
  // contact detail itself, not an approximation of the name.
  for (const hit of contactHits) {
    if (hit.objectNameSingular === 'task' || hit.objectNameSingular === 'note') {
      continue;
    }
    matches.push({
      id: hit.recordId,
      kind: hit.objectNameSingular === 'person' ? 'person' : 'lead',
      label: hit.label,
      sub: '',
      score: 1,
      level: 'exact',
      route: searchHitRoute(hit),
    });
  }

  return rankMatches(matches);
};
