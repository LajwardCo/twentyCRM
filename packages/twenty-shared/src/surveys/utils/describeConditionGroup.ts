import { SURVEY_PRINT_PHRASES } from '../constants/SURVEY_PRINT_PHRASES';
import {
  type Condition,
  type ConditionGroup,
  type FormDefinition,
  type FormLanguage,
  type Question,
} from '../types/FormDefinition';
import { buildQuestionIndex } from './buildQuestionIndex';
import { formatSurveyNumber } from './formatSurveyNumber';
import { pickLocalizedText } from './pickLocalizedText';

const describeValue = (
  question: Question | undefined,
  condition: Condition,
  definition: FormDefinition,
  language: FormLanguage,
): string => {
  const phrases = SURVEY_PRINT_PHRASES[language];

  if (question === undefined) {
    return String(condition.value ?? '');
  }

  if (question.type === 'yes_no' || question.type === 'consent') {
    return condition.value === true || condition.value === 'true'
      ? phrases.yes
      : phrases.no;
  }

  const choice = (question.config.choices ?? []).find(
    (candidate) => candidate.id === condition.value,
  );

  if (choice !== undefined) {
    return pickLocalizedText(choice.label, language, definition.languages);
  }

  if (condition.value === '__other') {
    return (
      pickLocalizedText(
        question.config.otherLabel,
        language,
        definition.languages,
      ) || (language === 'en' ? 'Other' : 'سایر')
    );
  }

  return formatSurveyNumber(String(condition.value ?? ''), language);
};

// Human sentence for a condition group, e.g. "پاسخ سؤال ۴ «بلی» است".
// `numbering` maps question ids to their printed numbers; questions without a
// number are referred to by their label.
export const describeConditionGroup = (
  group: ConditionGroup,
  definition: FormDefinition,
  language: FormLanguage,
  numbering: Record<string, number>,
): string => {
  const phrases = SURVEY_PRINT_PHRASES[language];
  const questionsById = buildQuestionIndex(definition);

  const parts = group.conditions.map((condition) => {
    const question = questionsById.get(condition.questionId);
    const number = numbering[condition.questionId];
    const reference =
      number !== undefined
        ? phrases.question(formatSurveyNumber(number, language))
        : `«${pickLocalizedText(question?.label, language, definition.languages)}»`;
    const value = describeValue(question, condition, definition, language);

    switch (condition.op) {
      case 'answered':
        return phrases.answered(reference);
      case 'not_answered':
        return phrases.notAnswered(reference);
      case 'eq':
        return phrases.equals(reference, value);
      case 'neq':
        return phrases.notEquals(reference, value);
      case 'includes':
        return phrases.includes(reference, value);
      case 'excludes':
        return phrases.excludes(reference, value);
      case 'gt':
        return phrases.greaterThan(reference, value);
      case 'gte':
        return phrases.atLeast(reference, value);
      case 'lt':
        return phrases.lessThan(reference, value);
      case 'lte':
        return phrases.atMost(reference, value);
    }
  });

  return parts.join(group.mode === 'ALL' ? phrases.and : phrases.or);
};
