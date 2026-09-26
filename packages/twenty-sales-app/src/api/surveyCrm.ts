import { type CrmExistingValues } from '@shared/surveys';

import { coreQuery } from './client';
import { normalizePhone } from './records';

// CRM lookups and writes used by survey collection and review. Everything
// runs with the signed-in user's own permissions; nothing here merges or
// overwrites silently — callers show proposed changes first.

export type CrmRecordKind = 'company' | 'person' | 'opportunity';

export type CrmRecordOption = {
  id: string;
  kind: CrmRecordKind;
  label: string;
  sub: string;
};

type PersonName = { firstName: string; lastName: string };

const personLabel = (name: PersonName | null | undefined): string =>
  `${name?.firstName ?? ''} ${name?.lastName ?? ''}`.trim();

export const searchCompanies = async (
  query: string,
): Promise<CrmRecordOption[]> => {
  const data = await coreQuery<{
    companies: {
      edges: {
        node: { id: string; name: string; address: { addressCity: string | null } | null };
      }[];
    };
  }>(
    `query SurveyCompanySearch($pattern: String!) {
      companies(filter: { name: { ilike: $pattern } }, first: 20, orderBy: [{ updatedAt: DescNullsLast }]) {
        edges { node { id name address { addressCity } } }
      }
    }`,
    { pattern: `%${query.trim()}%` },
  );

  return data.companies.edges.map(({ node }) => ({
    id: node.id,
    kind: 'company',
    label: node.name,
    sub: node.address?.addressCity ?? '',
  }));
};

export const searchPeople = async (
  query: string,
  companyId?: string | null,
): Promise<CrmRecordOption[]> => {
  const pattern = `%${query.trim()}%`;
  const filter: Record<string, unknown> = {
    or: [
      { name: { firstName: { ilike: pattern } } },
      { name: { lastName: { ilike: pattern } } },
      { phones: { primaryPhoneNumber: { ilike: pattern } } },
    ],
  };
  const data = await coreQuery<{
    people: {
      edges: {
        node: {
          id: string;
          name: PersonName;
          phones: { primaryPhoneNumber: string | null } | null;
          company: { name: string } | null;
        };
      }[];
    };
  }>(
    `query SurveyPeopleSearch($filter: PersonFilterInput) {
      people(filter: $filter, first: 20) {
        edges { node { id name { firstName lastName } phones { primaryPhoneNumber } company { name } } }
      }
    }`,
    {
      filter:
        companyId === undefined || companyId === null
          ? filter
          : { and: [filter, { companyId: { eq: companyId } }] },
    },
  );

  return data.people.edges.map(({ node }) => ({
    id: node.id,
    kind: 'person',
    label: personLabel(node.name),
    sub: [node.company?.name, node.phones?.primaryPhoneNumber].filter(Boolean).join(' · '),
  }));
};

export const searchLeads = async (
  query: string,
  companyId?: string | null,
): Promise<CrmRecordOption[]> => {
  const nameFilter = { name: { ilike: `%${query.trim()}%` } };
  const data = await coreQuery<{
    opportunities: {
      edges: { node: { id: string; name: string; stage: string | null; company: { name: string } | null } }[];
    };
  }>(
    `query SurveyLeadSearch($filter: OpportunityFilterInput) {
      opportunities(filter: $filter, first: 20, orderBy: [{ updatedAt: DescNullsLast }]) {
        edges { node { id name stage company { name } } }
      }
    }`,
    {
      filter:
        companyId === undefined || companyId === null
          ? nameFilter
          : { and: [nameFilter, { companyId: { eq: companyId } }] },
    },
  );

  return data.opportunities.edges.map(({ node }) => ({
    id: node.id,
    kind: 'opportunity',
    label: node.name,
    sub: [node.company?.name, node.stage].filter(Boolean).join(' · '),
  }));
};

