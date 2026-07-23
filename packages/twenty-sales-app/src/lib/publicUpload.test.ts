import { describe, expect, it } from 'vitest';

import {
  buildPublicUploadUrl,
  parseUploadTokenFromHash,
  secondsUntil,
} from './publicUpload';

describe('buildPublicUploadUrl', () => {
  it('builds the login-free /sales/#/upload URL with the token in the hash', () => {
    expect(buildPublicUploadUrl('https://crm.hamagan.com', 'abc.def.ghi')).toBe(
      'https://crm.hamagan.com/sales/#/upload?t=abc.def.ghi',
    );
  });

  it('strips a trailing slash on the origin so it never doubles', () => {
    expect(buildPublicUploadUrl('https://crm.hamagan.com/', 'tok')).toBe(
      'https://crm.hamagan.com/sales/#/upload?t=tok',
    );
  });

  it('url-encodes tokens that contain reserved characters', () => {
    expect(buildPublicUploadUrl('https://x.io', 'a b+c/d=e')).toBe(
      'https://x.io/sales/#/upload?t=a%20b%2Bc%2Fd%3De',
    );
  });
});

describe('parseUploadTokenFromHash', () => {
  it('extracts the token from a #/upload?t=... hash', () => {
    expect(parseUploadTokenFromHash('#/upload?t=abc.def.ghi')).toBe(
      'abc.def.ghi',
    );
  });

  it('decodes an encoded token', () => {
    expect(parseUploadTokenFromHash('#/upload?t=a%20b%3De')).toBe('a b=e');
  });

  it('returns null when there is no query part', () => {
    expect(parseUploadTokenFromHash('#/upload')).toBeNull();
  });

  it('returns null when the token param is absent or empty', () => {
    expect(parseUploadTokenFromHash('#/upload?foo=bar')).toBeNull();
    expect(parseUploadTokenFromHash('#/upload?t=')).toBeNull();
  });
});

describe('secondsUntil', () => {
  it('returns whole seconds remaining until expiry', () => {
    const now = Date.parse('2026-07-23T10:00:00.000Z');
    expect(secondsUntil('2026-07-23T10:20:00.000Z', now)).toBe(1200);
  });

  it('clamps to 0 once expired', () => {
    const now = Date.parse('2026-07-23T10:21:00.000Z');
    expect(secondsUntil('2026-07-23T10:20:00.000Z', now)).toBe(0);
  });
});
