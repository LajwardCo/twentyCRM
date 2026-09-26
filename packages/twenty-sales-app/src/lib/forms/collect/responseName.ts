import { type AnswerValue, type FormDefinition, answerToText, buildQuestionIndex } from '@shared/surveys';

const NAME_FIELDS = ['company.name', 'person.name', 'opportunity.name'];

// Staff responses are named on the client (the public endpoint names its own
// the same way): the business or person the form maps a name to, else the
// linked business, else the given fallback. The name is what lists search.
export const staffResponseName = (
  definition: FormDefinition,
  answers: Record<string, unknown>,
  { companyLabel, fallback }: { companyLabel?: string | null; fallback: string },
): string => {
  const questionsById = buildQuestionIndex(definition);

  for (const field of NAME_FIELDS) {
    const rule = definition.crmMapping.find((candidate) => candidate.field === field);
    const question = rule === undefined ? undefined : questionsById.get(rule.questionId);

    if (rule === undefined || question === undefined) continue;

    const text = answerToText(question, answers[rule.questionId] as AnswerValue | undefined, definition).trim();

    if (text !== '') return text.slice(0, 200);
  }

  const company = (companyLabel ?? '').trim();

  return (company !== '' ? company : fallback).slice(0, 200);
};
