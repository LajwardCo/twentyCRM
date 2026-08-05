import { coreQuery } from './client';
import { normalizePhone, type CompanyContact } from './records';

// Extra contacts on a lead.
//
// A lead in Twenty carries exactly ONE `pointOfContact`, but real deals are
// worked through several people — a purchasing officer, a clinical lead, the
// person who actually answers the phone. Those people are modelled where they
// belong: as Persons on the lead's Company. This module holds the three writes
// a seller needs on that set: create a contact, pull in someone already in the
// CRM, and promote whichever of them is currently the one to call.

export type NewContactInput = {
  firstName: string;
  lastName: string;
  jobTitle: string;
  phone: string;
  email: string;
  city: string;
};

export const createCompanyContact = async (
  companyId: string,
  input: NewContactInput,
): Promise<CompanyContact> => {
  const phones = normalizePhone(input.phone);

  const data = await coreQuery<{ createPerson: CompanyContact }>(
    `mutation CreateLeadContact($data: PersonCreateInput!) {
      createPerson(data: $data) {
        id
        name { firstName lastName }
        jobTitle
        phones { primaryPhoneCallingCode primaryPhoneNumber }
        emails { primaryEmail }
      }
    }`,
    {
      data: {
        name: {
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
        },
        companyId,
        ...(input.jobTitle.trim() !== '' ? { jobTitle: input.jobTitle.trim() } : {}),
        ...(input.city.trim() !== '' ? { city: input.city.trim() } : {}),
        ...(phones !== null ? { phones } : {}),
        ...(input.email.trim() !== ''
          ? { emails: { primaryEmail: input.email.trim() } }
          : {}),
      },
    },
  );

  return data.createPerson;
};

// Moves an existing person onto this lead's company, so a contact already in
// the CRM (met on another deal, imported from a list) can join this lead
// without being duplicated.
export const attachExistingContact = async (
  personId: string,
  companyId: string,
): Promise<void> => {
  await coreQuery(
    `mutation AttachLeadContact($id: UUID!, $data: PersonUpdateInput!) {
      updatePerson(id: $id, data: $data) { id }
    }`,
    { id: personId, data: { companyId } },
  );
};

// The lead's single `pointOfContact` — the person the header dials and
// WhatsApps. Promoting a contact rewrites that pointer; nobody is removed from
// the company, so the old primary stays in the list.
export const setLeadPrimaryContact = async (
  leadId: string,
  personId: string,
): Promise<void> => {
  await coreQuery(
    `mutation SetLeadPrimaryContact($id: UUID!, $data: OpportunityUpdateInput!) {
      updateOpportunity(id: $id, data: $data) { id }
    }`,
    { id: leadId, data: { pointOfContactId: personId } },
  );
};

// People not yet on this company, for the "add an existing contact" picker.
export const searchUnlinkedPeople = async (
  search: string,
  companyId: string,
): Promise<CompanyContact[]> => {
  const pattern = `%${search.trim()}%`;
  const data = await coreQuery<{
    people: { edges: { node: CompanyContact }[] };
  }>(
    `query UnlinkedPeople($filter: PersonFilterInput) {
      people(filter: $filter, first: 8) {
        edges {
          node {
            id
            name { firstName lastName }
            jobTitle
            phones { primaryPhoneCallingCode primaryPhoneNumber }
            emails { primaryEmail }
          }
        }
      }
    }`,
    {
      filter: {
        and: [
          {
            or: [
              { name: { firstName: { ilike: pattern } } },
              { name: { lastName: { ilike: pattern } } },
              { phones: { primaryPhoneNumber: { ilike: pattern } } },
            ],
          },
          { or: [{ companyId: { neq: companyId } }, { companyId: { is: 'NULL' } }] },
        ],
      },
    },
  );

  return data.people.edges.map((e) => e.node);
};
