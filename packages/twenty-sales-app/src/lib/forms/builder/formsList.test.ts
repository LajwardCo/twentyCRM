import { describe, expect, it } from 'vitest';

import { type SurveyFormSummary } from '../../../api/surveys';
import { DEFAULT_FORMS_FILTERS, filterForms, statusActionsFor } from './formsList';

const form = (
  id: string,
  extra: Partial<SurveyFormSummary> = {},
): SurveyFormSummary => ({
  id,
  name: id,
  formStatus: 'DRAFT',
  purpose: 'OTHER',
  description: '',
  currentVersionNumber: 0,
  hasUnpublishedChanges: true,
  publicSlug: 'x',
  publicEnabled: true,
  opensAt: null,
  closesAt: null,
  responseLimit: null,
  campaignIds: [],
  updatedAt: '2026-09-01T00:00:00Z',
  createdAt: '2026-09-01T00:00:00Z',
  owner: null,
  publishedVersion: null,
  ...extra,
});

const forms = [
  form('نظرسنجی دواخانه', { formStatus: 'PUBLISHED', updatedAt: '2026-09-03T00:00:00Z', purpose: 'FIELD_SURVEY' }),
  form('درخواست دمو', { formStatus: 'CLOSED', updatedAt: '2026-09-02T00:00:00Z', campaignIds: ['c1'] }),
  form('قدیمی', { formStatus: 'ARCHIVED', updatedAt: '2026-09-04T00:00:00Z' }),
  form('Alpha', {
    owner: { id: 'm1', name: { firstName: 'A', lastName: 'B' } },
    updatedAt: '2026-08-01T00:00:00Z',
  }),
];
const names = (list: SurveyFormSummary[]) => list.map((item) => item.name);

describe('forms list', () => {
  it('should hide archived forms by default and sort by last change', () => {
    expect(names(filterForms(forms, {}, DEFAULT_FORMS_FILTERS))).toEqual([
      'نظرسنجی دواخانه',
      'درخواست دمو',
      'Alpha',
    ]);
  });

  it('should show archived forms only when asked', () => {
    expect(names(filterForms(forms, {}, { ...DEFAULT_FORMS_FILTERS, status: 'ARCHIVED' }))).toEqual([
      'قدیمی',
    ]);
    expect(filterForms(forms, {}, { ...DEFAULT_FORMS_FILTERS, status: 'ALL' })).toHaveLength(4);
  });

  it('should filter by search words, owner, purpose and campaign', () => {
    expect(names(filterForms(forms, {}, { ...DEFAULT_FORMS_FILTERS, search: 'دمو' }))).toEqual([
      'درخواست دمو',
    ]);
    expect(names(filterForms(forms, {}, { ...DEFAULT_FORMS_FILTERS, ownerId: 'm1' }))).toEqual([
      'Alpha',
    ]);
    expect(
      names(filterForms(forms, {}, { ...DEFAULT_FORMS_FILTERS, purpose: 'FIELD_SURVEY' })),
    ).toEqual(['نظرسنجی دواخانه']);
    expect(names(filterForms(forms, {}, { ...DEFAULT_FORMS_FILTERS, campaignId: 'c1' }))).toEqual([
      'درخواست دمو',
    ]);
  });

  it('should sort by responses, then by last change', () => {
    const counts = { Alpha: 9, 'درخواست دمو': 9, 'نظرسنجی دواخانه': 1 };

    expect(names(filterForms(forms, counts, { ...DEFAULT_FORMS_FILTERS, sort: 'responses' }))).toEqual([
      'درخواست دمو',
      'Alpha',
      'نظرسنجی دواخانه',
    ]);
  });

  it('should offer only the transitions the server allows', () => {
    const kinds = (status: SurveyFormSummary['formStatus'], version = 0) =>
      statusActionsFor({ formStatus: status, currentVersionNumber: version }).map(
        (action) => `${action.kind}:${action.to}`,
      );

    expect(kinds('DRAFT')).toEqual(['archive:ARCHIVED']);
    expect(kinds('PUBLISHED')).toEqual(['close:CLOSED', 'archive:ARCHIVED']);
    expect(kinds('CLOSED')).toEqual(['reopen:PUBLISHED', 'archive:ARCHIVED']);
    expect(kinds('ARCHIVED')).toEqual(['unarchive:DRAFT']);
    expect(kinds('ARCHIVED', 2)).toEqual(['unarchive:CLOSED']);
  });
});
