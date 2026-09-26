import { type FormDefinition } from '../../types/FormDefinition';
import { validateForPublish } from '../validateForPublish';
import { buildSoftwareSurvey, question } from './surveyFixtures';

const codes = (definition: FormDefinition) => {
  const result = validateForPublish(definition);

  return {
    errors: result.errors.map((issue) => issue.code),
    warnings: result.warnings.map((issue) => issue.code),
  };
};

describe('validateForPublish', () => {
  it('should accept a well-formed multi-page form', () => {
    expect(codes(buildSoftwareSurvey())).toEqual({ errors: [], warnings: [] });
  });

  it('should reject an empty form', () => {
    const definition = buildSoftwareSurvey();

    definition.pages = [{ id: 'p1', title: {}, items: [], jumps: [] }];
    definition.crmMapping = [];

    expect(codes(definition).errors).toContain('EMPTY_FORM');
  });

  it('should reject a condition referring to a deleted question', () => {
    const definition = buildSoftwareSurvey();

    definition.pages[0].items[2] = question('q_which', 'short_text', {
      visibleWhen: {
        mode: 'ALL',
        conditions: [{ questionId: 'q_deleted', op: 'answered' }],
      },
    });

    expect(codes(definition).errors).toContain('BROKEN_REFERENCE');
  });

  it('should reject a condition on a choice that no longer exists', () => {
    const definition = buildSoftwareSurvey();

    definition.pages[0].jumps[0].when.conditions[0].value = 'c_removed';

    expect(codes(definition).errors).toContain('BROKEN_REFERENCE');
  });

  it('should reject a condition that refers to a later question', () => {
    const definition = buildSoftwareSurvey();

    definition.pages[0].items[0] = question('q_name', 'short_text', {
      visibleWhen: {
        mode: 'ALL',
        conditions: [{ questionId: 'q_interest', op: 'answered' }],
      },
    });

    expect(codes(definition).errors).toContain('FORWARD_REFERENCE');
  });

  it('should reject a jump back to an earlier page as a loop', () => {
    const definition = buildSoftwareSurvey();

    definition.pages[1].jumps.push({
      id: 'j_back',
      when: {
        mode: 'ALL',
        conditions: [{ questionId: 'q_phone', op: 'answered' }],
      },
      to: { pageId: 'p1' },
    });

    expect(codes(definition).errors).toContain('BACKWARD_JUMP');
  });

  it('should reject two jumps with the same condition and different targets', () => {
    const definition = buildSoftwareSurvey();

    definition.pages[0].jumps.push({
      id: 'j_other',
      when: {
        mode: 'ALL',
        conditions: [{ questionId: 'q_interest', op: 'eq', value: 'c_no' }],
      },
      to: { pageId: 'p2' },
    });

    expect(codes(definition).errors).toContain('CONTRADICTORY_JUMPS');
  });

  it('should warn about rules placed after an unconditional jump', () => {
    const definition = buildSoftwareSurvey();

    definition.pages[0].jumps.unshift({
      id: 'j_always',
      when: { mode: 'ALL', conditions: [] },
      to: { pageId: 'p2' },
    });

    expect(codes(definition).warnings).toContain('UNREACHABLE_JUMP');
  });

  it('should reject a required question whose visibility can never hold', () => {
    const definition = buildSoftwareSurvey();

    definition.pages[0].items[2] = question('q_which', 'short_text', {
      required: true,
      visibleWhen: {
        mode: 'ALL',
        conditions: [
          { questionId: 'q_uses', op: 'eq', value: true },
          { questionId: 'q_uses', op: 'eq', value: false },
        ],
      },
    });

    expect(codes(definition).errors).toContain('UNSATISFIABLE_CONDITION');
  });

  it('should reject required questions on a page nothing can reach', () => {
    const definition = buildSoftwareSurvey();

    definition.pages[0].jumps = [
      {
        id: 'j_always_end',
        when: { mode: 'ALL', conditions: [] },
        to: { endingId: 'e_thanks' },
      },
    ];

    expect(codes(definition).errors).toContain('UNREACHABLE_PAGE');
  });

  it('should reject public logic that depends on a staff-only answer', () => {
    const definition = buildSoftwareSurvey();

    definition.pages[1].items.push(
      question('q_public_followup', 'short_text', {
        visibleWhen: {
          mode: 'ALL',
          conditions: [{ questionId: 'q_staff_note', op: 'answered' }],
        },
      }),
    );

    expect(codes(definition).errors).toContain('PUBLIC_DEPENDS_ON_STAFF');
    expect(
      validateForPublish(definition, { publicEnabled: false }).errors.map(
        (issue) => issue.code,
      ),
    ).not.toContain('PUBLIC_DEPENDS_ON_STAFF');
  });

  it('should reject mapping a question to an incompatible CRM field', () => {
    const definition = buildSoftwareSurvey();

    definition.crmMapping.push({
      id: 'm_bad',
      questionId: 'q_uses',
      field: 'person.email',
    });

    expect(codes(definition).errors).toContain('INCOMPATIBLE_MAPPING');
  });

  it('should reject numeric comparisons on text questions', () => {
    const definition = buildSoftwareSurvey();

    definition.pages[1].items.push(
      question('q_x', 'short_text', {
        visibleWhen: {
          mode: 'ALL',
          conditions: [{ questionId: 'q_name', op: 'gt', value: 3 }],
        },
      }),
    );

    expect(codes(definition).errors).toContain('INVALID_OPERATOR');
  });

  it('should reject duplicate ids and choice questions without choices', () => {
    const definition = buildSoftwareSurvey();

    definition.pages[1].items.push(question('q_name', 'dropdown'));

    const { errors } = codes(definition);

    expect(errors).toContain('DUPLICATE_ID');
    expect(errors).toContain('NO_CHOICES');
  });

  it('should reject inverted bounds', () => {
    const definition = buildSoftwareSurvey();

    definition.pages[1].items.push(
      question('q_range', 'number', { config: { min: 10, max: 1 } }),
    );

    expect(codes(definition).errors).toContain('INVALID_BOUNDS');
  });

  it('should explain problems in Dari', () => {
    const definition = buildSoftwareSurvey();

    definition.pages[1].jumps.push({
      id: 'j_back',
      when: { mode: 'ALL', conditions: [] },
      to: { pageId: 'p1' },
    });

    expect(validateForPublish(definition).errors[0].message).toMatch(/حلقه/);
  });
});
