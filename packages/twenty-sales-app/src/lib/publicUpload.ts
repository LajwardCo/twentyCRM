// Pure helpers for the QR-to-mobile public upload flow. Kept dependency-free
// (no window / no client imports) so they are trivially unit-testable.

// The public upload page lives inside the same SPA, under the login-free
// `#/upload` hash route. The token rides in the hash fragment (NOT the query
// string) so browsers never put it on the request line or in Referer headers.
export const buildPublicUploadUrl = (origin: string, token: string): string =>
  `${origin.replace(/\/$/, '')}/sales/#/upload?t=${encodeURIComponent(token)}`;

// Reads the upload token out of a hash like "#/upload?t=<jwt>".
export const parseUploadTokenFromHash = (hash: string): string | null => {
  const questionMarkIndex = hash.indexOf('?');
  if (questionMarkIndex === -1) return null;
  const params = new URLSearchParams(hash.slice(questionMarkIndex + 1));
  const token = params.get('t');
  return token !== null && token.length > 0 ? token : null;
};

// Whole-minutes-and-seconds left until `expiresAt` (ISO string), clamped at 0.
export const secondsUntil = (expiresAt: string, nowMs: number): number => {
  const diffMs = new Date(expiresAt).getTime() - nowMs;
  return diffMs > 0 ? Math.floor(diffMs / 1000) : 0;
};
