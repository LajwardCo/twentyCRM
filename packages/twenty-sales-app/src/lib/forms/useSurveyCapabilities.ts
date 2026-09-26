import {
  NO_SURVEY_CAPABILITIES,
  type SurveyCapabilities,
  fetchSurveyCapabilities,
} from '../../api/surveys';
import { useCached } from '../cache';

// What the signed-in user may do with surveys, decided by the server from
// their role. Screens hide what is not allowed; the server refuses it anyway.
export const useSurveyCapabilities = (): {
  capabilities: SurveyCapabilities;
  loading: boolean;
} => {
  const { data } = useCached('survey-capabilities', fetchSurveyCapabilities);

  return { capabilities: data ?? NO_SURVEY_CAPABILITIES, loading: data === null };
};
