import {
  type FormAudience,
  type FormDefinition,
  type FormEvaluation,
  type FormItem,
  type ResponseValidationError,
  evaluateForm,
  validateResponse,
} from '@shared/surveys';

export type RendererStep = {
  // Stable across re-evaluation: the page id, or the question id when the
  // form shows one question at a time.
  key: string;
  pageId: string;
  items: FormItem[];
};

// Splits the respondent's current path into screens. Display blocks and
// section headers travel with the question that follows them.
export const buildSteps = (
  definition: FormDefinition,
  evaluation: FormEvaluation,
): RendererStep[] => {
  const steps: RendererStep[] = [];

  for (const pageId of evaluation.pagePath) {
    const page = definition.pages.find((candidate) => candidate.id === pageId);

    if (page === undefined) continue;

    const visible = page.items.filter((item) =>
      evaluation.visibleItemIds.has(item.id),
    );

    if (definition.presentation !== 'ONE_QUESTION') {
      if (visible.length > 0) {
        steps.push({ key: page.id, pageId: page.id, items: visible });
      }

      continue;
    }

    let pending: FormItem[] = [];

    for (const item of visible) {
      pending.push(item);

      if (item.kind === 'question') {
        steps.push({ key: item.id, pageId: page.id, items: pending });
        pending = [];
      }
    }

    if (pending.length > 0) {
      const last = steps[steps.length - 1];

      if (last !== undefined && last.pageId === page.id) {
        last.items.push(...pending);
      } else {
        steps.push({ key: `${page.id}:tail`, pageId: page.id, items: pending });
      }
    }
  }

  return steps;
};

// Where to be after the path changed: stay on the same step if it still
// exists, otherwise the nearest step that existed before it.
export const resolveStepIndex = (
  steps: RendererStep[],
  currentKey: string | null,
  previousKeys: string[],
): number => {
  if (steps.length === 0) return 0;
  if (currentKey === null) return 0;

  const direct = steps.findIndex((step) => step.key === currentKey);

  if (direct >= 0) return direct;

  const previousIndex = previousKeys.indexOf(currentKey);

  for (let index = previousIndex - 1; index >= 0; index -= 1) {
    const found = steps.findIndex((step) => step.key === previousKeys[index]);

    if (found >= 0) return found;
  }

  return 0;
};

// Validation for the questions on one screen only, using the same engine
// call as the final submit so the two can never disagree.
export const validateStep = (
  definition: FormDefinition,
  answers: Record<string, unknown>,
  audience: FormAudience,
  step: RendererStep,
): ResponseValidationError[] => {
  const questionIds = new Set(
    step.items.filter((item) => item.kind === 'question').map((item) => item.id),
  );

  return validateResponse(definition, answers, {
    audience,
    mode: 'COMPLETE',
  }).errors.filter((error) => questionIds.has(error.questionId));
};

export const evaluateAndBuildSteps = (
  definition: FormDefinition,
  answers: Record<string, unknown>,
  audience: FormAudience,
) => {
  const evaluation = evaluateForm(definition, answers, { audience });

  return { evaluation, steps: buildSteps(definition, evaluation) };
};
