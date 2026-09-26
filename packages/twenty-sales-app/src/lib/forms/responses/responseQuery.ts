import {
  type CompletionStatus,
  type ResponseFilter,
  type ReviewStatus,
  type SurveySource,
} from '../../../api/surveys';

// The responses table's filters, as they live in the URL. Kept as plain
// strings (what a <select> or an input holds) so the view can bind them
// directly; toApiFilter turns them into the record-API filter.

// '' = every status except SPAM (the default: spam is noise in daily review),
// 'ALL' = include spam too.
export type ReviewFilter = '' | 'ALL' | ReviewStatus;

export type ResponseViewFilter = {
  formId: string;
  version: string;
  campaignId: string;
  from: string;
  to: string;
  source: '' | SurveySource;
  collectorId: string;
  city: string;
  area: string;
  completion: '' | CompletionStatus;
  review: ReviewFilter;
  linkage: '' | 'LINKED' | 'UNLINKED';
  search: string;
};

export const EMPTY_VIEW_FILTER: ResponseViewFilter = {
  formId: '',
  version: '',
  campaignId: '',
  from: '',
  to: '',
  source: '',
  collectorId: '',
  city: '',
  area: '',
  completion: '',
  review: '',
  linkage: '',
  search: '',
};

// URL parameter name per filter field; short so shared links stay readable.
const PARAMS: Record<keyof ResponseViewFilter, string> = {
  formId: 'form',
  version: 'v',
  campaignId: 'campaign',
  from: 'from',
  to: 'to',
  source: 'source',
  collectorId: 'collector',
  city: 'city',
  area: 'area',
  completion: 'completion',
  review: 'review',
  linkage: 'crm',
  search: 'q',
};

const SOURCES: SurveySource[] = ['PUBLIC_LINK', 'INVITATION', 'STAFF_VISIT', 'PAPER'];
const COMPLETIONS: CompletionStatus[] = ['PARTIAL', 'COMPLETED'];
const REVIEWS: ReviewStatus[] = ['NEW', 'NEEDS_REVIEW', 'REVIEWED', 'ACTIONED', 'SPAM'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const oneOf = <TValue extends string>(value: string, allowed: readonly TValue[]): TValue | '' =>
  (allowed as readonly string[]).includes(value) ? (value as TValue) : '';

// A hand-edited or stale link must never produce an invalid API filter, so
// every value is checked against what the field can hold.
export const parseViewFilter = (query: string): ResponseViewFilter => {
  const params = new URLSearchParams(query);
  const read = (key: keyof ResponseViewFilter) => (params.get(PARAMS[key]) ?? '').trim();
  const id = (key: keyof ResponseViewFilter) => {
    const value = read(key);

    return UUID_PATTERN.test(value) ? value : '';
  };
  const date = (key: keyof ResponseViewFilter) => {
    const value = read(key);

    return DATE_PATTERN.test(value) ? value : '';
  };
  const review = read('review');
  const version = read('version');
  const formId = id('formId');

  return {
    formId,
    // A version only means something within one form.
    version: formId !== '' && /^\d+$/.test(version) ? version : '',
    campaignId: id('campaignId'),
    from: date('from'),
    to: date('to'),
    source: oneOf(read('source'), SOURCES),
    collectorId: id('collectorId'),
    city: read('city'),
    area: read('area'),
    completion: oneOf(read('completion'), COMPLETIONS),
    review: review === 'ALL' ? 'ALL' : oneOf(review, REVIEWS),
    linkage: oneOf(read('linkage'), ['LINKED', 'UNLINKED'] as const),
    search: read('search'),
  };
};

// Only non-default values are written, in a fixed order, so the same filter
// always produces the same URL.
export const serializeViewFilter = (filter: ResponseViewFilter): string => {
  const params = new URLSearchParams();

  for (const key of Object.keys(PARAMS) as (keyof ResponseViewFilter)[]) {
    const value = filter[key].trim();

    if (value !== '') params.set(PARAMS[key], value);
  }

  return params.toString();
};

export const countActiveFilters = (
  filter: ResponseViewFilter,
  fixedKeys: (keyof ResponseViewFilter)[] = [],
): number =>
  (Object.keys(filter) as (keyof ResponseViewFilter)[]).filter(
    (key) => key !== 'search' && !fixedKeys.includes(key) && filter[key] !== '',
  ).length;

// Date inputs hold a calendar day; the range covers the whole of both days in
// the viewer's own time zone.
const startOfDay = (day: string): string => {
  const [year, month, date] = day.split('-').map(Number);

  return new Date(year, month - 1, date, 0, 0, 0, 0).toISOString();
};

const endOfDay = (day: string): string => {
  const [year, month, date] = day.split('-').map(Number);

  return new Date(year, month - 1, date, 23, 59, 59, 999).toISOString();
};

export type ApiResponseQuery = {
  filter: ResponseFilter;
  excludeSpam: boolean;
};

export const toApiFilter = (filter: ResponseViewFilter): ApiResponseQuery => {
  const apiFilter: ResponseFilter = {};

  if (filter.formId !== '') apiFilter.formId = filter.formId;
  if (filter.formId !== '' && filter.version !== '') apiFilter.versionNumber = Number(filter.version);
  if (filter.campaignId !== '') apiFilter.campaignId = filter.campaignId;
  if (filter.source !== '') apiFilter.source = filter.source;
  if (filter.collectorId !== '') apiFilter.collectorId = filter.collectorId;
  if (filter.completion !== '') apiFilter.completionStatus = filter.completion;
  if (filter.review !== '' && filter.review !== 'ALL') apiFilter.reviewStatus = filter.review;
  if (filter.city.trim() !== '') apiFilter.city = filter.city.trim();
  if (filter.area.trim() !== '') apiFilter.area = filter.area.trim();
  if (filter.linkage !== '') apiFilter.linkage = filter.linkage;
  if (filter.search.trim() !== '') apiFilter.search = filter.search.trim();
  if (filter.from !== '') apiFilter.from = startOfDay(filter.from);
  if (filter.to !== '') apiFilter.to = endOfDay(filter.to);

  return { filter: apiFilter, excludeSpam: filter.review === '' };
};
