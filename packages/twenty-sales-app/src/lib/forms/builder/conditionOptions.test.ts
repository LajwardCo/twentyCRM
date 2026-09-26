import { describe, expect, it } from 'vitest';

import { buildFixtureDefinition, fixtureQuestion } from './builderFixtures';
import {
  conditionChoiceIds,
  defaultConditionFor,
  groupOrUndefined,
  jumpTargets,
  normalizeCondition,
  operatorsFor,
  questionNumbering,
  questionsBeforeItem,
  questionsThroughPage,
} from './conditionOptions';

const ids = (listed: { question: { id: string } }[]) => listed.map((entry) => entry.question.id);

describe('condition options', () => {
  it('should offer only questions before the item', () => {
    const definition = buildFixtureDefinition();

    expect(ids(questionsBeforeItem(definition, 'q1'))).toEqual([]);
    expect(ids(questionsBeforeItem(definition, 's1'))).toEqual(['q1']);
    expect(ids(questionsBeforeItem(definition, 'q4'))).toEqual(['q1', 'q2', 'q3']);
    expect(ids(questionsBeforeItem(definition, 'missing'))).toEqual([]);
  });

  it('should offer the page and earlier pages for jump conditions', () => {
    const definition = buildFixtureDefinition();

    expect(ids(questionsThroughPage(definition, 'p1'))).toEqual(['q1', 'q2']);
    expect(ids(questionsThroughPage(definition, 'p2'))).toEqual(['q1', 'q2', 'q3', 'q4']);
  });

  it('should offer only later pages and all endings as jump targets', () => {
    const definition = buildFixtureDefinition();
    const targets = jumpTargets(definition, 'p2');

    expect(targets.pages.map((entry) => entry.page.id)).toEqual(['p3']);
    expect(targets.endings).toHaveLength(1);
    expect(jumpTargets(definition, 'p3').pages).toEqual([]);
  });

  it('should filter operators by question type', () => {
    expect(operatorsFor(fixtureQuestion('n', 'number'))).toEqual([
      'eq',
      'neq',
      'gt',
      'gte',
      'lt',
      'lte',
      'answered',
      'not_answered',
    ]);
    expect(operatorsFor(fixtureQuestion('m', 'multi_choice'))).toEqual([
      'includes',
      'excludes',
      'answered',
      'not_answered',
    ]);
    expect(operatorsFor(fixtureQuestion('f', 'file'))).toEqual(['answered', 'not_answered']);
  });

  it('should build a sensible default condition per type', () => {
    expect(defaultConditionFor(fixtureQuestion('y', 'yes_no'))).toEqual({
      questionId: 'y',
      op: 'eq',
      value: true,
    });
    expect(defaultConditionFor(fixtureQuestion('c', 'single_choice'))).toEqual({
      questionId: 'c',
      op: 'eq',
      value: 'c_a',
    });
    expect(defaultConditionFor(fixtureQuestion('m', 'multi_choice')).op).toBe('includes');
    expect(defaultConditionFor(fixtureQuestion('f', 'file'))).toEqual({
      questionId: 'f',
      op: 'answered',
    });
  });

  it('should repair a condition after its question changed', () => {
    const choice = fixtureQuestion('c', 'single_choice');

    expect(normalizeCondition({ questionId: 'x', op: 'gt', value: 3 }, choice)).toEqual({
      questionId: 'c',
      op: 'eq',
      value: 'c_a',
    });
    expect(normalizeCondition({ questionId: 'c', op: 'neq', value: 'c_b' }, choice)).toEqual({
      questionId: 'c',
      op: 'neq',
      value: 'c_b',
    });
    expect(
      normalizeCondition({ questionId: 'c', op: 'answered', value: 'c_b' }, choice),
    ).toEqual({ questionId: 'c', op: 'answered' });
  });

  it('should include the other option only when allowed', () => {
    const plain = fixtureQuestion('c', 'dropdown');

    expect(conditionChoiceIds(plain)).toEqual(['c_a', 'c_b']);
    expect(
      conditionChoiceIds({ ...plain, config: { ...plain.config, allowOther: true } }),
    ).toEqual(['c_a', 'c_b', '__other']);
  });

  it('should number questions in form order, skipping sections', () => {
    expect(questionNumbering(buildFixtureDefinition())).toEqual({
      q1: 1,
      q2: 2,
      q3: 3,
      q4: 4,
      q5: 5,
    });
  });

  it('should drop empty condition groups', () => {
    expect(groupOrUndefined({ mode: 'ALL', conditions: [] })).toBeUndefined();
  });
});
