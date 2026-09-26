import { type CrmProposal } from '@shared/surveys';

// Selection rules for the "apply proposed changes" table. Review-first: only
// FILL rows start selected; a CONFLICT needs an explicit per-row decision; a
// blank answer (SKIP_BLANK) can never be applied, so a CRM value is never
// cleared; SAME rows have nothing to do and are hidden.

export type DiffSelection = Record<string, boolean>;

export const visibleDiffRows = (proposals: CrmProposal[]): CrmProposal[] =>
  proposals.filter((proposal) => proposal.action !== 'SAME');

export const isSelectable = (proposal: CrmProposal): boolean =>
  proposal.action === 'FILL' || proposal.action === 'CONFLICT';

export const initialDiffSelection = (proposals: CrmProposal[]): DiffSelection =>
  Object.fromEntries(proposals.map((proposal) => [proposal.ruleId, proposal.action === 'FILL']));

const isBlank = (value: string | number | null): boolean =>
  value === null || String(value).trim() === '';

// Re-checks the rules on the way out, so a tampered or stale selection can
// still never apply a SKIP_BLANK/SAME row or a blank value.
export const selectedChanges = (
  proposals: CrmProposal[],
  selection: DiffSelection,
): CrmProposal[] =>
  proposals.filter(
    (proposal) =>
      isSelectable(proposal) && selection[proposal.ruleId] === true && !isBlank(proposal.proposed),
  );

export type CompanyPatch = Partial<{
  name: string;
  employees: number;
  domainName: { primaryLinkUrl: string };
  address: { addressStreet1: string };
  businessType: string;
}>;

export type PersonPatch = Partial<{
  name: { firstName: string; lastName: string };
  phones: { primaryPhoneNumber: string; primaryPhoneCallingCode: string };
  emails: { primaryEmail: string };
  jobTitle: string;
}>;

export type OpportunityPatch = Partial<{ name: string }>;

export type CrmPatches = {
  company: CompanyPatch;
  person: PersonPatch;
  opportunity: OpportunityPatch;
  // Interest and follow-up never overwrite anything: they become a note and a
  // task on the lead.
  interestNotes: string[];
  followUps: string[];
};

export type PhoneNormalizer = (
  raw: string,
) => { primaryPhoneCallingCode: string; primaryPhoneNumber: string } | null;

export const splitPersonName = (full: string): { firstName: string; lastName: string } => {
  const words = full.trim().split(/\s+/).filter((word) => word !== '');

  return { firstName: words[0] ?? '', lastName: words.slice(1).join(' ') };
};

const withHttps = (url: string): string =>
  /^https?:\/\//i.test(url) ? url : `https://${url}`;

export const buildCrmPatches = (
  changes: CrmProposal[],
  normalizePhone: PhoneNormalizer,
): CrmPatches => {
  const patches: CrmPatches = {
    company: {},
    person: {},
    opportunity: {},
    interestNotes: [],
    followUps: [],
  };

  for (const change of changes) {
    const text = String(change.proposed ?? '').trim();

    switch (change.field) {
      case 'company.name':
        patches.company.name = text;
        break;
      case 'company.employees': {
        const employees = Number(text.replace(/[^\d.]/g, ''));

        if (Number.isFinite(employees) && text !== '') patches.company.employees = Math.round(employees);
        break;
      }
      case 'company.domainName':
        patches.company.domainName = { primaryLinkUrl: withHttps(text) };
        break;
      case 'company.address':
        patches.company.address = { addressStreet1: text };
        break;
      case 'company.businessType':
        patches.company.businessType = text;
        break;
      case 'person.name':
        patches.person.name = splitPersonName(text);
        break;
      case 'person.phone':
        patches.person.phones = normalizePhone(text) ?? {
          primaryPhoneNumber: text,
          primaryPhoneCallingCode: '',
        };
        break;
      case 'person.email':
        patches.person.emails = { primaryEmail: text };
        break;
      case 'person.jobTitle':
        patches.person.jobTitle = text;
        break;
      case 'opportunity.name':
        patches.opportunity.name = text;
        break;
      case 'opportunity.interest':
        patches.interestNotes.push(text);
        break;
      case 'opportunity.followUp':
        patches.followUps.push(text);
        break;
    }
  }

  return patches;
};

export const isEmptyPatch = (patch: Record<string, unknown>): boolean =>
  Object.keys(patch).length === 0;
