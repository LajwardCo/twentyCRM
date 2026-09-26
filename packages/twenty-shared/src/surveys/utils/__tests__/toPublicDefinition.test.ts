import { toPublicDefinition } from '../toPublicDefinition';
import { validateResponse } from '../validateResponse';
import { buildSoftwareSurvey, question } from './surveyFixtures';

describe('toPublicDefinition', () => {
  it('should remove staff-only questions, CRM pickers, mapping and automations', () => {
    const definition = buildSoftwareSurvey();

    definition.pages[0].items.push(question('q_company', 'crm_company'));
    definition.automations.push({
      id: 'a_lead',
      enabled: true,
      action: 'CREATE_LEAD',
    });

    const publicDefinition = toPublicDefinition(definition);
    const serialized = JSON.stringify(publicDefinition);

    expect(serialized).not.toContain('q_staff_note');
    expect(serialized).not.toContain('q_company');
    expect(publicDefinition.crmMapping).toEqual([]);
    expect(publicDefinition.automations).toEqual([]);
  });

  it('should not modify the original definition', () => {
    const definition = buildSoftwareSurvey();

    toPublicDefinition(definition);

    expect(JSON.stringify(definition)).toContain('q_staff_note');
    expect(definition.crmMapping).toHaveLength(3);
  });

  it('should validate identically against the public and the full definition', () => {
    const definition = buildSoftwareSurvey();
    const answers = {
      q_name: 'x',
      q_uses: false,
      q_how: { choiceId: '__other', otherText: 'notebook' },
      q_interest: { choiceId: 'c_yes' },
      q_modules: ['c_sales'],
    };
    const options = { audience: 'PUBLIC', mode: 'COMPLETE' } as const;

    expect(
      validateResponse(toPublicDefinition(definition), answers, options),
    ).toEqual(validateResponse(definition, answers, options));
  });
});
