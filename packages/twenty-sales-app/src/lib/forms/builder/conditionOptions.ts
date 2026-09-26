import {
  CHOICE_QUESTION_TYPES,
  type Condition,
  type ConditionGroup,
  type ConditionOperator,
  type FormDefinition,
  type FormEnding,
  type FormPage,
  type ListedQuestion,
  type Question,
  OTHER_CHOICE_ID,
  isOperatorCompatible,
  listFormQuestions,
} from '@shared/surveys';

// What a condition row may offer. Logic is forward-only (spec D6): a rule may
// only look at questions the respondent has already seen, so the pickers
// never list a later question in the first place.

export const CONDITION_OPERATORS: ConditionOperator[] = [
  'eq',
  'neq',
  'includes',
  'excludes',
  'gt',
  'gte',
  'lt',
  'lte',
  'answered',
  'not_answered',
];

export const operatorsFor = (question: Question): ConditionOperator[] =>
  CONDITION_OPERATORS.filter((operator) => isOperatorCompatible(operator, question.type));

export const operatorNeedsValue = (operator: ConditionOperator): boolean =>
  operator !== 'answered' && operator !== 'not_answered';

export type ConditionValueKind = 'choice' | 'boolean' | 'number' | 'text';

export const conditionValueKind = (question: Question): ConditionValueKind => {
  if (CHOICE_QUESTION_TYPES.has(question.type)) return 'choice';
  if (question.type === 'yes_no' || question.type === 'consent') return 'boolean';
  if (['number', 'rating', 'opinion_scale'].includes(question.type)) return 'number';

  return 'text';
};

// Choice ids a condition may compare against, including the free-text
// "other" option when the question offers one.
export const conditionChoiceIds = (question: Question): string[] => [
  ...(question.config.choices ?? []).map((choice) => choice.id),
  ...(question.config.allowOther === true ? [OTHER_CHOICE_ID] : []),
];

const defaultValueFor = (
  question: Question,
): Condition['value'] => {
  switch (conditionValueKind(question)) {
    case 'choice':
      return conditionChoiceIds(question)[0];
    case 'boolean':
      return true;
    case 'number':
      return question.type === 'opinion_scale'
        ? (question.config.scaleMin ?? 0)
        : question.type === 'rating'
          ? 1
          : 0;
    case 'text':
      return '';
  }
};

export const defaultConditionFor = (question: Question): Condition => {
  const operator = operatorsFor(question)[0] ?? 'answered';

  return operatorNeedsValue(operator)
    ? { questionId: question.id, op: operator, value: defaultValueFor(question) }
    : { questionId: question.id, op: operator };
};

// Keeps as much of a condition as still makes sense after its question or
// operator changed.
export const normalizeCondition = (
  condition: Condition,
  question: Question,
): Condition => {
  const operators = operatorsFor(question);
  const op = operators.includes(condition.op) ? condition.op : (operators[0] ?? 'answered');

  if (!operatorNeedsValue(op)) {
    return { questionId: question.id, op };
  }

  const kind = conditionValueKind(question);
  const value = condition.value;
  const valid =
    (kind === 'choice' && typeof value === 'string' && conditionChoiceIds(question).includes(value)) ||
    (kind === 'boolean' && typeof value === 'boolean') ||
    (kind === 'number' && typeof value === 'number' && Number.isFinite(value)) ||
    (kind === 'text' && typeof value === 'string');

  return { questionId: question.id, op, value: valid ? value : defaultValueFor(question) };
};

const positionOf = (
  definition: FormDefinition,
  itemId: string,
): { pageIndex: number; itemIndex: number } | null => {
  for (const [pageIndex, page] of definition.pages.entries()) {
    const itemIndex = page.items.findIndex((item) => item.id === itemId);

    if (itemIndex >= 0) return { pageIndex, itemIndex };
  }

  return null;
};

// Questions a rule on `itemId` may reference: strictly before it.
export const questionsBeforeItem = (
  definition: FormDefinition,
  itemId: string,
): ListedQuestion[] => {
  const own = positionOf(definition, itemId);

  if (own === null) return [];

  return listFormQuestions(definition).filter(
    (listed) =>
      listed.pageIndex < own.pageIndex ||
      (listed.pageIndex === own.pageIndex && listed.itemIndex < own.itemIndex),
  );
};

// Questions a jump leaving `pageId` may reference: that page and earlier.
export const questionsThroughPage = (
  definition: FormDefinition,
  pageId: string,
): ListedQuestion[] => {
  const pageIndex = definition.pages.findIndex((page) => page.id === pageId);

  return listFormQuestions(definition).filter((listed) => listed.pageIndex <= pageIndex);
};

export const jumpTargets = (
  definition: FormDefinition,
  pageId: string,
): { pages: { page: FormPage; pageIndex: number }[]; endings: FormEnding[] } => {
  const pageIndex = definition.pages.findIndex((page) => page.id === pageId);

  return {
    pages: definition.pages
      .map((page, index) => ({ page, pageIndex: index }))
      .filter((entry) => entry.pageIndex > pageIndex),
    endings: definition.endings,
  };
};

// Printed / displayed question numbers (1-based, in form order).
export const questionNumbering = (definition: FormDefinition): Record<string, number> =>
  Object.fromEntries(
    listFormQuestions(definition).map((listed, index) => [listed.question.id, index + 1]),
  );

export const emptyGroup = (): ConditionGroup => ({ mode: 'ALL', conditions: [] });

// An empty group means "always", which is never what a half-built rule
// intends, so an emptied show/required rule is removed instead.
export const groupOrUndefined = (group: ConditionGroup): ConditionGroup | undefined =>
  group.conditions.length === 0 ? undefined : group;
