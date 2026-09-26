import { type ConditionGroup } from '../types/FormDefinition';

export const isAlwaysTrueGroup = (group: ConditionGroup): boolean =>
  group.mode === 'ALL' && group.conditions.length === 0;
