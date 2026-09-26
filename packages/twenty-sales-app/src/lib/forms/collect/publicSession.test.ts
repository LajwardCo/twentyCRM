import { describe, expect, it } from 'vitest';

import { SurveyRequestError } from '../../../api/surveys';
import {
  type PublicSession,
  classifyPublicSubmitError,
  clearPublicSession,
  loadPublicSession,
  newSubmissionKey,
  parsePublicSession,
  publicSessionKey,
  reconcilePublicSession,
  savePublicSession,
} from './publicSession';

const memoryStorage = () => {
  const map = new Map<string, string>();

  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
};

const session = (overrides: Partial<PublicSession> = {}): PublicSession => ({
  submissionKey: '3f1c2a8e-5b7d-4c1e-9a2b-7d6e5f4c3b2a',
  versionNumber: 1,
  answers: { q_name: 'Noor' },
  startedAt: 1_700_000_000_000,
  elapsedMs: 0,
  language: 'fa',
  ...overrides,
});

describe('public session persistence', () => {
  it('should key sessions per form link, whatever the version', () => {
    expect(publicSessionKey('abc')).toBe('svc-public:abc');
    expect(publicSessionKey('xyz')).not.toBe(publicSessionKey('abc'));
  });

  it('should keep the submission key when the served version is unchanged', () => {
    const stored = session({ versionNumber: 2 });

    expect(reconcilePublicSession(stored, 2)).toBe(stored);
  });

  it('should keep answers but start a new key after the form was republished', () => {
    const stored = session({ versionNumber: 2, elapsedMs: 40_000 });
    const next = reconcilePublicSession(stored, 3);

    expect(next.versionNumber).toBe(3);
    expect(next.answers).toEqual({ q_name: 'Noor' });
    expect(next.elapsedMs).toBe(40_000);
    expect(next.startedAt).toBe(stored.startedAt);
    expect(next.submissionKey).not.toBe(stored.submissionKey);
  });

  it('should treat a stored session without a version as unusable', () => {
    const { versionNumber: _versionNumber, ...legacy } = session();

    expect(parsePublicSession(JSON.stringify(legacy))).toBeNull();
  });

  it('should restore the same submission key and answers after a reload', () => {
    const storage = memoryStorage();
    const key = publicSessionKey('slug');

    savePublicSession(storage, key, session());

    const restored = loadPublicSession(storage, key, () => session({ submissionKey: 'new' }));

    expect(restored.submissionKey).toBe('3f1c2a8e-5b7d-4c1e-9a2b-7d6e5f4c3b2a');
    expect(restored.answers).toEqual({ q_name: 'Noor' });
  });

  it('should start a fresh session when nothing or garbage is stored', () => {
    const storage = memoryStorage();
    const key = publicSessionKey('slug');
    const fresh = session({ submissionKey: '00000000-0000-4000-8000-000000000000' });

    expect(loadPublicSession(storage, key, () => fresh)).toBe(fresh);

    storage.setItem(key, '{not json');
    expect(loadPublicSession(storage, key, () => fresh)).toBe(fresh);

    storage.setItem(key, JSON.stringify({ submissionKey: 'x', answers: {}, startedAt: 1 }));
    expect(loadPublicSession(storage, key, () => fresh)).toBe(fresh);
  });

  it('should survive storage that throws (private mode)', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    const fresh = session();

    expect(loadPublicSession(throwing, 'k', () => fresh)).toBe(fresh);
    expect(() => savePublicSession(throwing, 'k', fresh)).not.toThrow();
    expect(() => clearPublicSession(throwing, 'k')).not.toThrow();
  });

  it('should clear the session after a successful submit', () => {
    const storage = memoryStorage();

    savePublicSession(storage, 'k', session());
    clearPublicSession(storage, 'k');

    expect(storage.map.size).toBe(0);
  });

  it('should drop an unknown language but keep the answers', () => {
    const parsed = parsePublicSession(JSON.stringify({ ...session(), language: 'de' }));

    expect(parsed?.language).toBeNull();
    expect(parsed?.answers).toEqual({ q_name: 'Noor' });
  });

  it('should generate RFC 4122 v4 submission keys', () => {
    const key = newSubmissionKey();

    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newSubmissionKey()).not.toBe(key);
  });
});

describe('classifyPublicSubmitError', () => {
  const error = (status: number, code: string, details: unknown = null) =>
    new SurveyRequestError('x', status, code, details);

  it('should return per-question errors for an invalid submission', () => {
    expect(
      classifyPublicSubmitError(
        error(422, 'INVALID_SUBMISSION', { errors: [{ questionId: 'q_name', code: 'REQUIRED' }, 'junk'] }),
      ),
    ).toEqual({ kind: 'invalid', errors: [{ questionId: 'q_name', code: 'REQUIRED' }] });
  });

  it('should ask for a re-upload when an upload reference expired', () => {
    expect(classifyPublicSubmitError(error(422, 'INVALID_UPLOAD_REF', { questionId: 'q_photo' }))).toEqual({
      kind: 'upload',
      questionId: 'q_photo',
    });
  });

  it('should switch to the state screen when the form stopped accepting', () => {
    expect(classifyPublicSubmitError(error(409, 'FORM_NOT_OPEN', { state: 'LIMIT_REACHED' }))).toEqual({
      kind: 'state',
      state: 'LIMIT_REACHED',
    });
    expect(classifyPublicSubmitError(error(409, 'FORM_NOT_OPEN', { state: 'OPEN' }))).toEqual({
      kind: 'state',
      state: 'CLOSED',
    });
  });

  it('should recognise rate limiting', () => {
    expect(classifyPublicSubmitError(error(429, 'RATE_LIMITED'))).toEqual({ kind: 'rateLimited' });
  });

  it('should treat fetch failures and server errors as retryable network problems', () => {
    expect(classifyPublicSubmitError(new TypeError('Failed to fetch'))).toEqual({ kind: 'network' });
    expect(classifyPublicSubmitError(error(502, 'HTTP_ERROR'))).toEqual({ kind: 'network' });
  });

  it('should fall back to a generic failure', () => {
    expect(classifyPublicSubmitError(error(422, 'INVALID_SUBMISSION'))).toEqual({ kind: 'other' });
  });
});
