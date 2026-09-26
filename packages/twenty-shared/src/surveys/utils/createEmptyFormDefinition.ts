import {
  type FormDefinition,
  type FormLanguage,
} from '../types/FormDefinition';
import { generateSurveyId } from './generateSurveyId';

export const createEmptyFormDefinition = (
  language: FormLanguage = 'fa',
): FormDefinition => ({
  schemaVersion: 1,
  languages: [language],
  presentation: 'ALL_ON_PAGE',
  welcome: { enabled: false, title: {}, body: {} },
  pages: [
    {
      id: generateSurveyId('p'),
      title: {},
      items: [],
      jumps: [],
    },
  ],
  endings: [
    {
      id: generateSurveyId('e'),
      title: { [language]: language === 'en' ? 'Thank you!' : 'سپاس از شما!' },
      message: {
        [language]:
          language === 'en'
            ? 'Your answers have been recorded.'
            : 'پاسخ‌های شما ثبت شد.',
      },
    },
  ],
  appearance: {
    accent: '#1f3a8a',
    showProgress: true,
    showQuestionNumbers: true,
  },
  print: { instructions: {} },
  crmMapping: [],
  automations: [],
});
