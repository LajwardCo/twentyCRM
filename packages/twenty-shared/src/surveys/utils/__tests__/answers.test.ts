import { isAnswerPresent } from '../isAnswerPresent';
import { normalizeAnswer } from '../normalizeAnswer';
import { question } from './surveyFixtures';

const choiceQuestion = question('q', 'single_choice', {
  config: { choices: [{ id: 'c_a', label: { fa: 'الف' } }] },
});
const multiQuestion = question('q', 'multi_choice', {
  config: {
    choices: [
      { id: 'c_a', label: { fa: 'الف' } },
      { id: 'c_b', label: { fa: 'ب' } },
    ],
  },
});

describe('normalizeAnswer', () => {
  it('should parse Persian digits in number answers', () => {
    expect(normalizeAnswer(question('q', 'number'), ' ۱۲٫۵ ')).toEqual({
      value: 12.5,
    });
  });

  it('should reject non-numeric text for number questions', () => {
    expect(normalizeAnswer(question('q', 'number'), '12abc')).toEqual({
      error: 'INVALID_VALUE',
    });
  });

  it('should reject a choice id that the question does not offer', () => {
    expect(normalizeAnswer(choiceQuestion, { choiceId: 'c_nope' })).toEqual({
      error: 'INVALID_CHOICE',
    });
  });

  it('should reject "Other" when the question does not allow it', () => {
    expect(normalizeAnswer(choiceQuestion, { choiceId: '__other' })).toEqual({
      error: 'INVALID_CHOICE',
    });
  });

  it('should dedupe multi-choice ids and accept a bare array', () => {
    expect(normalizeAnswer(multiQuestion, ['c_a', 'c_a', 'c_b'])).toEqual({
      value: { choiceIds: ['c_a', 'c_b'] },
    });
  });

  it('should normalize phone numbers to Latin digits without separators', () => {
    expect(normalizeAnswer(question('q', 'phone'), '۰۷۹۹ ۱۲۳-۴۵۶')).toEqual({
      value: '0799123456',
    });
  });

  it('should reject impossible dates', () => {
    expect(normalizeAnswer(question('q', 'date'), '2026-02-30')).toEqual({
      error: 'INVALID_DATE',
    });
  });

  it('should reject dates with trailing text instead of truncating them', () => {
    expect(normalizeAnswer(question('q', 'date'), '2026-02-01junk')).toEqual({
      error: 'INVALID_DATE',
    });
    expect(
      normalizeAnswer(question('q', 'datetime'), '2026-02-01T10:00+04:30'),
    ).toEqual({ error: 'INVALID_DATE' });
    expect(
      normalizeAnswer(question('q', 'datetime'), '2026-02-01T10:00:59'),
    ).toEqual({
      value: '2026-02-01T10:00',
    });
  });

  it('should reject a location with only one coordinate', () => {
    expect(normalizeAnswer(question('q', 'location'), { lat: 34.3 })).toEqual({
      error: 'INVALID_VALUE',
    });
  });

  it('should reject file answers without a server reference', () => {
    expect(
      normalizeAnswer(question('q', 'file'), [
        { name: 'a.png', mimeType: 'image/png', sizeBytes: 10 },
      ]),
    ).toEqual({ error: 'INVALID_FILE' });
  });

  it('should cap hostile oversized text instead of storing it', () => {
    const result = normalizeAnswer(
      question('q', 'long_text'),
      'x'.repeat(50000),
    );

    expect('value' in result && (result.value as string).length).toBe(10000);
  });
});

describe('isAnswerPresent', () => {
  it('should treat whitespace text as unanswered', () => {
    expect(isAnswerPresent(question('q', 'short_text'), '   ')).toBe(false);
  });

  it('should treat an unchecked consent box as unanswered', () => {
    expect(isAnswerPresent(question('q', 'consent'), false)).toBe(false);
  });

  it('should treat "Other" without text as unanswered', () => {
    expect(
      isAnswerPresent(question('q', 'single_choice'), { choiceId: '__other' }),
    ).toBe(false);
  });

  it('should treat a manual location description as answered', () => {
    expect(
      isAnswerPresent(question('q', 'location'), {
        source: 'MANUAL',
        description: 'near the blue mosque',
      }),
    ).toBe(true);
  });
});
