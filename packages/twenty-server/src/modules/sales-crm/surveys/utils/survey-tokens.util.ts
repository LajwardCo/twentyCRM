import { createHash, randomBytes } from 'crypto';

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Unbiased base62: bytes >= 248 are rejected so every character is equally
// likely (248 = 4 * 62).
export const generateBase62Code = (length: number): string => {
  let code = '';

  while (code.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < 248 && code.length < length) {
        code += BASE62[byte % 62];
      }
    }
  }

  return code;
};

// Invitation / upload tokens: 32 random bytes. Only the hash is stored, so a
// database read never yields a usable link.
export const generateSecretToken = (): string =>
  randomBytes(32).toString('base64url');

export const hashSecretToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

export const isWellFormedSecretToken = (token: unknown): token is string =>
  typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);

export const isWellFormedPublicSlug = (slug: unknown): slug is string =>
  typeof slug === 'string' && /^[A-Za-z0-9]{12}$/.test(slug);
