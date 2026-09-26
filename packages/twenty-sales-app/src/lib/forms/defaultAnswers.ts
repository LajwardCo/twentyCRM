import { CHOICE_QUESTION_TYPES, type FormDefinition } from '@shared/surveys';

// Answers a fresh form starts with, from each question's configured default,
// in the shape the renderer and engine expect. Invalid defaults (a choice
// that no longer exists) are skipped rather than pre-filled.
export const defaultAnswers = (
  definition: FormDefinition,
): Record<string, unknown> => {
  const answers: Record<string, unknown> = {};

  for (const page of definition.pages) {
    for (const item of page.items) {
      if (item.kind !== 'question') continue;

      const value = item.config.defaultValue;

      if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
        continue;
      }

      if (CHOICE_QUESTION_TYPES.has(item.type)) {
        const known = new Set((item.config.choices ?? []).map((choice) => choice.id));
        const ids = (Array.isArray(value) ? value : [String(value)]).filter((id) => known.has(id));

        if (ids.length === 0) continue;

        answers[item.id] =
          item.type === 'multi_choice' ? { choiceIds: ids } : { choiceId: ids[0] };
        continue;
      }

      answers[item.id] = value;
    }
  }

  return answers;
};
