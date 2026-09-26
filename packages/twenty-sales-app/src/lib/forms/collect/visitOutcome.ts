import { type VisitOutcome } from '../../../api/surveys';

// A visit's outcome says what happened at the door; buying interest lives on
// the response and is recorded separately. "Survey completed" is only a valid
// outcome when a survey is actually being collected — an unsuccessful visit is
// recorded as a visit alone, never with a fabricated response.

export const UNSUCCESSFUL_OUTCOMES: VisitOutcome[] = [
  'BUSINESS_CLOSED',
  'MANAGER_UNAVAILABLE',
  'DECLINED',
  'REVISIT_NEEDED',
];

export const availableVisitOutcomes = (surveyChosen: boolean): VisitOutcome[] =>
  surveyChosen ? ['COMPLETED', ...UNSUCCESSFUL_OUTCOMES] : UNSUCCESSFUL_OUTCOMES;

export const outcomeCollectsSurvey = (
  outcome: VisitOutcome | null,
  surveyChosen: boolean,
): boolean => surveyChosen && outcome === 'COMPLETED';

// Drops an outcome that is no longer valid (the survey was deselected).
export const reconcileOutcome = (
  outcome: VisitOutcome | null,
  surveyChosen: boolean,
): VisitOutcome | null =>
  outcome !== null && availableVisitOutcomes(surveyChosen).includes(outcome)
    ? outcome
    : null;

export const visitTaskTitle = (companyName: string): string =>
  `بازدید: ${companyName.trim() === '' ? 'کسب‌وکار' : companyName.trim()}`;
