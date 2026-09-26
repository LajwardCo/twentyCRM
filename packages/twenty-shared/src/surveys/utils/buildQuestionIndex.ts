import { type FormDefinition, type Question } from '../types/FormDefinition';

export const buildQuestionIndex = (
  definition: FormDefinition,
): Map<string, Question> => {
  const index = new Map<string, Question>();

  for (const page of definition.pages) {
    for (const item of page.items) {
      if (item.kind === 'question') {
        index.set(item.id, item);
      }
    }
  }

  return index;
};
