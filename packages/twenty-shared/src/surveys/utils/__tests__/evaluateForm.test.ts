import { evaluateForm } from '../evaluateForm';
import { buildSoftwareSurvey, question } from './surveyFixtures';

describe('evaluateForm', () => {
  const definition = buildSoftwareSurvey();

  it('should show "which software" and hide "how managed" when the business uses software', () => {
    const result = evaluateForm(
      definition,
      { q_uses: true },
      { audience: 'PUBLIC' },
    );

    expect(result.visibleItemIds.has('q_which')).toBe(true);
    expect(result.visibleItemIds.has('q_how')).toBe(false);
    expect(result.requiredQuestionIds.has('q_which')).toBe(true);
    expect(result.skippedByLogic).toContain('q_how');
  });

  it('should ask how records are managed when the business does not use software', () => {
    const result = evaluateForm(
      definition,
      { q_uses: false },
      { audience: 'PUBLIC' },
    );

    expect(result.visibleItemIds.has('q_which')).toBe(false);
    expect(result.visibleItemIds.has('q_how')).toBe(true);
  });

  it('should hide both branches while the controlling question is unanswered', () => {
    const result = evaluateForm(definition, {}, { audience: 'PUBLIC' });

    expect(result.visibleItemIds.has('q_which')).toBe(false);
    expect(result.visibleItemIds.has('q_how')).toBe(false);
  });

  it('should end early with the matching ending when not interested', () => {
    const result = evaluateForm(
      definition,
      { q_interest: { choiceId: 'c_no' } },
      { audience: 'PUBLIC' },
    );

    expect(result.pagePath).toEqual(['p1']);
    expect(result.endingId).toBe('e_bye');
    expect(result.skippedByLogic).toEqual(
      expect.arrayContaining(['q_modules', 'q_phone', 'q_employees']),
    );
  });

  it('should visit the second page and use the default ending when interested', () => {
    const result = evaluateForm(
      definition,
      { q_interest: { choiceId: 'c_yes' } },
      { audience: 'PUBLIC' },
    );

    expect(result.pagePath).toEqual(['p1', 'p2']);
    expect(result.endingId).toBe('e_thanks');
  });

  it('should never show staff-only questions to the public, nor count them as skipped', () => {
    const result = evaluateForm(definition, {}, { audience: 'PUBLIC' });

    expect(result.visibleItemIds.has('q_staff_note')).toBe(false);
    expect(result.skippedByLogic).not.toContain('q_staff_note');
  });

  it('should show staff-only questions to staff', () => {
    const result = evaluateForm(definition, {}, { audience: 'STAFF' });

    expect(result.visibleItemIds.has('q_staff_note')).toBe(true);
  });

  it('should hide every question under a hidden section', () => {
    const withSection = buildSoftwareSurvey();

    withSection.pages[1].items.unshift({
      kind: 'section',
      id: 's_details',
      title: { fa: 'جزئیات' },
      visibleWhen: {
        mode: 'ALL',
        conditions: [{ questionId: 'q_uses', op: 'eq', value: true }],
      },
    });

    const result = evaluateForm(
      withSection,
      { q_uses: false, q_interest: { choiceId: 'c_yes' } },
      { audience: 'PUBLIC' },
    );

    expect(result.visibleItemIds.has('s_details')).toBe(false);
    expect(result.visibleItemIds.has('q_modules')).toBe(false);
  });

  it('should ignore a backward jump instead of looping', () => {
    const looping = buildSoftwareSurvey();

    looping.pages[1].jumps.push({
      id: 'j_back',
      when: { mode: 'ALL', conditions: [] },
      to: { pageId: 'p1' },
    });

    const result = evaluateForm(
      looping,
      { q_interest: { choiceId: 'c_yes' } },
      { audience: 'PUBLIC' },
    );

    expect(result.pagePath).toEqual(['p1', 'p2']);
  });

  it('should make a question required only while its condition holds', () => {
    const conditional = buildSoftwareSurvey();

    conditional.pages[1].items.push(
      question('q_reason', 'long_text', {
        requiredWhen: {
          mode: 'ANY',
          conditions: [
            { questionId: 'q_employees', op: 'gt', value: 50 },
            { questionId: 'q_modules', op: 'includes', value: 'c_hr' },
          ],
        },
      }),
    );

    const base = { q_interest: { choiceId: 'c_yes' } };

    expect(
      evaluateForm(
        conditional,
        { ...base, q_employees: 10 },
        { audience: 'PUBLIC' },
      ).requiredQuestionIds.has('q_reason'),
    ).toBe(false);
    expect(
      evaluateForm(
        conditional,
        { ...base, q_employees: 80 },
        { audience: 'PUBLIC' },
      ).requiredQuestionIds.has('q_reason'),
    ).toBe(true);
    expect(
      evaluateForm(
        conditional,
        { ...base, q_modules: { choiceIds: ['c_hr'] } },
        { audience: 'PUBLIC' },
      ).requiredQuestionIds.has('q_reason'),
    ).toBe(true);
  });
});
