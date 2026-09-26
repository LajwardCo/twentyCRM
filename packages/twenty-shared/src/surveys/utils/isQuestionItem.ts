import { type FormItem, type Question } from '../types/FormDefinition';

export const isQuestionItem = (item: FormItem): item is Question =>
  item.kind === 'question';
