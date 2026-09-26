import {
  type AnswerValue,
  answerToText,
  buildQuestionIndex,
  type FormDefinition,
} from 'twenty-shared/surveys';

const NAME_FIELDS = ['company.name', 'person.name', 'opportunity.name'];

// Record label shown in lists and the CRM: the business or person the
// response is about when the form maps one, otherwise the fallback.
export const deriveSurveyResponseName = (
  definition: FormDefinition,
  cleanAnswers: Record<string, AnswerValue>,
  fallback: string,
): string => {
  const questionsById = buildQuestionIndex(definition);

  for (const field of NAME_FIELDS) {
    const rule = definition.crmMapping.find(
      (candidate) => candidate.field === field,
    );
    const question =
      rule === undefined ? undefined : questionsById.get(rule.questionId);

    if (question === undefined || rule === undefined) {
      continue;
    }

    const text = answerToText(
      question,
      cleanAnswers[rule.questionId],
      definition,
    ).trim();

    if (text !== '') {
      return text.slice(0, 200);
    }
  }

  return fallback;
};
