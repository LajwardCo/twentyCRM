import { CHOICE_QUESTION_TYPES } from '../constants/CHOICE_QUESTION_TYPES';
import { STAFF_ONLY_QUESTION_TYPES } from '../constants/STAFF_ONLY_QUESTION_TYPES';
import {
  type FormLanguage,
  type Question,
  type QuestionConfig,
  type QuestionType,
} from '../types/FormDefinition';
import { generateSurveyId } from './generateSurveyId';

const DEFAULT_ANSWER_LINES: Partial<Record<QuestionType, number>> = {
  long_text: 5,
  address: 3,
  location: 2,
  crm_contact: 2,
};

const defaultConfig = (
  type: QuestionType,
  language: FormLanguage,
): QuestionConfig => {
  if (CHOICE_QUESTION_TYPES.has(type)) {
    const label = (index: number) =>
      language === 'en' ? `Option ${index}` : `گزینهٔ ${index}`;

    return {
      choices: [1, 2].map((index) => ({
        id: generateSurveyId('c'),
        label: { [language]: label(index) },
      })),
    };
  }

  switch (type) {
    case 'rating':
      return { scaleMax: 5 };
    case 'opinion_scale':
      return { scaleMin: 0, scaleMax: 10 };
    case 'file':
      return { fileTypes: ['image', 'pdf'], maxFileMb: 10, maxFiles: 1 };
    default:
      return {};
  }
};

export const createQuestion = (
  type: QuestionType,
  language: FormLanguage,
  label = '',
): Question => ({
  kind: 'question',
  id: generateSurveyId('q'),
  type,
  label: { [language]: label },
  required: false,
  audience: STAFF_ONLY_QUESTION_TYPES.has(type) ? 'STAFF_ONLY' : 'ALL',
  config: defaultConfig(type, language),
  print: { answerLines: DEFAULT_ANSWER_LINES[type] ?? 1 },
});
