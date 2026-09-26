import { analysePrintability, toPublicDefinition, validateForPublish, validateResponse } from '@shared/surveys';
import { describe, expect, it } from 'vitest';

import { SURVEY_TEMPLATES } from './templates';

describe('starter templates', () => {
  for (const template of SURVEY_TEMPLATES) {
    it(`${template.key} should be publishable without errors or warnings`, () => {
      expect(validateForPublish(template.build())).toEqual({ errors: [], warnings: [] });
    });

    it(`${template.key} should print without blockers`, () => {
      expect(analysePrintability(template.build(), { audience: 'PUBLIC' }).blockers).toEqual([]);
      expect(analysePrintability(template.build(), { audience: 'STAFF' }).blockers).toEqual([]);
    });

    it(`${template.key} should expose no staff-only question publicly`, () => {
      const serialized = JSON.stringify(toPublicDefinition(template.build()));

      expect(serialized).not.toContain('crm_');
      expect(serialized).not.toContain('q_staff_notes');
    });
  }

  it('city business survey should branch on software use', () => {
    const definition = SURVEY_TEMPLATES[0].build();
    const base = { q_business_name: 'x', q_business_type: { choiceId: 'c_shop' }, q_phone: '0799123456', q_interest: { choiceId: 'c_no' } };

    expect(
      validateResponse(definition, { ...base, q_uses_software: true }, { audience: 'PUBLIC', mode: 'COMPLETE' }).errors,
    ).toEqual([{ questionId: 'q_which_software', code: 'REQUIRED' }]);
    expect(
      validateResponse(definition, { ...base, q_uses_software: false }, { audience: 'PUBLIC', mode: 'COMPLETE' }).errors,
    ).toEqual([{ questionId: 'q_records_today', code: 'REQUIRED' }]);
  });
});
