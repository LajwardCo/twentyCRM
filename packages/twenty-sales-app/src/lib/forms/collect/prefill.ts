import { type CrmRecordAnswer, type FormDefinition, type QuestionType } from '@shared/surveys';

// Links a staff collection starts with (from a lead/company page, a visit or
// a campaign) and how they prefill the form's CRM picker questions.

export type CollectLinks = {
  companyId: string | null;
  personId: string | null;
  opportunityId: string | null;
  campaignId: string | null;
  visitId: string | null;
};

export const NO_LINKS: CollectLinks = {
  companyId: null,
  personId: null,
  opportunityId: null,
  campaignId: null,
  visitId: null,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ids arrive in the URL, so anything that is not a UUID is ignored rather
// than sent to the API.
export const parseCollectLinks = (query: string): CollectLinks => {
  const params = new URLSearchParams(query);
  const id = (name: string): string | null => {
    const value = params.get(name);

    return value !== null && UUID.test(value) ? value : null;
  };

  return {
    companyId: id('companyId'),
    personId: id('personId'),
    opportunityId: id('opportunityId'),
    campaignId: id('campaignId'),
    visitId: id('visitId'),
  };
};

export type LinkLabels = {
  company?: CrmRecordAnswer;
  person?: CrmRecordAnswer;
  opportunity?: CrmRecordAnswer;
};

const RECORD_FOR_TYPE: Partial<Record<QuestionType, keyof LinkLabels>> = {
  crm_company: 'company',
  crm_contact: 'person',
  crm_lead: 'opportunity',
};

// Fills empty CRM picker questions with the records the collection started
// from. Never overwrites what the collector already chose.
export const applyCrmPrefill = (
  definition: FormDefinition,
  answers: Record<string, unknown>,
  labels: LinkLabels,
): Record<string, unknown> => {
  const next = { ...answers };

  for (const page of definition.pages) {
    for (const item of page.items) {
      if (item.kind !== 'question') continue;

      const record = RECORD_FOR_TYPE[item.type];
      const value = record === undefined ? undefined : labels[record];

      if (value !== undefined && next[item.id] === undefined) {
        next[item.id] = value;
      }
    }
  }

  return next;
};

const firstAnswerOf = (
  definition: FormDefinition,
  answers: Record<string, unknown>,
  type: QuestionType,
): string | null => {
  for (const page of definition.pages) {
    for (const item of page.items) {
      if (item.kind !== 'question' || item.type !== type) continue;

      const value = answers[item.id] as CrmRecordAnswer | undefined;

      if (value !== undefined && typeof value?.recordId === 'string' && value.recordId !== '') {
        return value.recordId;
      }
    }
  }

  return null;
};

// Record links for the saved response: links the collection started from win;
// otherwise the record the collector explicitly picked in a CRM question.
export const resolveResponseLinks = (
  definition: FormDefinition,
  answers: Record<string, unknown>,
  links: CollectLinks,
): Pick<CollectLinks, 'companyId' | 'personId' | 'opportunityId'> => ({
  companyId: links.companyId ?? firstAnswerOf(definition, answers, 'crm_company'),
  personId: links.personId ?? firstAnswerOf(definition, answers, 'crm_contact'),
  opportunityId: links.opportunityId ?? firstAnswerOf(definition, answers, 'crm_lead'),
});
