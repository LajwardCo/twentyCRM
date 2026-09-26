import { type FormDefinition, createEmptyFormDefinition, createQuestion } from '@shared/surveys';
import { describe, expect, it } from 'vitest';

import { evaluateAndBuildSteps, resolveStepIndex, validateStep } from './rendererSteps';

const buildDefinition = (presentation: FormDefinition['presentation']) => {
  const definition = createEmptyFormDefinition('fa');
  const uses = { ...createQuestion('yes_no', 'fa', 'نرم‌افزار دارید؟'), id: 'q_uses', required: true };
  const which = {
    ...createQuestion('short_text', 'fa', 'کدام؟'),
    id: 'q_which',
    required: true,
    visibleWhen: { mode: 'ALL' as const, conditions: [{ questionId: 'q_uses', op: 'eq' as const, value: true }] },
  };
  const heading = { kind: 'heading' as const, id: 'b_head', text: { fa: 'تماس' } };
  const phone = { ...createQuestion('phone', 'fa', 'تلفن'), id: 'q_phone' };

  definition.presentation = presentation;
  definition.pages[0].items = [uses, which];
  definition.pages.push({ id: 'p2', title: {}, items: [heading, phone], jumps: [] });

  return definition;
};

describe('buildSteps', () => {
  it('should make one step per page with only visible items', () => {
    const { steps } = evaluateAndBuildSteps(buildDefinition('ALL_ON_PAGE'), { q_uses: false }, 'PUBLIC');

    expect(steps.map((step) => step.items.map((item) => item.id))).toEqual([
      ['q_uses'],
      ['b_head', 'q_phone'],
    ]);
  });

  it('should make one step per question and carry display blocks with the next question', () => {
    const { steps } = evaluateAndBuildSteps(buildDefinition('ONE_QUESTION'), { q_uses: true }, 'PUBLIC');

    expect(steps.map((step) => step.key)).toEqual(['q_uses', 'q_which', 'q_phone']);
    expect(steps[2].items.map((item) => item.id)).toEqual(['b_head', 'q_phone']);
  });
});

describe('resolveStepIndex', () => {
  it('should keep the current step when it still exists', () => {
    const { steps } = evaluateAndBuildSteps(buildDefinition('ONE_QUESTION'), { q_uses: true }, 'PUBLIC');

    expect(resolveStepIndex(steps, 'q_phone', [])).toBe(2);
  });

  it('should fall back to the nearest earlier step when the current one disappears', () => {
    const { steps } = evaluateAndBuildSteps(buildDefinition('ONE_QUESTION'), { q_uses: false }, 'PUBLIC');

    expect(resolveStepIndex(steps, 'q_which', ['q_uses', 'q_which', 'q_phone'])).toBe(0);
  });
});

describe('validateStep', () => {
  it('should only report errors for questions on the current step', () => {
    const definition = buildDefinition('ALL_ON_PAGE');
    const { steps } = evaluateAndBuildSteps(definition, { q_uses: true }, 'PUBLIC');

    expect(validateStep(definition, { q_uses: true }, 'PUBLIC', steps[0])).toEqual([
      { questionId: 'q_which', code: 'REQUIRED' },
    ]);
    expect(validateStep(definition, { q_uses: true }, 'PUBLIC', steps[1])).toEqual([]);
  });
});
