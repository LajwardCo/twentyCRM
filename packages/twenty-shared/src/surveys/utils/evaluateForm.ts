import { type FormEvaluation } from '../types/FormEvaluation';
import {
  type FormAudience,
  type FormDefinition,
} from '../types/FormDefinition';
import { buildQuestionIndex } from './buildQuestionIndex';
import { type ConditionContext } from './evaluateCondition';
import { evaluateConditionGroup } from './evaluateConditionGroup';
import { isItemAvailableTo } from './isItemAvailableTo';

// Single source of truth for what a respondent sees. Used by the renderer on
// every change, by response validation (client and server), by printing of
// completed responses and by reporting (skipped vs unanswered).
export const evaluateForm = (
  definition: FormDefinition,
  answers: Record<string, unknown>,
  { audience }: { audience: FormAudience },
): FormEvaluation => {
  const questionsById = buildQuestionIndex(definition);
  const visibleIds = new Set<string>();
  const requiredIds = new Set<string>();
  const context: ConditionContext = { questionsById, answers, visibleIds };
  const pagePath: string[] = [];
  let endingId: string | null = null;
  let pageIndex = 0;

  while (pageIndex < definition.pages.length) {
    const page = definition.pages[pageIndex];

    pagePath.push(page.id);

    let sectionVisible = true;

    for (const item of page.items) {
      if (item.kind === 'section') {
        sectionVisible =
          item.visibleWhen === undefined ||
          evaluateConditionGroup(item.visibleWhen, context);

        if (sectionVisible) {
          visibleIds.add(item.id);
        }

        continue;
      }

      if (!sectionVisible || !isItemAvailableTo(item, audience)) {
        continue;
      }

      if (item.kind !== 'question') {
        visibleIds.add(item.id);

        continue;
      }

      const visible =
        item.visibleWhen === undefined ||
        evaluateConditionGroup(item.visibleWhen, context);

      if (!visible) {
        continue;
      }

      visibleIds.add(item.id);

      if (
        item.required ||
        (item.requiredWhen !== undefined &&
          evaluateConditionGroup(item.requiredWhen, context))
      ) {
        requiredIds.add(item.id);
      }
    }

    let nextIndex = pageIndex + 1;
    let ended = false;

    for (const jump of page.jumps) {
      if (!evaluateConditionGroup(jump.when, context)) {
        continue;
      }

      if ('endingId' in jump.to) {
        endingId = jump.to.endingId;
        ended = true;

        break;
      }

      const targetPageId = jump.to.pageId;
      const targetIndex = definition.pages.findIndex(
        (candidate) => candidate.id === targetPageId,
      );

      // Backward or broken jumps are ignored so navigation can never loop;
      // the publish validator reports them.
      if (targetIndex > pageIndex) {
        nextIndex = targetIndex;

        break;
      }
    }

    if (ended) {
      break;
    }

    pageIndex = nextIndex;
  }

  if (endingId === null) {
    const conditional = definition.endings.find(
      (ending) =>
        ending.when !== undefined &&
        ending.when.conditions.length > 0 &&
        evaluateConditionGroup(ending.when, context),
    );
    const fallback =
      definition.endings.find(
        (ending) =>
          ending.when === undefined || ending.when.conditions.length === 0,
      ) ?? definition.endings[0];

    endingId = (conditional ?? fallback)?.id ?? null;
  }

  const skippedByLogic: string[] = [];

  for (const question of questionsById.values()) {
    if (isItemAvailableTo(question, audience) && !visibleIds.has(question.id)) {
      skippedByLogic.push(question.id);
    }
  }

  return {
    pagePath,
    visibleItemIds: visibleIds,
    requiredQuestionIds: requiredIds,
    skippedByLogic,
    endingId,
  };
};
