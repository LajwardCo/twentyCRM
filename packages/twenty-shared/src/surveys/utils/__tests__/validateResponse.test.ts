import { validateResponse } from '../validateResponse';
import { buildSoftwareSurvey } from './surveyFixtures';

describe('validateResponse', () => {
  const definition = buildSoftwareSurvey();

  it('should strip an answer whose question became hidden and report it as skipped', () => {
    const result = validateResponse(
      definition,
      {
        q_name: 'دواخانه نور',
        q_uses: false,
        q_which: 'Old software',
        q_how: { choiceId: 'c_paper' },
        q_interest: { choiceId: 'c_no' },
      },
      { audience: 'PUBLIC', mode: 'COMPLETE' },
    );

    expect(result.errors).toEqual([]);
    expect(result.cleanAnswers.q_which).toBeUndefined();
    expect(result.skippedByLogic).toContain('q_which');
    expect(result.endingId).toBe('e_bye');
  });

  it('should require visible required questions in COMPLETE mode', () => {
    const result = validateResponse(
      definition,
      { q_uses: true },
      { audience: 'PUBLIC', mode: 'COMPLETE' },
    );

    expect(result.errors).toEqual(
      expect.arrayContaining([
        { questionId: 'q_name', code: 'REQUIRED' },
        { questionId: 'q_which', code: 'REQUIRED' },
        { questionId: 'q_interest', code: 'REQUIRED' },
      ]),
    );
    expect(result.errors).not.toContainEqual({
      questionId: 'q_how',
      code: 'REQUIRED',
    });
  });

  it('should never report REQUIRED in PARTIAL mode but keep format errors', () => {
    const result = validateResponse(
      definition,
      { q_interest: { choiceId: 'c_yes' }, q_employees: 0 },
      { audience: 'STAFF', mode: 'PARTIAL' },
    );

    expect(result.errors).toEqual([
      { questionId: 'q_employees', code: 'TOO_SMALL' },
    ]);
  });

  it('should drop answers the public sent for staff-only questions', () => {
    const result = validateResponse(
      definition,
      { q_staff_note: 'injected', q_name: 'x' },
      { audience: 'PUBLIC', mode: 'PARTIAL' },
    );

    expect(result.cleanAnswers.q_staff_note).toBeUndefined();
  });

  it('should keep staff-only answers for staff', () => {
    const result = validateResponse(
      definition,
      { q_staff_note: 'owner was friendly' },
      { audience: 'STAFF', mode: 'PARTIAL' },
    );

    expect(result.cleanAnswers.q_staff_note).toBe('owner was friendly');
  });

  it('should drop unknown question ids', () => {
    const result = validateResponse(
      definition,
      { q_does_not_exist: 'x' },
      { audience: 'STAFF', mode: 'PARTIAL' },
    );

    expect(result.cleanAnswers).toEqual({});
  });

  it('should enforce multi-choice selection limits', () => {
    const result = validateResponse(
      definition,
      {
        q_interest: { choiceId: 'c_yes' },
        q_modules: ['c_stock', 'c_sales', 'c_hr'],
      },
      { audience: 'PUBLIC', mode: 'PARTIAL' },
    );

    expect(result.errors).toEqual([
      { questionId: 'q_modules', code: 'TOO_MANY' },
    ]);
  });

  it('should reject malformed phone numbers', () => {
    const result = validateResponse(
      definition,
      { q_interest: { choiceId: 'c_yes' }, q_phone: '12' },
      { audience: 'PUBLIC', mode: 'PARTIAL' },
    );

    expect(result.errors).toEqual([
      { questionId: 'q_phone', code: 'INVALID_PHONE' },
    ]);
  });

  it('should ignore format errors on questions hidden by logic', () => {
    const result = validateResponse(
      definition,
      { q_interest: { choiceId: 'c_no' }, q_phone: '12' },
      { audience: 'PUBLIC', mode: 'PARTIAL' },
    );

    expect(result.errors).toEqual([]);
    expect(result.cleanAnswers.q_phone).toBeUndefined();
  });

  it('should accept a complete valid submission', () => {
    const result = validateResponse(
      definition,
      {
        q_name: 'Noor Pharmacy',
        q_uses: true,
        q_which: 'Excel macros',
        q_interest: { choiceId: 'c_yes' },
        q_modules: { choiceIds: ['c_stock'] },
        q_phone: '+93799123456',
      },
      { audience: 'PUBLIC', mode: 'COMPLETE' },
    );

    expect(result.errors).toEqual([]);
    expect(result.endingId).toBe('e_thanks');
    expect(Object.keys(result.cleanAnswers).sort()).toEqual(
      [
        'q_interest',
        'q_modules',
        'q_name',
        'q_phone',
        'q_uses',
        'q_which',
      ].sort(),
    );
  });
});
