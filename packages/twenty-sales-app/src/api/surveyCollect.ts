import { type CollectLinks, type LinkLabels } from '../lib/forms/collect/prefill';
import { exactIlikePattern } from '../lib/forms/collect/paperEntry';
import { coreQuery } from './client';

// Small reads the collection screens need that the shared survey API does
// not cover: labels for prefilled CRM links, company lookups for the visit
// flow, and the live duplicate check for paper sheet references.

type PersonName = { firstName: string; lastName: string };

const personLabel = (name: PersonName | null | undefined): string =>
  `${name?.firstName ?? ''} ${name?.lastName ?? ''}`.trim();

export const fetchLinkLabels = async (
  links: Pick<CollectLinks, 'companyId' | 'personId' | 'opportunityId'>,
): Promise<LinkLabels> => {
  const labels: LinkLabels = {};
  const tasks: Promise<void>[] = [];

  if (links.companyId !== null) {
    const companyId = links.companyId;

    tasks.push(
      coreQuery<{ company: { id: string; name: string | null } | null }>(
        `query CollectCompanyLabel($id: UUID!) { company(filter: { id: { eq: $id } }) { id name } }`,
        { id: companyId },
      ).then((data) => {
        if (data.company !== null) {
          labels.company = { recordId: data.company.id, label: data.company.name ?? '' };
        }
      }),
    );
  }

  if (links.personId !== null) {
    const personId = links.personId;

    tasks.push(
      coreQuery<{ person: { id: string; name: PersonName | null } | null }>(
        `query CollectPersonLabel($id: UUID!) { person(filter: { id: { eq: $id } }) { id name { firstName lastName } } }`,
        { id: personId },
      ).then((data) => {
        if (data.person !== null) {
          labels.person = { recordId: data.person.id, label: personLabel(data.person.name) };
        }
      }),
    );
  }

  if (links.opportunityId !== null) {
    const opportunityId = links.opportunityId;

    tasks.push(
      coreQuery<{ opportunity: { id: string; name: string | null } | null }>(
        `query CollectLeadLabel($id: UUID!) { opportunity(filter: { id: { eq: $id } }) { id name } }`,
        { id: opportunityId },
      ).then((data) => {
        if (data.opportunity !== null) {
          labels.opportunity = { recordId: data.opportunity.id, label: data.opportunity.name ?? '' };
        }
      }),
    );
  }

  // A deleted or inaccessible record just leaves its picker empty.
  await Promise.allSettled(tasks);

  return labels;
};

export type SimilarCompany = { id: string; name: string; city: string };

// Exact-ish name matches shown before a new prospect is created, so the same
// shop is not added twice by two collectors.
export const findSimilarCompanies = async (name: string): Promise<SimilarCompany[]> => {
  const trimmed = name.trim();

  if (trimmed.length < 2) return [];

  const data = await coreQuery<{
    companies: {
      edges: { node: { id: string; name: string; address: { addressCity: string | null } | null } }[];
    };
  }>(
    `query CollectSimilarCompanies($pattern: String!) {
      companies(filter: { name: { ilike: $pattern } }, first: 5) {
        edges { node { id name address { addressCity } } }
      }
    }`,
    { pattern: `%${exactIlikePattern(trimmed)}%` },
  );

  return data.companies.edges.map(({ node }) => ({
    id: node.id,
    name: node.name,
    city: node.address?.addressCity ?? '',
  }));
};

export type PaperReferenceMatch = { id: string; paperReference: string; name: string };

// Responses of this form already carrying the sheet reference (any case).
export const findPaperReferenceMatches = async (
  formId: string,
  paperReference: string,
): Promise<PaperReferenceMatch[]> => {
  const reference = paperReference.trim();

  if (reference === '') return [];

  const data = await coreQuery<{
    surveyResponses: { edges: { node: { id: string; paperReference: string | null; name: string | null } }[] };
  }>(
    `query CollectPaperReference($formId: UUID!, $reference: String!) {
      surveyResponses(
        filter: { and: [{ formId: { eq: $formId } }, { paperReference: { ilike: $reference } }] }
        first: 5
      ) { edges { node { id paperReference name } } }
    }`,
    { formId, reference: exactIlikePattern(reference) },
  );

  return data.surveyResponses.edges.map(({ node }) => ({
    id: node.id,
    paperReference: node.paperReference ?? '',
    name: node.name ?? '',
  }));
};
