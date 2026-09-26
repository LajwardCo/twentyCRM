// Which answer columns the responses table shows, remembered per form on this
// device. Storage can be unavailable (private mode, quota) — the table then
// just falls back to its default columns.

const STORAGE_PREFIX = 'svr-columns:';

export const DEFAULT_ANSWER_COLUMNS = 3;

export const loadColumnChoice = (formId: string): string[] | null => {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${formId}`);

    if (raw === null) return null;

    const parsed: unknown = JSON.parse(raw);

    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')
      ? parsed
      : null;
  } catch {
    return null;
  }
};

export const saveColumnChoice = (formId: string, questionIds: string[]): void => {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${formId}`, JSON.stringify(questionIds));
  } catch {
    // Not persisted; the choice still applies for this visit.
  }
};

// Stored ids of questions that no longer exist in any version are dropped;
// with no stored choice the first few questions are shown.
export const resolveColumnChoice = (
  stored: string[] | null,
  availableIds: string[],
): string[] =>
  stored === null
    ? availableIds.slice(0, DEFAULT_ANSWER_COLUMNS)
    : stored.filter((questionId) => availableIds.includes(questionId));
