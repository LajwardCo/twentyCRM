import { type FormItem } from '../types/FormDefinition';
import { generateSurveyId } from './generateSurveyId';

// A copy is a new question: new id and new choice ids, so its answers are
// never confused with the original's. Rules are not copied — they would
// silently duplicate behaviour.
export const duplicateFormItem = (item: FormItem): FormItem => {
  const copy = JSON.parse(JSON.stringify(item)) as FormItem;

  if (copy.kind === 'question') {
    return {
      ...copy,
      id: generateSurveyId('q'),
      visibleWhen: undefined,
      requiredWhen: undefined,
      config: {
        ...copy.config,
        choices: copy.config.choices?.map((choice) => ({
          ...choice,
          id: generateSurveyId('c'),
        })),
      },
    };
  }

  if (copy.kind === 'section') {
    return { ...copy, id: generateSurveyId('s'), visibleWhen: undefined };
  }

  return { ...copy, id: generateSurveyId('b') };
};
