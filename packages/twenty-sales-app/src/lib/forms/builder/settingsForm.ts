import {
  type FormSettingsPatch,
  type SurveyForm,
  type SurveyPurpose,
} from '../../../api/surveys';

// The Settings tab edits record fields (not the draft), saved explicitly.

export type SettingsDraft = {
  name: string;
  purpose: SurveyPurpose;
  description: string;
  ownerId: string;
  publicEnabled: boolean;
  // "yyyy-mm-ddThh:mm" in local time, '' for none (JalaliDatePicker format).
  opensAt: string;
  closesAt: string;
  responseLimit: number | null;
  campaignIds: string[];
};

const pad = (value: number) => String(value).padStart(2, '0');

export const isoToLocalInput = (iso: string | null): string => {
  if (iso === null || iso === '') return '';

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return '';

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const localInputToIso = (value: string): string | null => {
  if (value === '') return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const settingsDraftFrom = (form: SurveyForm): SettingsDraft => ({
  name: form.name,
  purpose: form.purpose ?? 'OTHER',
  description: form.description,
  ownerId: form.owner?.id ?? '',
  publicEnabled: form.publicEnabled,
  opensAt: isoToLocalInput(form.opensAt),
  closesAt: isoToLocalInput(form.closesAt),
  responseLimit: form.responseLimit,
  campaignIds: form.campaignIds,
});

// Only what changed is sent, so a save never clobbers a field someone else
// edited meanwhile.
export const buildSettingsPatch = (form: SurveyForm, draft: SettingsDraft): FormSettingsPatch => {
  const original = settingsDraftFrom(form);
  const patch: FormSettingsPatch = {};

  if (draft.name.trim() !== original.name) patch.name = draft.name.trim();
  if (draft.purpose !== original.purpose) patch.purpose = draft.purpose;
  if (draft.description !== original.description) patch.description = draft.description;
  if (draft.ownerId !== original.ownerId && draft.ownerId !== '') patch.ownerId = draft.ownerId;
  if (draft.publicEnabled !== original.publicEnabled) patch.publicEnabled = draft.publicEnabled;
  if (draft.opensAt !== original.opensAt) patch.opensAt = localInputToIso(draft.opensAt);
  if (draft.closesAt !== original.closesAt) patch.closesAt = localInputToIso(draft.closesAt);
  if (draft.responseLimit !== original.responseLimit) patch.responseLimit = draft.responseLimit;
  if ([...draft.campaignIds].sort().join() !== [...original.campaignIds].sort().join()) {
    patch.campaignIds = draft.campaignIds;
  }

  return patch;
};

export type SettingsProblem = 'NAME_REQUIRED' | 'CLOSE_BEFORE_OPEN';

export const settingsProblems = (draft: SettingsDraft): SettingsProblem[] => {
  const problems: SettingsProblem[] = [];

  if (draft.name.trim() === '') problems.push('NAME_REQUIRED');

  const opens = localInputToIso(draft.opensAt);
  const closes = localInputToIso(draft.closesAt);

  if (opens !== null && closes !== null && closes <= opens) problems.push('CLOSE_BEFORE_OPEN');

  return problems;
};
