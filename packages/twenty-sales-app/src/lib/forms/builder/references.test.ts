import { validateForPublish } from '@shared/surveys';
import { describe, expect, it } from 'vitest';

import { buildFixtureDefinition, fixtureQuestion } from './builderFixtures';
import { removeItem } from './definitionOps';
import { issueTarget } from './issues';
import { findPageReferences, findQuestionReferences, referencedChoiceIds } from './references';

describe('rule references', () => {
  it('should list every rule that uses a question', () => {
    const definition = buildFixtureDefinition();

    expect(findQuestionReferences(definition, 'q1')).toEqual([
      { kind: 'jump', pageId: 'p1', pageIndex: 0, ruleId: 'j1' },
      { kind: 'visibleWhen', itemId: 'q3', pageId: 'p2', pageIndex: 1 },
    ]);
    expect(findQuestionReferences(definition, 'q3')).toEqual([
      { kind: 'automation', ruleId: 'a1' },
    ]);
    expect(findQuestionReferences(definition, 'q5')).toEqual([{ kind: 'mapping', ruleId: 'm1' }]);
    expect(findQuestionReferences(definition, 'q4')).toEqual([]);
  });

  it('should report jumps into a page and outside rules using its questions', () => {
    const definition = buildFixtureDefinition();

    expect(findPageReferences(definition, 'p3')).toEqual({
      incomingJumps: [{ kind: 'jump', pageId: 'p1', pageIndex: 0, ruleId: 'j1' }],
      questionReferences: [{ kind: 'mapping', ruleId: 'm1' }],
    });
    // q1's rules on other pages survive the deletion of page 1.
    expect(findPageReferences(definition, 'p1').questionReferences).toEqual([
      { kind: 'visibleWhen', itemId: 'q3', pageId: 'p2', pageIndex: 1 },
    ]);
  });

  it('should let the publish validator flag what a deletion broke, and route the issue', () => {
    const definition = removeItem(buildFixtureDefinition(), 'q1');
    const broken = validateForPublish(definition).errors.filter(
      (issue) => issue.code === 'BROKEN_REFERENCE',
    );

    expect(broken.length).toBeGreaterThanOrEqual(2);
    expect(broken.map((issue) => issueTarget(issue, definition).tab)).toEqual(
      broken.map(() => 'logic'),
    );
  });

  it('should route mapping and automation issues to the CRM tab', () => {
    const definition = removeItem(buildFixtureDefinition(), 'q5');
    const mappingIssue = validateForPublish(definition).errors.find(
      (issue) => issue.ruleId === 'm1',
    );

    expect(mappingIssue).toBeDefined();
    expect(issueTarget(mappingIssue!, definition)).toMatchObject({ tab: 'crm', ruleId: 'm1' });
    expect(
      issueTarget({ code: 'MISSING_LABEL', message: '', itemId: 'q2', pageId: 'p1' }, definition),
    ).toEqual({ tab: 'builder', itemId: 'q2', pageId: 'p1', ruleId: undefined });
  });
});

describe('referenced choices', () => {
  it('should collect the choice ids rules compare against', () => {
    const definition = buildFixtureDefinition();

    definition.pages[1].items[1] = fixtureQuestion('q4', 'multi_choice', {
      visibleWhen: { mode: 'ALL', conditions: [{ questionId: 'q2', op: 'eq', value: 'q2_b' }] },
    });

    expect([...referencedChoiceIds(definition, 'q2')]).toEqual(['q2_b']);
    expect([...referencedChoiceIds(definition, 'q1')]).toEqual([]);
  });
});
