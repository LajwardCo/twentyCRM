import { SurveyException } from 'src/modules/sales-crm/surveys/survey.exception';
import { parsePublicSubmission } from 'src/modules/sales-crm/surveys/utils/parse-public-submission.util';

const valid = {
  submissionKey: '3f1c2b7a-8d4e-4f6a-9b1c-2d3e4f5a6b7c',
  versionNumber: 2,
  answers: { q_a: 'x' },
  language: 'en',
  startedAt: 1000,
};

describe('parsePublicSubmission', () => {
  it('should accept a well-formed submission', () => {
    expect(parsePublicSubmission(valid)).toEqual({
      submissionKey: valid.submissionKey,
      versionNumber: 2,
      answers: { q_a: 'x' },
      language: 'en',
      inviteToken: null,
      campaignCode: null,
      startedAtMs: 1000,
      honeypotFilled: false,
    });
  });

  it('should reject a missing or malformed submission key', () => {
    expect(() =>
      parsePublicSubmission({ ...valid, submissionKey: '1' }),
    ).toThrow(SurveyException);
  });

  it('should reject non-integer versions and non-object answers', () => {
    expect(() =>
      parsePublicSubmission({ ...valid, versionNumber: 1.5 }),
    ).toThrow(SurveyException);
    expect(() => parsePublicSubmission({ ...valid, answers: ['x'] })).toThrow(
      SurveyException,
    );
  });

  it('should reject oversized payloads', () => {
    expect(() =>
      parsePublicSubmission({
        ...valid,
        answers: { q_a: 'x'.repeat(300_000) },
      }),
    ).toThrow('too large');
  });

  it('should flag a filled honeypot and default unknown languages to Dari', () => {
    const parsed = parsePublicSubmission({
      ...valid,
      website: 'spam',
      language: 'xx',
    });

    expect(parsed.honeypotFilled).toBe(true);
    expect(parsed.language).toBe('fa');
  });
});
