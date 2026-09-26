import { type QuestionType } from '../types/FormDefinition';

export const CHOICE_QUESTION_TYPES: ReadonlySet<QuestionType> = new Set([
  'single_choice',
  'multi_choice',
  'dropdown',
]);
