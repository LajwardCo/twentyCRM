import { type VisitOutcome } from '../../../api/surveys';

// The field visit in progress, kept on the device between steps (the answers
// themselves live in the collector's own draft). `visitId` is remembered as
// soon as the visit task exists, so a retried save never creates a second
// visit.

export type VisitStep = 'business' | 'survey' | 'outcome' | 'collect' | 'done';

export type VisitRecordRef = { id: string; label: string };

export type VisitState = {
  step: VisitStep;
  company: VisitRecordRef | null;
  person: VisitRecordRef | null;
  // null = not chosen yet; 'none' = visit without a survey.
  formId: string | 'none' | null;
  campaignId: string | null;
  outcome: VisitOutcome | null;
  notes: string;
  visitId: string | null;
  responseId: string | null;
};

export const EMPTY_VISIT: VisitState = {
  step: 'business',
  company: null,
  person: null,
  formId: null,
  campaignId: null,
  outcome: null,
  notes: '',
  visitId: null,
  responseId: null,
};

const STEPS: VisitStep[] = ['business', 'survey', 'outcome', 'collect', 'done'];
const OUTCOMES: VisitOutcome[] = [
  'COMPLETED',
  'BUSINESS_CLOSED',
  'MANAGER_UNAVAILABLE',
  'DECLINED',
  'REVISIT_NEEDED',
];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const recordRef = (value: unknown): VisitRecordRef | null =>
  isObject(value) && typeof value.id === 'string' && typeof value.label === 'string'
    ? { id: value.id, label: value.label }
    : null;

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export const parseVisitState = (raw: string | null): VisitState | null => {
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!isObject(parsed)) return null;

    const state: VisitState = {
      step: STEPS.find((step) => step === parsed.step) ?? 'business',
      company: recordRef(parsed.company),
      person: recordRef(parsed.person),
      formId: text(parsed.formId),
      campaignId: text(parsed.campaignId),
      outcome: OUTCOMES.find((outcome) => outcome === parsed.outcome) ?? null,
      notes: text(parsed.notes) ?? '',
      visitId: text(parsed.visitId),
      responseId: text(parsed.responseId),
    };

    // A finished visit is not resumed; neither is one that lost its business.
    if (state.step === 'done' || (state.company === null && state.step !== 'business')) {
      return null;
    }

    return state;
  } catch {
    return null;
  }
};

export const visitStepIndex = (step: VisitStep): number => STEPS.indexOf(step);
