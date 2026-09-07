import {
  type PhoneEntry,
  type PhonesValue,
  serializePhoneApps,
  toPhonesValue,
} from '../lib/phones';
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

// ---------- phone numbers + messaging apps ----------

// `phoneApps` is a plain TEXT field added by
// tools/sales-crm/provision-contact-phone-apps.mjs. An instance that has not
// run it keeps working: the numbers still save, and the app badges are simply
// unavailable — reported back so the UI can say so rather than silently
// dropping what the seller ticked.

export type PersonPhones = {
  phones: PhonesValue;
  phoneApps: string | null;
  // False when this instance has no `phoneApps` field.
  appsSupported: boolean;
};

const isMissingPhoneApps = (error: unknown): boolean =>
  error instanceof Error &&
  /(Cannot query field|is not defined by type|Unknown argument).*"?phoneApps/i.test(
    error.message,
  );

export const fetchPersonPhones = async (
  personId: string,
): Promise<PersonPhones> => {
  const selection = `
    phones {
      primaryPhoneCallingCode
      primaryPhoneNumber
      primaryPhoneCountryCode
      additionalPhones
    }`;

  try {
    const data = await coreQuery<{
      person: { phones: PhonesValue; phoneApps: string | null };
    }>(
      `query PersonPhones($id: UUID!) {
        person(filter: { id: { eq: $id } }) { ${selection} phoneApps }
      }`,
      { id: personId },
    );
    return {
      phones: data.person.phones,
      phoneApps: data.person.phoneApps,
      appsSupported: true,
    };
  } catch (error) {
    if (!isMissingPhoneApps(error)) throw error;
  }

  const data = await coreQuery<{ person: { phones: PhonesValue } }>(
    `query PersonPhonesOnly($id: UUID!) {
      person(filter: { id: { eq: $id } }) { ${selection} }
    }`,
    { id: personId },
  );
  return { phones: data.person.phones, phoneApps: null, appsSupported: false };
};

// Saves the numbers and their app tags together. If the instance lacks
// `phoneApps` the numbers are still written — losing the badges is a far
// smaller failure than losing the number the seller just typed — and the
// caller is told, so it can explain the missing half.
export const savePersonPhones = async (
  personId: string,
  entries: PhoneEntry[],
): Promise<{ appsSaved: boolean }> => {
  const phones = toPhonesValue(entries);
  const phoneApps = serializePhoneApps(entries);

  try {
    await coreQuery(
      `mutation SavePersonPhones($id: UUID!, $data: PersonUpdateInput!) {
        updatePerson(id: $id, data: $data) { id }
      }`,
      { id: personId, data: { phones, phoneApps } },
    );
    return { appsSaved: true };
  } catch (error) {
    if (!isMissingPhoneApps(error)) throw error;
  }

  await coreQuery(
    `mutation SavePersonPhonesOnly($id: UUID!, $data: PersonUpdateInput!) {
      updatePerson(id: $id, data: $data) { id }
    }`,
    { id: personId, data: { phones } },
  );
  return { appsSaved: false };
};

// ---------- editing the lead's contact person ----------
//
// Phone numbers are edited separately (see savePersonPhones above), because a
// person can carry several lines and that needs a picker of its own. Everything
// here is the single-valued identity of the contact.

export type ContactIdentity = {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
};

export const fetchContactIdentity = async (
  personId: string,
): Promise<ContactIdentity | null> => {
  const data = await coreQuery<{
    person: {
      name: { firstName: string | null; lastName: string | null } | null;
      emails: { primaryEmail: string | null } | null;
      jobTitle: string | null;
    } | null;
  }>(
    `query ContactIdentity($id: UUID!) {
      person(filter: { id: { eq: $id } }) {
        name { firstName lastName }
        emails { primaryEmail }
        jobTitle
      }
    }`,
    { id: personId },
  );

  if (!data.person) return null;
  return {
    firstName: data.person.name?.firstName ?? '',
    lastName: data.person.name?.lastName ?? '',
    email: data.person.emails?.primaryEmail ?? '',
    jobTitle: data.person.jobTitle ?? '',
  };
};

// Twenty stores an unset TEXT field as '' rather than null, so clearing the
// email means writing the empty string back -- not omitting the key, which
// would leave the old address in place.
export const saveContactIdentity = async (
  personId: string,
  identity: ContactIdentity,
): Promise<void> => {
  await coreQuery(
    `mutation SaveContactIdentity($id: UUID!, $data: PersonUpdateInput!) {
      updatePerson(id: $id, data: $data) { id }
    }`,
    {
      id: personId,
      data: {
        name: {
          firstName: identity.firstName.trim(),
          lastName: identity.lastName.trim(),
        },
        emails: { primaryEmail: identity.email.trim() },
        jobTitle: identity.jobTitle.trim(),
      },
    },
  );
};
