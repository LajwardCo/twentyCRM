import {
  type SurveyFormStatus,
  type SurveyFormSummary,
  type SurveyPurpose,
} from '../../../api/surveys';

// Forms list filtering/sorting and the status transitions the server allows.

export type StatusFilter = 'ACTIVE' | 'ALL' | SurveyFormStatus;
export type FormsSort = 'updated' | 'name' | 'responses';

export type FormsListFilters = {
  search: string;
  status: StatusFilter;
  ownerId: string;
  purpose: SurveyPurpose | '';
  campaignId: string;
  sort: FormsSort;
};

export const DEFAULT_FORMS_FILTERS: FormsListFilters = {
  search: '',
  status: 'ACTIVE',
  ownerId: '',
  purpose: '',
  campaignId: '',
  sort: 'updated',
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/‌/g, ' ')
    .trim();

export const filterForms = (
  forms: SurveyFormSummary[],
  responseCounts: Record<string, number>,
  filters: FormsListFilters,
): SurveyFormSummary[] => {
  const words = normalize(filters.search).split(/\s+/).filter((word) => word !== '');

  const matching = forms.filter((form) => {
    if (filters.status === 'ACTIVE' && form.formStatus === 'ARCHIVED') return false;
    if (filters.status !== 'ACTIVE' && filters.status !== 'ALL' && form.formStatus !== filters.status) {
      return false;
    }
    if (filters.ownerId !== '' && form.owner?.id !== filters.ownerId) return false;
    if (filters.purpose !== '' && form.purpose !== filters.purpose) return false;
    if (filters.campaignId !== '' && !form.campaignIds.includes(filters.campaignId)) return false;

    if (words.length > 0) {
      const haystack = normalize(`${form.name} ${form.description}`);

      if (!words.every((word) => haystack.includes(word))) return false;
    }

    return true;
  });

  const byUpdated = (a: SurveyFormSummary, b: SurveyFormSummary) =>
    (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');

  return [...matching].sort((a, b) => {
    if (filters.sort === 'name') return a.name.localeCompare(b.name, 'fa');
    if (filters.sort === 'responses') {
      const difference = (responseCounts[b.id] ?? 0) - (responseCounts[a.id] ?? 0);

      return difference !== 0 ? difference : byUpdated(a, b);
    }

    return byUpdated(a, b);
  });
};

export type StatusActionKind = 'close' | 'reopen' | 'archive' | 'unarchive';

export type StatusAction = { kind: StatusActionKind; to: SurveyFormStatus };

// Mirrors the server's transitions. Publishing a draft is not a status
// change — it goes through the publish endpoint, which creates a version.
export const statusActionsFor = (
  form: Pick<SurveyFormSummary, 'formStatus' | 'currentVersionNumber'>,
): StatusAction[] => {
  switch (form.formStatus) {
    case 'DRAFT':
      return [{ kind: 'archive', to: 'ARCHIVED' }];
    case 'PUBLISHED':
      return [
        { kind: 'close', to: 'CLOSED' },
        { kind: 'archive', to: 'ARCHIVED' },
      ];
    case 'CLOSED':
      return [
        { kind: 'reopen', to: 'PUBLISHED' },
        { kind: 'archive', to: 'ARCHIVED' },
      ];
    case 'ARCHIVED':
      // A form that was never published goes back to being a draft; one
      // with versions comes back closed so it does not reopen by surprise.
      return [
        { kind: 'unarchive', to: form.currentVersionNumber > 0 ? 'CLOSED' : 'DRAFT' },
      ];
  }
};

export const copyName = (name: string): string => `کپی از ${name}`;
