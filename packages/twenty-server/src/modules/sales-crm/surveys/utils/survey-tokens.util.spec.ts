import {
  generateBase62Code,
  generateSecretToken,
  hashSecretToken,
  isWellFormedPublicSlug,
  isWellFormedSecretToken,
} from 'src/modules/sales-crm/surveys/utils/survey-tokens.util';

describe('survey tokens', () => {
  it('should generate public slugs of the expected shape', () => {
    const slug = generateBase62Code(12);

    expect(isWellFormedPublicSlug(slug)).toBe(true);
    expect(generateBase62Code(12)).not.toBe(slug);
  });

  it('should generate secret tokens that pass the format check', () => {
    expect(isWellFormedSecretToken(generateSecretToken())).toBe(true);
  });

  it('should reject malformed tokens and slugs before any lookup', () => {
    expect(isWellFormedSecretToken('short')).toBe(false);
    expect(isWellFormedSecretToken({})).toBe(false);
    expect(isWellFormedPublicSlug("abc'; drop")).toBe(false);
  });

  it('should hash deterministically without returning the token', () => {
    const token = generateSecretToken();

    expect(hashSecretToken(token)).toBe(hashSecretToken(token));
    expect(hashSecretToken(token)).not.toContain(token);
    expect(hashSecretToken(token)).toHaveLength(64);
  });
});