// Contacts and leads are searched within the chosen company first; when it
// has none that match, the whole workspace is searched instead.
export const searchCrmRecords = async (
  kind: CrmRecordKind,
  query: string,
  companyId?: string | null,
): Promise<CrmRecordOption[]> => {
  if (kind === 'company') return searchCompanies(query);

  const search = kind === 'person' ? searchPeople : searchLeads;
  const scoped = await search(query, companyId);

  return scoped.length > 0 || companyId === undefined || companyId === null
    ? scoped
    : search(query, null);
};

// Leads and contacts already attached to a company, for "link existing"
// after the business is chosen.
export const fetchCompanyLinkables = async (
  companyId: string,
): Promise<{ people: CrmRecordOption[]; leads: CrmRecordOption[] }> => {
  const data = await coreQuery<{
    people: { edges: { node: { id: string; name: PersonName; jobTitle: string | null } }[] };
    opportunities: { edges: { node: { id: string; name: string; stage: string | null } }[] };
  }>(
    `query SurveyCompanyLinkables($companyId: UUID!) {
      people(filter: { companyId: { eq: $companyId } }, first: 50) {
        edges { node { id name { firstName lastName } jobTitle } }
      }
      opportunities(filter: { companyId: { eq: $companyId } }, first: 50) {
        edges { node { id name stage } }
      }
    }`,
    { companyId },
  );

  return {
    people: data.people.edges.map(({ node }) => ({
      id: node.id,
      kind: 'person',
      label: personLabel(node.name),
      sub: node.jobTitle ?? '',
    })),
    leads: data.opportunities.edges.map(({ node }) => ({
      id: node.id,
      kind: 'opportunity',
      label: node.name,
      sub: node.stage ?? '',
    })),
  };
};

export const createCompany = async (input: {
  name: string;
  city?: string;
  street?: string;
  businessType?: string;
  employees?: number | null;
}): Promise<{ id: string }> => {
  const address =
    (input.city ?? '') !== '' || (input.street ?? '') !== ''
      ? { address: { addressStreet1: input.street ?? '', addressCity: input.city ?? '' } }
      : {};
  const data = await coreQuery<{ createCompany: { id: string } }>(
    `mutation SurveyCreateCompany($data: CompanyCreateInput!) { createCompany(data: $data) { id } }`,
    {
      data: {
        name: input.name.trim(),
        ...address,
        ...(input.employees !== undefined && input.employees !== null ? { employees: input.employees } : {}),
      },
    },
  );

  // businessType is a fork-provisioned text field that may be missing on an
  // older workspace; the company is still created without it.
  if (input.businessType !== undefined && input.businessType.trim() !== '') {
    await coreQuery(
      `mutation SurveyCompanyType($id: UUID!, $data: CompanyUpdateInput!) { updateCompany(id: $id, data: $data) { id } }`,
      { id: data.createCompany.id, data: { businessType: input.businessType.trim() } },
    ).catch(() => undefined);
  }

  return data.createCompany;
};

export const createPerson = async (input: {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  jobTitle?: string;
  companyId: string | null;
}): Promise<{ id: string }> => {
  const phones = input.phone ? normalizePhone(input.phone) : null;
  const data = await coreQuery<{ createPerson: { id: string } }>(
    `mutation SurveyCreatePerson($data: PersonCreateInput!) { createPerson(data: $data) { id } }`,
    {
      data: {
        name: { firstName: input.firstName.trim(), lastName: input.lastName.trim() },
        ...(input.companyId !== null ? { companyId: input.companyId } : {}),
        ...(phones ? { phones } : {}),
        ...(input.email && input.email.trim() !== ''
          ? { emails: { primaryEmail: input.email.trim() } }
          : {}),
        ...(input.jobTitle && input.jobTitle.trim() !== '' ? { jobTitle: input.jobTitle.trim() } : {}),
      },
    },
  );

  return data.createPerson;
};

