import { type AnswerValue } from '../types/FormAnswers';
import {
  type FormAudience,
  type FormDefinition,
} from '../types/FormDefinition';
import {
  type ResponseValidation,
  type ResponseValidationError,
  type ResponseValidationMode,
} from '../types/ResponseValidation';
import { buildQuestionIndex } from './buildQuestionIndex';
import { evaluateForm } from './evaluateForm';
import { isAnswerPresent } from './isAnswerPresent';
import { isItemAvailableTo } from './isItemAvailableTo';
import { normalizeAnswer } from './normalizeAnswer';
import { validateAnswerValue } from './validateAnswerValue';

// The one validation routine for every channel (public, staff, paper) on
// both client and server. Hidden answers are stripped here — never stored,
// mapped to CRM, exported or counted — and listed in skippedByLogic.
export const validateResponse = (
  definition: FormDefinition,
  rawAnswers: Record<string, unknown>,
  { audience, mode }: { audience: FormAudience; mode: ResponseValidationMode },
): ResponseValidation => {
  const questionsById = buildQuestionIndex(definition);
  const normalized: Record<string, AnswerValue> = {};
  const errors: ResponseValidationError[] = [];

  for (const [questionId, raw] of Object.entries(rawAnswers ?? {})) {
    const question = questionsById.get(questionId);

    // Unknown ids and questions this audience cannot see are dropped silently.
    if (question === undefined || !isItemAvailableTo(question, audience)) {
      continue;
    }

    const result = normalizeAnswer(question, raw);

    if ('error' in result) {
      errors.push({ questionId, code: result.error });

      continue;
    }

    if (result.value !== undefined && isAnswerPresent(question, result.value)) {
      normalized[questionId] = result.value;
    }
  }

  const evaluation = evaluateForm(definition, normalized, { audience });
  const cleanAnswers: Record<string, AnswerValue> = {};

  for (const [questionId, value] of Object.entries(normalized)) {
    if (!evaluation.visibleItemIds.has(questionId)) {
      continue;
    }

    const question = questionsById.get(questionId);

    if (question === undefined) {
      continue;
    }

    const code = validateAnswerValue(question, value);

    if (code !== null) {
      errors.push({ questionId, code });

      continue;
    }

    cleanAnswers[questionId] = value;
  }

  if (mode === 'COMPLETE') {
    for (const questionId of evaluation.requiredQuestionIds) {
      const hasError = errors.some((error) => error.questionId === questionId);

      if (!hasError && cleanAnswers[questionId] === undefined) {
        errors.push({ questionId, code: 'REQUIRED' });
      }
    }
  }

  // Errors on questions that ended up hidden are irrelevant to the respondent.
  const visibleErrors = errors.filter((error) =>
    evaluation.visibleItemIds.has(error.questionId),
  );

  return {
    cleanAnswers,
    skippedByLogic: evaluation.skippedByLogic,
    errors: visibleErrors,
    endingId: evaluation.endingId,
  };
};
