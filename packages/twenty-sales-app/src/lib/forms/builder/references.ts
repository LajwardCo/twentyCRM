import { type ConditionGroup, type FormDefinition } from '@shared/surveys';

// Where a question or page is used by a rule — shown before deleting it so
// nobody breaks the form's logic without noticing.

export type RuleReferenceKind =
  | 'visibleWhen'
  | 'requiredWhen'
  | 'jump'
  | 'ending'
  | 'mapping'
  | 'automation';

export type RuleReference = {
  kind: RuleReferenceKind;
  // Item owning the rule (visibleWhen / requiredWhen).
  itemId?: string;
  // Page owning the jump.
  pageId?: string;
  pageIndex?: number;
  ruleId?: string;
};

const uses = (group: ConditionGroup | undefined, questionId: string): boolean =>
  group?.conditions.some((condition) => condition.questionId === questionId) ?? false;

export const findQuestionReferences = (
  definition: FormDefinition,
  questionId: string,
): RuleReference[] => {
  const references: RuleReference[] = [];

  definition.pages.forEach((page, pageIndex) => {
    for (const item of page.items) {
      if (item.id === questionId) continue;

      if ((item.kind === 'question' || item.kind === 'section') && uses(item.visibleWhen, questionId)) {
        references.push({ kind: 'visibleWhen', itemId: item.id, pageId: page.id, pageIndex });
      }

      if (item.kind === 'question' && uses(item.requiredWhen, questionId)) {
        references.push({ kind: 'requiredWhen', itemId: item.id, pageId: page.id, pageIndex });
      }
    }

    for (const jump of page.jumps) {
      if (uses(jump.when, questionId)) {
        references.push({ kind: 'jump', pageId: page.id, pageIndex, ruleId: jump.id });
      }
    }
  });

  for (const ending of definition.endings) {
    if (uses(ending.when, questionId)) {
      references.push({ kind: 'ending', ruleId: ending.id });
    }
  }

  for (const rule of definition.crmMapping) {
    if (rule.questionId === questionId) {
      references.push({ kind: 'mapping', ruleId: rule.id });
    }
  }

  for (const automation of definition.automations) {
    if (uses(automation.when, questionId)) {
      references.push({ kind: 'automation', ruleId: automation.id });
    }
  }

  return references;
};

// Every question on the page, plus the page itself as a jump target.
export const findPageReferences = (
  definition: FormDefinition,
  pageId: string,
): { incomingJumps: RuleReference[]; questionReferences: RuleReference[] } => {
  const page = definition.pages.find((candidate) => candidate.id === pageId);

  if (page === undefined) return { incomingJumps: [], questionReferences: [] };

  const incomingJumps: RuleReference[] = [];

  definition.pages.forEach((candidate, pageIndex) => {
    if (candidate.id === pageId) return;

    for (const jump of candidate.jumps) {
      if ('pageId' in jump.to && jump.to.pageId === pageId) {
        incomingJumps.push({ kind: 'jump', pageId: candidate.id, pageIndex, ruleId: jump.id });
      }
    }
  });

  const onPage = new Set(page.items.map((item) => item.id));
  const questionReferences = page.items
    .filter((item) => item.kind === 'question')
    .flatMap((item) => findQuestionReferences(definition, item.id))
    // Rules that live on the same page disappear with it.
    .filter((reference) => reference.pageId !== pageId && !onPage.has(reference.itemId ?? ''));

  return { incomingJumps, questionReferences };
};

// Choice ids of `questionId` that some condition compares against.
export const referencedChoiceIds = (
  definition: FormDefinition,
  questionId: string,
): Set<string> => {
  const groups: (ConditionGroup | undefined)[] = [
    ...definition.pages.flatMap((page) => [
      ...page.items.flatMap((item) =>
        item.kind === 'question'
          ? [item.visibleWhen, item.requiredWhen]
          : item.kind === 'section'
            ? [item.visibleWhen]
            : [],
      ),
      ...page.jumps.map((jump) => jump.when),
    ]),
    ...definition.endings.map((ending) => ending.when),
    ...definition.automations.map((automation) => automation.when),
  ];
  const ids = new Set<string>();

  for (const group of groups) {
    for (const condition of group?.conditions ?? []) {
      if (condition.questionId === questionId && typeof condition.value === 'string') {
        ids.add(condition.value);
      }
    }
  }

  return ids;
};
