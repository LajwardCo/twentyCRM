import { type ConditionGroup } from '../types/FormDefinition';
import { type ConditionContext, evaluateCondition } from './evaluateCondition';

// An empty ALL group always holds; an empty ANY group never does.
export const evaluateConditionGroup = (
  group: ConditionGroup,
  context: ConditionContext,
): boolean =>
  group.mode === 'ALL'
    ? group.conditions.every((condition) =>
        evaluateCondition(condition, context),
      )
    : group.conditions.some((condition) =>
        evaluateCondition(condition, context),
      );
