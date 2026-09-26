import { buildSurveyRecordValues } from 'src/modules/sales-crm/surveys/utils/build-survey-record-values.util';

describe('buildSurveyRecordValues', () => {
  it('should drop null foreign keys and undefined values but keep other nulls', () => {
    expect(
      buildSurveyRecordValues(
        {
          name: 'x',
          companyId: null,
          campaignId: 'c1',
          paperReference: null,
          extra: undefined,
        },
        { name: 'فرم آنلاین', workspaceMemberId: null },
      ),
    ).toEqual({
      name: 'x',
      campaignId: 'c1',
      paperReference: null,
      createdBy: {
        source: 'API',
        workspaceMemberId: null,
        name: 'فرم آنلاین',
        context: {},
      },
      updatedBy: {
        source: 'API',
        workspaceMemberId: null,
        name: 'فرم آنلاین',
        context: {},
      },
    });
  });

  it('should attribute staff writes to the member', () => {
    expect(
      buildSurveyRecordValues({}, { name: 'Tim', workspaceMemberId: 'm1' })
        .createdBy,
    ).toEqual({
      source: 'MANUAL',
      workspaceMemberId: 'm1',
      name: 'Tim',
      context: {},
    });
  });
});
