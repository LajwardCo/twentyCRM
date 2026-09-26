import { type FormLanguage } from '../types/FormDefinition';
import { type SurveyPrintPhrases } from '../types/SurveyPrintPhrases';
import { SURVEY_PRINT_PHRASES_DARI } from './SURVEY_PRINT_PHRASES_DARI';
import { SURVEY_PRINT_PHRASES_ENGLISH } from './SURVEY_PRINT_PHRASES_ENGLISH';

// Pashto uses the Dari phrasing until reviewed Pashto copy exists; a wrong
// Pashto instruction on paper is worse than a correct Dari one.
export const SURVEY_PRINT_PHRASES: Record<FormLanguage, SurveyPrintPhrases> = {
  fa: SURVEY_PRINT_PHRASES_DARI,
  ps: SURVEY_PRINT_PHRASES_DARI,
  en: SURVEY_PRINT_PHRASES_ENGLISH,
};