export const createLead = async (input: {
  name: string;
  companyId: string | null;
  personId: string | null;
  ownerId: string;
}): Promise<{ id: string }> => {
  const base = {
    name: input.name.trim(),
    ownerId: input.ownerId,
    ...(input.companyId !== null ? { companyId: input.companyId } : {}),
    ...(input.personId !== null ? { pointOfContactId: input.personId } : {}),
  };
  const create = (data: Record<string, unknown>) =>
    coreQuery<{ createOpportunity: { id: string } }>(
      `mutation SurveyCreateLead($data: OpportunityCreateInput!) { createOpportunity(data: $data) { id } }`,
      { data },
    );

  // The sales pipeline starts at NEW_LEAD; a workspace with Twenty's stock
  // stages rejects that value, so fall back to its default stage.
  try {
    return (await create({ ...base, stage: 'NEW_LEAD' })).createOpportunity;
  } catch (error) {
    if (!(error instanceof Error) || !/NEW_LEAD|stage/i.test(error.message)) throw error;

    return (await create(base)).createOpportunity;
  }
};

// Current CRM values for the fields a form maps to, keyed like the engine's
// CrmTargetField, so proposeCrmChanges can compare answer against record.
export const fetchExistingCrmValues = async (ids: {
  companyId: string | null;
  personId: string | null;
  opportunityId: string | null;
}): Promise<CrmExistingValues> => {
  const values: CrmExistingValues = {};

  if (ids.companyId !== null) {
    const data = await coreQuery<{
      company: {
        name: string | null;
        employees: number | null;
        domainName: { primaryLinkUrl: string | null } | null;
        address: { addressStreet1: string | null; addressCity: string | null } | null;
      } | null;
    }>(
      `query SurveyCompanyValues($id: UUID!) {
        company(filter: { id: { eq: $id } }) {
          name employees domainName { primaryLinkUrl } address { addressStreet1 addressCity }
        }
      }`,
      { id: ids.companyId },
    );
    const company = data.company;

    if (company !== null) {
      values['company.name'] = company.name;
      values['company.employees'] = company.employees;
      values['company.domainName'] = company.domainName?.primaryLinkUrl ?? null;
      values['company.address'] =
        [company.address?.addressStreet1, company.address?.addressCity].filter(Boolean).join('، ') || null;
    }

    const extras = await coreQuery<{ company: { businessType: string | null } | null }>(
      `query SurveyCompanyType($id: UUID!) { company(filter: { id: { eq: $id } }) { businessType } }`,
      { id: ids.companyId },
    ).catch(() => null);

    values['company.businessType'] = extras?.company?.businessType ?? null;
  }

  if (ids.personId !== null) {
    const data = await coreQuery<{
      person: {
        name: PersonName | null;
        jobTitle: string | null;
        phones: { primaryPhoneNumber: string | null; primaryPhoneCallingCode: string | null } | null;
        emails: { primaryEmail: string | null } | null;
      } | null;
    }>(
      `query SurveyPersonValues($id: UUID!) {
        person(filter: { id: { eq: $id } }) {
          name { firstName lastName } jobTitle
          phones { primaryPhoneNumber primaryPhoneCallingCode }
          emails { primaryEmail }
        }
      }`,
      { id: ids.personId },
    );
    const person = data.person;

    if (person !== null) {
      values['person.name'] = personLabel(person.name) || null;
      values['person.jobTitle'] = person.jobTitle;
      values['person.phone'] = person.phones?.primaryPhoneNumber
        ? `${person.phones.primaryPhoneCallingCode ?? ''}${person.phones.primaryPhoneNumber}`
        : null;
      values['person.email'] = person.emails?.primaryEmail ?? null;
    }
  }

  if (ids.opportunityId !== null) {
    const data = await coreQuery<{ opportunity: { name: string | null } | null }>(
      `query SurveyLeadValues($id: UUID!) { opportunity(filter: { id: { eq: $id } }) { name } }`,
      { id: ids.opportunityId },
    );

    values['opportunity.name'] = data.opportunity?.name ?? null;
  }

  return values;
};
