import { type FormLanguage } from 'twenty-shared/surveys';

import { SURVEY_MAX_SUBMISSION_BYTES } from 'src/modules/sales-crm/surveys/constants/survey.constants';
import {
  SurveyException,
  SurveyExceptionCode,
} from 'src/modules/sales-crm/surveys/survey.exception';

export type ParsedPublicSubmission = {
  submissionKey: string;
  versionNumber: number;
  answers: Record<string, unknown>;
  language: FormLanguage;
  inviteToken: string | null;
  campaignCode: string | null;
  startedAtMs: number | null;
  honeypotFilled: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LANGUAGES: FormLanguage[] = ['fa', 'ps', 'en'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const optionalString = (value: unknown, maxLength: number): string | null =>
  typeof value === 'string' && value !== '' && value.length <= maxLength
    ? value
    : null;

// Shape checks only; the answers themselves are validated by the shared
// engine against the version the respondent loaded.
export const parsePublicSubmission = (
  body: unknown,
): ParsedPublicSubmission => {
  const size = Buffer.byteLength(JSON.stringify(body ?? null), 'utf8');

  if (size > SURVEY_MAX_SUBMISSION_BYTES) {
    throw new SurveyException(
      'Submission is too large',
      SurveyExceptionCode.PAYLOAD_TOO_LARGE,
    );
  }

  if (!isRecord(body)) {
    throw new SurveyException(
      'Invalid submission',
      SurveyExceptionCode.INVALID_SUBMISSION,
    );
  }

  const { submissionKey, versionNumber, answers } = body;

  if (typeof submissionKey !== 'string' || !UUID_PATTERN.test(submissionKey)) {
    throw new SurveyException(
      'Invalid submission key',
      SurveyExceptionCode.INVALID_SUBMISSION,
    );
  }

  if (
    typeof versionNumber !== 'number' ||
    !Number.isInteger(versionNumber) ||
    versionNumber < 1
  ) {
    throw new SurveyException(
      'Invalid form version',
      SurveyExceptionCode.INVALID_SUBMISSION,
    );
  }

  if (!isRecord(answers)) {
    throw new SurveyException(
      'Invalid answers',
      SurveyExceptionCode.INVALID_SUBMISSION,
    );
  }

  const language = LANGUAGES.includes(body.language as FormLanguage)
    ? (body.language as FormLanguage)
    : 'fa';

  const startedAt = body.startedAt;

  return {
    submissionKey: submissionKey.toLowerCase(),
    versionNumber,
    answers,
    language,
    inviteToken: optionalString(body.inviteToken, 64),
    campaignCode: optionalString(body.campaignCode, 64),
    startedAtMs:
      typeof startedAt === 'number' && Number.isFinite(startedAt)
        ? startedAt
        : null,
    // The honeypot is a visually hidden text field people never fill.
    honeypotFilled: typeof body.website === 'string' && body.website !== '',
  };
};
