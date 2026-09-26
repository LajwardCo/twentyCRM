import { createEmptyFormDefinition } from '@shared/surveys';
import { describe, expect, it } from 'vitest';

import { type SurveyForm } from '../../../api/surveys';
import {
  buildSettingsPatch,
  isoToLocalInput,
  localInputToIso,
  settingsDraftFrom,
  settingsProblems,
} from './settingsForm';

const form: SurveyForm = {
  id: 'f1',
  name: 'فرم',
  formStatus: 'DRAFT',
  purpose: 'FEEDBACK',
  description: '',
  currentVersionNumber: 0,
  hasUnpublishedChanges: true,
  publicSlug: 'abc',
  publicEnabled: true,
  opensAt: '2026-09-26T05:30:00.000Z',
  closesAt: null,
  responseLimit: null,
  campaignIds: ['c1', 'c2'],
  updatedAt: '',
  createdAt: '',
  owner: { id: 'm1', name: { firstName: 'A', lastName: 'B' } },
  publishedVersion: null,
  draftDefinition: createEmptyFormDefinition('fa'),
  draftRevision: 0,
  draftUpdatedAt: null,
};

describe('settings form', () => {
  it('should round-trip dates through the picker format', () => {
    const local = isoToLocalInput(form.opensAt);

    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(localInputToIso(local)).toBe(form.opensAt);
    expect(isoToLocalInput(null)).toBe('');
    expect(localInputToIso('')).toBeNull();
  });

  it('should send nothing when nothing changed', () => {
    expect(buildSettingsPatch(form, settingsDraftFrom(form))).toEqual({});
  });

  it('should send only the changed fields', () => {
    const draft = {
      ...settingsDraftFrom(form),
      name: '  نام تازه ',
      campaignIds: ['c2', 'c1'],
      closesAt: '2026-10-01T09:00',
      responseLimit: 50,
    };
    const patch = buildSettingsPatch(form, draft);

    expect(patch).toEqual({
      name: 'نام تازه',
      closesAt: localInputToIso('2026-10-01T09:00'),
      responseLimit: 50,
    });
  });

  it('should flag an empty name and a close date before the open date', () => {
    const draft = { ...settingsDraftFrom(form), name: ' ', closesAt: '2020-01-01T09:00' };

    expect(settingsProblems(draft)).toEqual(['NAME_REQUIRED', 'CLOSE_BEFORE_OPEN']);
  });
});
