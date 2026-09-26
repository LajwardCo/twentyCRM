import { type FormLanguage, type ResponseValidationError } from '@shared/surveys';

import { type PublicFormState, SurveyRequestError } from '../../../api/surveys';

// What a respondent has typed on the public form, kept in sessionStorage so a
// reload or a failed submit never loses it. The submission key lives with the
// answers: every retry of the same attempt reuses it, which is what makes a
// double-click or a retry after a dropped reply land on one server record.

export type PublicSession = {
  submissionKey: string;
  answers: Record<string, unknown>;
  startedAt: number;
  language: FormLanguage | null;
};

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const publicSessionKey = (slug: string, versionNumber: number): string =>
  `svc-public:${slug}:v${versionNumber}`;

const isLanguage = (value: unknown): value is FormLanguage =>
  value === 'fa' || value === 'ps' || value === 'en';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const parsePublicSession = (raw: string | null): PublicSession | null => {
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);

    if (
      !isPlainObject(parsed) ||
      typeof parsed.submissionKey !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(parsed.submissionKey) ||
      !isPlainObject(parsed.answers) ||
      typeof parsed.startedAt !== 'number'
    ) {
      return null;
    }

    return {
      submissionKey: parsed.submissionKey,
      answers: parsed.answers,
      startedAt: parsed.startedAt,
      language: isLanguage(parsed.language) ? parsed.language : null,
    };
  } catch {
    return null;
  }
};

// Private browsing modes can throw on any storage access; the form must still
// work, just without reload protection.
export const loadPublicSession = (
  storage: KeyValueStorage | null,
  key: string,
  create: () => PublicSession,
): PublicSession => {
  try {
    const existing = parsePublicSession(storage?.getItem(key) ?? null);

    if (existing !== null) return existing;
  } catch {
    // fall through to a fresh session
  }

  return create();
};

export const savePublicSession = (
  storage: KeyValueStorage | null,
  key: string,
  session: PublicSession,
): void => {
  try {
    storage?.setItem(key, JSON.stringify(session));
  } catch {
    // quota or privacy mode: the in-memory copy still works
  }
};

export const clearPublicSession = (
  storage: KeyValueStorage | null,
  key: string,
): void => {
  try {
    storage?.removeItem(key);
  } catch {
    // nothing to clear
  }
};

export const newSubmissionKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Older browsers without randomUUID still have getRandomValues.
  const bytes = new Uint8Array(16);

  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

// How a failed public submit should be presented.
export type PublicSubmitFailure =
  | { kind: 'invalid'; errors: ResponseValidationError[] }
  | { kind: 'upload'; questionId: string | null }
  | { kind: 'state'; state: PublicFormState }
  | { kind: 'rateLimited' }
  | { kind: 'network' }
  | { kind: 'other' };

const STATES: PublicFormState[] = [
  'OPEN',
  'NOT_YET_OPEN',
  'CLOSED',
  'EXPIRED',
  'LIMIT_REACHED',
  'INVALID',
];

const detailsOf = (error: SurveyRequestError): Record<string, unknown> =>
  isPlainObject(error.details) ? error.details : {};

export const classifyPublicSubmitError = (error: unknown): PublicSubmitFailure => {
  if (!(error instanceof SurveyRequestError)) {
    // fetch rejects with a TypeError when the network is down.
    return { kind: 'network' };
  }

  const details = detailsOf(error);

  if (error.status === 429 || error.code === 'RATE_LIMITED') {
    return { kind: 'rateLimited' };
  }

  if (error.code === 'INVALID_UPLOAD_REF') {
    return {
      kind: 'upload',
      questionId: typeof details.questionId === 'string' ? details.questionId : null,
    };
  }

  if (error.code === 'FORM_NOT_OPEN' || error.status === 409) {
    const state = STATES.find((candidate) => candidate === details.state);

    return { kind: 'state', state: state === undefined || state === 'OPEN' ? 'CLOSED' : state };
  }

  if (error.code === 'INVALID_SUBMISSION' && Array.isArray(details.errors)) {
    const errors = details.errors.filter(
      (candidate): candidate is ResponseValidationError =>
        isPlainObject(candidate) &&
        typeof candidate.questionId === 'string' &&
        typeof candidate.code === 'string',
    );

    if (errors.length > 0) return { kind: 'invalid', errors };
  }

  if (error.status >= 500 || error.status === 0) return { kind: 'network' };

  return { kind: 'other' };
};
