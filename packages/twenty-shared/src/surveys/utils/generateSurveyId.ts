const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Short, stable, non-sequential ids for questions, choices, pages and rules.
// They are independent of labels and positions so answers survive edits.
export const generateSurveyId = (prefix: string, length = 8): string => {
  const bytes = new Uint8Array(length);

  globalThis.crypto.getRandomValues(bytes);

  let id = '';

  for (const byte of bytes) {
    id += ALPHABET[byte % ALPHABET.length];
  }

  return `${prefix}_${id}`;
};
