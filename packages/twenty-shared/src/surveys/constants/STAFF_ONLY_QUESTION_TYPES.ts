import { type QuestionType } from '../types/FormDefinition';

// CRM pickers search internal directories, so they can never be public.
export const STAFF_ONLY_QUESTION_TYPES: ReadonlySet<QuestionType> = new Set([
  'crm_company',
  'crm_contact',
  'crm_lead',
]);
