import {
  type AnswerValue,
  type MultiChoiceAnswer,
  type SingleChoiceAnswer,
} from '../types/FormAnswers';
import { type Condition, type Question } from '../types/FormDefinition';
import { isAnswerPresent } from './isAnswerPresent';
import { normalizeAnswer } from './normalizeAnswer';

export type ConditionContext = {
  questionsById: Map<string, Question>;
  answers: Record<string, unknown>;
  // Only answers of visible questions count; anything else (hidden, on a
  // skipped page, unknown to this audience) evaluates as unanswered.
  visibleIds: Set<string>;
};

const readAnswer = (
  question: Question | undefined,
  context: ConditionContext,
): AnswerValue | undefined => {
  if (question === undefined || !context.visibleIds.has(question.id)) {
    return undefined;
  }

  const normalized = normalizeAnswer(question, context.answers[question.id]);

  if ('error' in normalized || !isAnswerPresent(question, normalized.value)) {
    return undefined;
  }

  return normalized.value;
};

const selectedChoiceIds = (
  question: Question,
  value: AnswerValue,
): string[] => {
  if (question.type === 'multi_choice') {
    return (value as MultiChoiceAnswer).choiceIds;
  }

  const choiceId = (value as SingleChoiceAnswer).choiceId;

  return choiceId === undefined ? [] : [choiceId];
};

const toBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return undefined;
};

const isEqual = (
  question: Question,
  value: AnswerValue,
  expected: Condition['value'],
): boolean => {
  switch (question.type) {
    case 'single_choice':
    case 'dropdown':
    case 'multi_choice':
      return selectedChoiceIds(question, value).includes(String(expected));
    case 'yes_no':
    case 'consent':
      return value === toBoolean(expected);
    case 'number':
    case 'rating':
    case 'opinion_scale':
      return value === Number(expected);
    default:
      return (
        typeof value === 'string' &&
        value.trim().toLowerCase() ===
          String(expected ?? '')
            .trim()
            .toLowerCase()
      );
  }
};

// Negative operators (neq, excludes, not_answered) are true when the question
// is unanswered: "show when the answer is not X" shows until X is picked.
export const evaluateCondition = (
  condition: Condition,
  context: ConditionContext,
): boolean => {
  const question = context.questionsById.get(condition.questionId);
  const value = readAnswer(question, context);
  const present = value !== undefined;

  switch (condition.op) {
    case 'answered':
      return present;
    case 'not_answered':
      return !present;
    case 'eq':
    case 'includes':
      return present && isEqual(question as Question, value, condition.value);
    case 'neq':
    case 'excludes':
      return !present || !isEqual(question as Question, value, condition.value);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (!present || typeof value !== 'number') {
        return false;
      }

      const expected = Number(condition.value);

      if (!Number.isFinite(expected)) {
        return false;
      }

      if (condition.op === 'gt') return value > expected;
      if (condition.op === 'gte') return value >= expected;
      if (condition.op === 'lt') return value < expected;

      return value <= expected;
    }
  }
};
