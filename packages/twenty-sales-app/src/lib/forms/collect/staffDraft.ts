import { type BuyingInterest, type LocationValue } from '../../../api/surveys';
import { newSubmissionKey } from './publicSession';

// A staff member's in-progress response, kept in localStorage on the device
// (there is no offline sync — the badge says so until the server confirms).
// The submission key is created once per draft and reused by every save, so a
// retry after a dropped reply finds the record instead of creating another.
// Keys carry the signed-in member's id: phones are shared, and one person's
// draft (and its response id) must never surface for the next person. The
// version is not part of the key — the draft records it, so a draft started
// before a republish is still found and finished on its own version.

export type FieldData = {
  buyingInterest: BuyingInterest | null;
  city: string;
  area: string;
  location: LocationValue | null;
};

export type StaffDraft = {
  submissionKey: string;
  versionId: string;
  answers: Record<string, unknown>;
  fieldData: FieldData;
  // Set once the server has the response; later saves update it.
  responseId: string | null;
  // fileId → attachment id, so a retried save never attaches a file twice.
  attachments: Record<string, string>;
  // Edits made since the last successful save exist only on this device.
  dirty: boolean;
  savedAt: string | null;
};

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const EMPTY_FIELD_DATA: FieldData = {
  buyingInterest: null,
  city: '',
  area: '',
  location: null,
};

export const staffDraftKey = (memberId: string, scope: string): string =>
  `svc-draft:${memberId}:${scope}`;

export const paperMetaKey = (memberId: string, formId: string): string =>
  `svc-paper-meta:${memberId}:${formId}`;

// Everything the survey screens keep on the device for a signed-in member:
// staff drafts, paper-sheet details and the visit in progress. (The public
// form's sessionStorage is per link and holds no staff data.)
const SURVEY_DEVICE_PREFIXES = ['svc-draft:', 'svc-paper-meta:', 'svc-visit:'];

type EnumerableStorage = Pick<Storage, 'length' | 'key' | 'removeItem'>;

// Signing out (or an expired session) hands the device to whoever signs in
// next, so no survey draft may outlive the session.
export const clearSurveyDrafts = (given?: EnumerableStorage | null): void => {
  try {
    const storage = given === undefined ? window.localStorage : given;

    if (storage === null) return;

    const keys: string[] = [];

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);

      if (key !== null && SURVEY_DEVICE_PREFIXES.some((prefix) => key.startsWith(prefix))) keys.push(key);
    }

    for (const key of keys) storage.removeItem(key);
  } catch {
    // storage unavailable: nothing was kept
  }
};

export const newStaffDraft = (
  versionId: string,
  seed: Partial<Pick<StaffDraft, 'answers' | 'fieldData'>> = {},
): StaffDraft => ({
  submissionKey: newSubmissionKey(),
  versionId,
  answers: seed.answers ?? {},
  fieldData: seed.fieldData ?? EMPTY_FIELD_DATA,
  responseId: null,
  attachments: {},
  dirty: false,
  savedAt: null,
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const INTERESTS: BuyingInterest[] = ['INTERESTED', 'UNDECIDED', 'NOT_INTERESTED'];

const parseFieldData = (raw: unknown): FieldData => {
  if (!isObject(raw)) return EMPTY_FIELD_DATA;

  const location = isObject(raw.location) &&
    (raw.location.source === 'GPS' || raw.location.source === 'MANUAL')
    ? (raw.location as LocationValue)
    : null;

  return {
    buyingInterest: INTERESTS.find((interest) => interest === raw.buyingInterest) ?? null,
    city: typeof raw.city === 'string' ? raw.city : '',
    area: typeof raw.area === 'string' ? raw.area : '',
    location,
  };
};

export const parseStaffDraft = (raw: string | null): StaffDraft | null => {
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);

    if (
      !isObject(parsed) ||
      typeof parsed.submissionKey !== 'string' ||
      typeof parsed.versionId !== 'string' ||
      parsed.versionId === '' ||
      !isObject(parsed.answers)
    ) {
      return null;
    }

    const versionId = parsed.versionId;

    const attachments = isObject(parsed.attachments)
      ? Object.fromEntries(
          Object.entries(parsed.attachments).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : {};

    return {
      submissionKey: parsed.submissionKey,
      versionId,
      answers: parsed.answers,
      fieldData: parseFieldData(parsed.fieldData),
      responseId: typeof parsed.responseId === 'string' ? parsed.responseId : null,
      attachments,
      dirty: parsed.dirty === true,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : null,
    };
  } catch {
    return null;
  }
};

export const loadStaffDraft = (storage: KeyValueStorage | null, key: string): StaffDraft | null => {
  try {
    return parseStaffDraft(storage?.getItem(key) ?? null);
  } catch {
    return null;
  }
};

// Which version a draft worth restoring was started on, if there is one.
export const storedDraftVersionId = (storage: KeyValueStorage | null, key: string): string | null => {
  const stored = loadStaffDraft(storage, key);

  return stored !== null && draftHasContent(stored) ? stored.versionId : null;
};

// The draft to open for `versionId`. A draft of another version reaches here
// only when that version could not be loaded; its answers carry over (the
// renderer drops ids the version lacks) under a new submission key.
export const restoreStaffDraft = (
  stored: StaffDraft | null,
  versionId: string,
): { draft: StaffDraft; restored: boolean } => {
  if (stored === null || !draftHasContent(stored)) return { draft: newStaffDraft(versionId), restored: false };
  if (stored.versionId === versionId) return { draft: stored, restored: true };

  return {
    draft: newStaffDraft(versionId, { answers: stored.answers, fieldData: stored.fieldData }),
    restored: true,
  };
};

export const saveStaffDraft = (
  storage: KeyValueStorage | null,
  key: string,
  draft: StaffDraft,
): void => {
  try {
    storage?.setItem(key, JSON.stringify(draft));
  } catch {
    // quota / privacy mode: the screen still holds the draft in memory
  }
};

export const clearStaffDraft = (storage: KeyValueStorage | null, key: string): void => {
  try {
    storage?.removeItem(key);
  } catch {
    // nothing to clear
  }
};

// Anything worth restoring? A fresh draft with nothing typed is not.
export const draftHasContent = (draft: StaffDraft): boolean =>
  Object.keys(draft.answers).length > 0 ||
  draft.responseId !== null ||
  draft.fieldData.buyingInterest !== null ||
  draft.fieldData.city !== '' ||
  draft.fieldData.area !== '' ||
  draft.fieldData.location !== null;

export const safeLocalStorage = (): KeyValueStorage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const safeSessionStorage = (): KeyValueStorage | null => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};
