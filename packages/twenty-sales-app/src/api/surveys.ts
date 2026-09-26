import {
  type AnswerValue,
  type FileAnswer,
  type FormDefinition,
  type FormEnding,
  type PublishIssue,
} from '@shared/surveys';

import { ApiError, coreQuery, loadTokens } from './client';

// Data access for Surveys & Forms. Record CRUD goes through the record API
// (the server's query hooks validate every write); publishing, status
// changes, invitations and automations go through /rest/sales/surveys; the
// login-free form uses /public/forms. See
// docs/superpowers/specs/2026-09-26-surveys-forms-design.md.

export type SurveyFormStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'ARCHIVED';
export type SurveyPurpose =
  | 'FIELD_SURVEY'
  | 'DEMO_REQUEST'
  | 'FEEDBACK'
  | 'QUALIFICATION'
  | 'OTHER';
export type SurveySource = 'PUBLIC_LINK' | 'INVITATION' | 'STAFF_VISIT' | 'PAPER';
export type CompletionStatus = 'PARTIAL' | 'COMPLETED';
export type ReviewStatus = 'NEW' | 'NEEDS_REVIEW' | 'REVIEWED' | 'ACTIONED' | 'SPAM';
export type BuyingInterest = 'INTERESTED' | 'UNDECIDED' | 'NOT_INTERESTED';
export type VisitOutcome =
  | 'COMPLETED'
  | 'BUSINESS_CLOSED'
  | 'MANAGER_UNAVAILABLE'
  | 'DECLINED'
  | 'REVISIT_NEEDED';
export type CampaignStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export type SurveyCapabilities = {
  supported: boolean;
  canViewForms: boolean;
  canBuild: boolean;
  canPublish: boolean;
  canManageCampaigns: boolean;
  canCollect: boolean;
  canInvite: boolean;
  canEditResponses: boolean;
  canExport: boolean;
};

export const NO_SURVEY_CAPABILITIES: SurveyCapabilities = {
  supported: false,
  canViewForms: false,
  canBuild: false,
  canPublish: false,
  canManageCampaigns: false,
  canCollect: false,
  canInvite: false,
  canEditResponses: false,
  canExport: false,
};

type MemberRef = { id: string; name: { firstName: string; lastName: string } };

export type SurveyFormSummary = {
  id: string;
  name: string;
  formStatus: SurveyFormStatus;
  purpose: SurveyPurpose | null;
  description: string;
  currentVersionNumber: number;
  hasUnpublishedChanges: boolean;
  publicSlug: string;
  publicEnabled: boolean;
  opensAt: string | null;
  closesAt: string | null;
  responseLimit: number | null;
  campaignIds: string[];
  updatedAt: string;
  createdAt: string;
  owner: MemberRef | null;
  publishedVersion: {
    id: string;
    versionNumber: number;
    printCode: string;
    publishedAt: string;
  } | null;
};

export type SurveyForm = SurveyFormSummary & {
  draftDefinition: FormDefinition;
  draftRevision: number;
  draftUpdatedAt: string | null;
};

export type SurveyFormVersion = {
  id: string;
  formId: string;
  versionNumber: number;
  definition: FormDefinition;
  publishedAt: string;
  changeNote: string;
  printCode: string;
  publishedBy: MemberRef | null;
};

export type SurveyCrmAction = {
  key: string;
  type: string;
  status: 'DONE' | 'FAILED' | 'SUGGESTED';
  at: string;
  by: string | null;
  recordId?: string | null;
  target?: string;
  error?: string;
};

export type LocationValue = {
  lat?: number;
  lng?: number;
  accuracy?: number;
  source: 'GPS' | 'MANUAL';
  description?: string;
};

export type SurveyResponse = {
  id: string;
  name: string;
  formId: string;
  formVersionId: string;
  versionNumber: number;
  submissionKey: string;
  answers: Record<string, AnswerValue>;
  skippedByLogic: string[];
  language: string;
  completionStatus: CompletionStatus;
  reviewStatus: ReviewStatus;
  source: SurveySource;
  collectedAt: string | null;
  submittedAt: string | null;
  enteredAt: string | null;
  paperReference: string;
  paperReviewNotes: string;
  buyingInterest: BuyingInterest | null;
  city: string;
  area: string;
  location: LocationValue | null;
  crmActions: SurveyCrmAction[];
  createdAt: string;
  updatedAt: string;
  form: { id: string; name: string } | null;
  collector: MemberRef | null;
  enteredBy: MemberRef | null;
  company: { id: string; name: string } | null;
  person: { id: string; name: { firstName: string; lastName: string } } | null;
  opportunity: { id: string; name: string; stage: string | null } | null;
  campaign: { id: string; name: string } | null;
  visit: { id: string; title: string; visitOutcome: VisitOutcome | null } | null;
};

export type SurveyCampaign = {
  id: string;
  name: string;
  description: string;
  campaignStatus: CampaignStatus;
  startsAt: string | null;
  endsAt: string | null;
  city: string;
  areas: string[];
  assigneeIds: string[];
  targetResponses: number | null;
  channels: SurveySource[];
  publicCode: string;
  formIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type PublishResult = {
  versionId: string;
  versionNumber: number;
  printCode: string;
  publicSlug: string;
};

export type PublicFormState =
  | 'OPEN'
  | 'NOT_YET_OPEN'
  | 'CLOSED'
  | 'EXPIRED'
  | 'LIMIT_REACHED'
  | 'INVALID';

export type PublicForm = {
  state: PublicFormState;
  title?: string;
  versionNumber?: number;
  definition?: FormDefinition;
};

export type PublicSubmissionResult = {
  ok: true;
  ending: Pick<FormEnding, 'title' | 'message'> | null;
};

// ---- errors -------------------------------------------------------------

export class SurveyRequestError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(message: string, status: number, code: string, details: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Query hooks reject writes with a stable tag at the start of the message.
export type SurveyErrorTag =
  | 'SURVEY_DRAFT_CONFLICT'
  | 'SURVEY_ENDPOINT_ONLY'
  | 'SURVEY_INVALID_ANSWERS'
  | 'SURVEY_DUPLICATE_PAPER_REFERENCE'
  | 'SURVEY_FORM_HAS_RESPONSES'
  | 'SURVEY_VERSION_REQUIRED'
  | 'SURVEY_DEFINITION_TOO_LARGE';

export const surveyErrorTag = (error: unknown): SurveyErrorTag | null => {
  const message = error instanceof Error ? error.message : '';
  const match = /(SURVEY_[A-Z_]+)/.exec(message);

  return match === null ? null : (match[1] as SurveyErrorTag);
};

// The per-question errors the answers hook attached to a rejected write.
export const invalidAnswersFrom = (
  error: unknown,
): { questionId: string; code: string }[] => {
  const message = error instanceof Error ? error.message : '';
  const index = message.indexOf('SURVEY_INVALID_ANSWERS: ');

  if (index < 0) return [];

  try {
    return JSON.parse(message.slice(index + 'SURVEY_INVALID_ANSWERS: '.length));
  } catch {
    return [];
  }
};

const isUnprovisioned = (error: unknown) =>
  error instanceof ApiError &&
  /(Cannot query field|Unknown type|is not defined by type).*[sS]urvey/.test(
    error.message,
  );

// ---- REST helpers -------------------------------------------------------

const restRequest = async <TResult>(
  method: 'GET' | 'POST',
  url: string,
  body?: unknown,
  { authenticated = true }: { authenticated?: boolean } = {},
): Promise<TResult> => {
  const token = authenticated ? (loadTokens()?.accessToken ?? '') : '';
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined || body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
    },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const text = await response.text();
  let json: unknown = null;

  try {
    json = text === '' ? null : JSON.parse(text);
  } catch {
    json = null;
  }

  if (!response.ok) {
    const payload = (json ?? {}) as {
      code?: string;
      message?: string | string[];
      details?: unknown;
    };
    const message = Array.isArray(payload.message)
      ? payload.message.join(', ')
      : (payload.message ?? `Request failed (${response.status})`);

    throw new SurveyRequestError(
      message,
      response.status,
      payload.code ?? 'HTTP_ERROR',
      payload.details ?? null,
    );
  }

  return json as TResult;
};

const staff = <TResult>(method: 'GET' | 'POST', path: string, body?: unknown) =>
  restRequest<TResult>(method, `/rest/sales/surveys/${path}`, body);

// ---- capabilities -------------------------------------------------------

export const fetchSurveyCapabilities = async (): Promise<SurveyCapabilities> => {
  try {
    return await staff<SurveyCapabilities>('GET', 'capabilities');
  } catch (error) {
    // 404: an older server without the survey module.
    if (error instanceof SurveyRequestError && error.status === 404) {
      return NO_SURVEY_CAPABILITIES;
    }

    throw error;
  }
};

// ---- forms --------------------------------------------------------------

const MEMBER = 'id name { firstName lastName }';

const FORM_SUMMARY_FIELDS = `
  id name formStatus purpose description currentVersionNumber
  hasUnpublishedChanges publicSlug publicEnabled opensAt closesAt
  responseLimit campaignIds updatedAt createdAt
  owner { ${MEMBER} }
  publishedVersion { id versionNumber printCode publishedAt }
`;

const FORM_FIELDS = `${FORM_SUMMARY_FIELDS} draftDefinition draftRevision draftUpdatedAt`;

type RawFormSummary = Omit<
  SurveyFormSummary,
  'campaignIds' | 'description' | 'currentVersionNumber'
> & {
  campaignIds: string[] | null;
  description: string | null;
  currentVersionNumber: number | null;
  hasUnpublishedChanges: boolean | null;
  publicEnabled: boolean | null;
};

const toSummary = (raw: RawFormSummary): SurveyFormSummary => ({
  ...raw,
  formStatus: raw.formStatus ?? 'DRAFT',
  description: raw.description ?? '',
  currentVersionNumber: raw.currentVersionNumber ?? 0,
  hasUnpublishedChanges: raw.hasUnpublishedChanges === true,
  publicEnabled: raw.publicEnabled === true,
  campaignIds: Array.isArray(raw.campaignIds) ? raw.campaignIds : [],
});

export type FormsListResult =
  | { supported: true; forms: SurveyFormSummary[]; responseCounts: Record<string, number> }
  | { supported: false };

export const listForms = async (): Promise<FormsListResult> => {
  try {
    const data = await coreQuery<{
      surveyForms: { edges: { node: RawFormSummary }[] };
    }>(
      `query SurveyForms {
        surveyForms(first: 200, orderBy: [{ updatedAt: DescNullsLast }]) {
          edges { node { ${FORM_SUMMARY_FIELDS} } }
        }
      }`,
    );
    const forms = data.surveyForms.edges.map((edge) => toSummary(edge.node));

    return {
      supported: true,
      forms,
      responseCounts: await countResponsesByForm(forms.map((form) => form.id)),
    };
  } catch (error) {
    if (isUnprovisioned(error)) return { supported: false };
    throw error;
  }
};

// One request, one aliased count per form.
export const countResponsesByForm = async (
  formIds: string[],
  extraFilter = '',
): Promise<Record<string, number>> => {
  if (formIds.length === 0) return {};

  const aliases = formIds
    .map(
      (formId, index) =>
        `f${index}: surveyResponses(filter: { formId: { eq: "${formId}" } ${extraFilter} }) { totalCount }`,
    )
    .join('\n');
  const data = await coreQuery<Record<string, { totalCount: number }>>(
    `query SurveyResponseCounts { ${aliases} }`,
  );

  return Object.fromEntries(
    formIds.map((formId, index) => [formId, data[`f${index}`]?.totalCount ?? 0]),
  );
};

export const fetchForm = async (formId: string): Promise<SurveyForm> => {
  const data = await coreQuery<{
    surveyForm: (RawFormSummary & {
      draftDefinition: FormDefinition;
      draftRevision: number | null;
      draftUpdatedAt: string | null;
    }) | null;
  }>(
    `query SurveyForm($id: UUID!) {
      surveyForm(filter: { id: { eq: $id } }) { ${FORM_FIELDS} }
    }`,
    { id: formId },
  );

  if (data.surveyForm === null) {
    throw new ApiError('Form not found', 'NOT_FOUND');
  }

  return {
    ...toSummary(data.surveyForm),
    draftDefinition: data.surveyForm.draftDefinition,
    draftRevision: data.surveyForm.draftRevision ?? 0,
    draftUpdatedAt: data.surveyForm.draftUpdatedAt,
  };
};

export const createForm = async (input: {
  name: string;
  purpose: SurveyPurpose;
  description?: string;
  draftDefinition: FormDefinition;
  publicEnabled?: boolean;
}): Promise<{ id: string }> => {
  const data = await coreQuery<{ createSurveyForm: { id: string } }>(
    `mutation CreateSurveyForm($data: SurveyFormCreateInput!) {
      createSurveyForm(data: $data) { id }
    }`,
    {
      data: {
        name: input.name,
        purpose: input.purpose,
        description: input.description ?? '',
        draftDefinition: input.draftDefinition,
        publicEnabled: input.publicEnabled ?? true,
      },
    },
  );

  return data.createSurveyForm;
};

export type FormSettingsPatch = Partial<{
  name: string;
  purpose: SurveyPurpose;
  description: string;
  publicEnabled: boolean;
  opensAt: string | null;
  closesAt: string | null;
  responseLimit: number | null;
  campaignIds: string[];
  ownerId: string;
}>;

export const updateFormSettings = async (
  formId: string,
  patch: FormSettingsPatch,
): Promise<void> => {
  await coreQuery(
    `mutation UpdateSurveyForm($id: UUID!, $data: SurveyFormUpdateInput!) {
      updateSurveyForm(id: $id, data: $data) { id }
    }`,
    { id: formId, data: patch },
  );
};

export class DraftConflictError extends Error {}

// Autosave: the server accepts the draft only as the direct successor of the
// revision this editor loaded, so two editors can never silently overwrite
// each other.
export const saveDraft = async (
  formId: string,
  definition: FormDefinition,
  nextRevision: number,
): Promise<{ draftRevision: number; draftUpdatedAt: string | null }> => {
  try {
    const data = await coreQuery<{
      updateSurveyForm: { draftRevision: number; draftUpdatedAt: string | null };
    }>(
      `mutation SaveSurveyDraft($id: UUID!, $data: SurveyFormUpdateInput!) {
        updateSurveyForm(id: $id, data: $data) { draftRevision draftUpdatedAt }
      }`,
      {
        id: formId,
        data: { draftDefinition: definition, draftRevision: nextRevision },
      },
    );

    return data.updateSurveyForm;
  } catch (error) {
    if (surveyErrorTag(error) === 'SURVEY_DRAFT_CONFLICT') {
      throw new DraftConflictError(error instanceof Error ? error.message : '');
    }

    throw error;
  }
};

export class PublishInvalidError extends Error {
  issues: { errors: PublishIssue[]; warnings: PublishIssue[] };

  constructor(issues: { errors: PublishIssue[]; warnings: PublishIssue[] }) {
    super('The form has problems that must be fixed before publishing');
    this.issues = issues;
  }
}

export const publishForm = async (
  formId: string,
  expectedDraftRevision: number,
  changeNote: string,
): Promise<PublishResult> => {
  try {
    return await staff<PublishResult>('POST', `forms/${formId}/publish`, {
      expectedDraftRevision,
      changeNote,
    });
  } catch (error) {
    if (error instanceof SurveyRequestError && error.code === 'PUBLISH_INVALID') {
      throw new PublishInvalidError(
        (error.details as { errors: PublishIssue[]; warnings: PublishIssue[] }) ?? {
          errors: [],
          warnings: [],
        },
      );
    }

    if (error instanceof SurveyRequestError && error.code === 'DRAFT_CONFLICT') {
      throw new DraftConflictError(error.message);
    }

    throw error;
  }
};

export const changeFormStatus = (
  formId: string,
  status: SurveyFormStatus,
): Promise<{ formStatus: SurveyFormStatus }> =>
  staff('POST', `forms/${formId}/status`, { status });

export const duplicateForm = async (
  form: SurveyForm,
  name: string,
): Promise<{ id: string }> =>
  createForm({
    name,
    purpose: form.purpose ?? 'OTHER',
    description: form.description,
    draftDefinition: JSON.parse(JSON.stringify(form.draftDefinition)),
    publicEnabled: form.publicEnabled,
  });

// ---- versions -----------------------------------------------------------

const VERSION_FIELDS = `id formId versionNumber definition publishedAt changeNote printCode publishedBy { ${MEMBER} }`;

type RawVersion = Omit<SurveyFormVersion, 'changeNote' | 'printCode'> & {
  changeNote: string | null;
  printCode: string | null;
};

const toVersion = (raw: RawVersion): SurveyFormVersion => ({
  ...raw,
  changeNote: raw.changeNote ?? '',
  printCode: raw.printCode ?? '',
});

export const fetchVersions = async (
  formId: string,
): Promise<SurveyFormVersion[]> => {
  const data = await coreQuery<{
    surveyFormVersions: { edges: { node: RawVersion }[] };
  }>(
    `query SurveyFormVersions($formId: UUID!) {
      surveyFormVersions(
        filter: { formId: { eq: $formId } }
        orderBy: [{ versionNumber: DescNullsLast }]
        first: 100
      ) { edges { node { ${VERSION_FIELDS} } } }
    }`,
    { formId },
  );

  return data.surveyFormVersions.edges.map((edge) => toVersion(edge.node));
};

export const fetchVersion = async (
  versionId: string,
): Promise<SurveyFormVersion | null> => {
  const data = await coreQuery<{ surveyFormVersion: RawVersion | null }>(
    `query SurveyFormVersion($id: UUID!) {
      surveyFormVersion(filter: { id: { eq: $id } }) { ${VERSION_FIELDS} }
    }`,
    { id: versionId },
  );

  return data.surveyFormVersion === null ? null : toVersion(data.surveyFormVersion);
};

// Paper entry: staff type the code printed in the sheet's footer.
export const fetchVersionByPrintCode = async (
  printCode: string,
): Promise<SurveyFormVersion | null> => {
  const data = await coreQuery<{
    surveyFormVersions: { edges: { node: RawVersion }[] };
  }>(
    `query SurveyVersionByCode($code: String!) {
      surveyFormVersions(filter: { printCode: { ilike: $code } }, first: 1) {
        edges { node { ${VERSION_FIELDS} } }
      }
    }`,
    { code: printCode.trim() },
  );

  const node = data.surveyFormVersions.edges[0]?.node;

  return node === undefined ? null : toVersion(node);
};

// ---- responses ----------------------------------------------------------

const RESPONSE_FIELDS = `
  id name formId formVersionId versionNumber submissionKey answers skippedByLogic
  language completionStatus reviewStatus source collectedAt submittedAt enteredAt
  paperReference paperReviewNotes buyingInterest city area location crmActions
  createdAt updatedAt
  form { id name }
  collector { ${MEMBER} }
  enteredBy { ${MEMBER} }
  company { id name }
  person { id name { firstName lastName } }
  opportunity { id name stage }
  campaign { id name }
  visit { id title visitOutcome }
`;

type RawResponse = Omit<
  SurveyResponse,
  'answers' | 'skippedByLogic' | 'crmActions' | 'paperReference' | 'paperReviewNotes' | 'city' | 'area' | 'language'
> & {
  answers: Record<string, AnswerValue> | null;
  skippedByLogic: string[] | null;
  crmActions: SurveyCrmAction[] | null;
  paperReference: string | null;
  paperReviewNotes: string | null;
  city: string | null;
  area: string | null;
  language: string | null;
};

const toResponse = (raw: RawResponse): SurveyResponse => ({
  ...raw,
  answers: raw.answers ?? {},
  skippedByLogic: raw.skippedByLogic ?? [],
  crmActions: raw.crmActions ?? [],
  paperReference: raw.paperReference ?? '',
  paperReviewNotes: raw.paperReviewNotes ?? '',
  city: raw.city ?? '',
  area: raw.area ?? '',
  language: raw.language ?? 'fa',
});

export type ResponseFilter = Partial<{
  formId: string;
  versionNumber: number;
  campaignId: string;
  source: SurveySource;
  collectorId: string;
  completionStatus: CompletionStatus;
  reviewStatus: ReviewStatus;
  city: string;
  area: string;
  from: string;
  to: string;
  linkage: 'LINKED' | 'UNLINKED';
  search: string;
  companyId: string;
  personId: string;
  opportunityId: string;
}>;

// Builds the record-API filter object. Values travel as variables, never
// spliced into the query text.
export const buildResponseFilter = (
  filter: ResponseFilter,
): Record<string, unknown> => {
  const and: Record<string, unknown>[] = [];
  const eq = (field: string, value: unknown) => {
    if (value !== undefined && value !== '') and.push({ [field]: { eq: value } });
  };

  eq('formId', filter.formId);
  eq('versionNumber', filter.versionNumber);
  eq('campaignId', filter.campaignId);
  eq('source', filter.source);
  eq('collectorId', filter.collectorId);
  eq('completionStatus', filter.completionStatus);
  eq('reviewStatus', filter.reviewStatus);
  eq('companyId', filter.companyId);
  eq('personId', filter.personId);
  eq('opportunityId', filter.opportunityId);

  if (filter.city) and.push({ city: { ilike: `%${filter.city}%` } });
  if (filter.area) and.push({ area: { ilike: `%${filter.area}%` } });
  if (filter.search) and.push({ name: { ilike: `%${filter.search}%` } });
  if (filter.from) and.push({ collectedAt: { gte: filter.from } });
  if (filter.to) and.push({ collectedAt: { lte: filter.to } });

  if (filter.linkage === 'LINKED') {
    and.push({
      or: [
        { companyId: { is: 'NOT_NULL' } },
        { personId: { is: 'NOT_NULL' } },
        { opportunityId: { is: 'NOT_NULL' } },
      ],
    });
  }

  if (filter.linkage === 'UNLINKED') {
    and.push({ companyId: { is: 'NULL' } });
    and.push({ personId: { is: 'NULL' } });
    and.push({ opportunityId: { is: 'NULL' } });
  }

  return and.length === 0 ? {} : { and };
};

export type ResponsePage = {
  responses: SurveyResponse[];
  totalCount: number;
  endCursor: string | null;
  hasNextPage: boolean;
};

export const listResponses = async (
  filter: ResponseFilter,
  { first = 50, after = null }: { first?: number; after?: string | null } = {},
): Promise<ResponsePage> => {
  const data = await coreQuery<{
    surveyResponses: {
      totalCount: number;
      pageInfo: { endCursor: string | null; hasNextPage: boolean };
      edges: { node: RawResponse }[];
    };
  }>(
    `query SurveyResponses($filter: SurveyResponseFilterInput, $first: Int, $after: String) {
      surveyResponses(
        filter: $filter
        first: $first
        after: $after
        orderBy: [{ collectedAt: DescNullsLast }]
      ) {
        totalCount
        pageInfo { endCursor hasNextPage }
        edges { node { ${RESPONSE_FIELDS} } }
      }
    }`,
    { filter: buildResponseFilter(filter), first, after },
  );

  return {
    responses: data.surveyResponses.edges.map((edge) => toResponse(edge.node)),
    totalCount: data.surveyResponses.totalCount,
    endCursor: data.surveyResponses.pageInfo.endCursor,
    hasNextPage: data.surveyResponses.pageInfo.hasNextPage,
  };
};

// Every matching response, following cursors. The record API does not clamp
// `first`, it silently returns fewer rows, so aggregates must page.
export const fetchAllResponses = async (
  filter: ResponseFilter,
  { limit = 5000 }: { limit?: number } = {},
): Promise<SurveyResponse[]> => {
  const all: SurveyResponse[] = [];
  let after: string | null = null;

  for (;;) {
    const page = await listResponses(filter, { first: 100, after });

    all.push(...page.responses);

    if (!page.hasNextPage || page.endCursor === null || all.length >= limit) {
      return all;
    }

    after = page.endCursor;
  }
};

export const fetchResponse = async (
  responseId: string,
): Promise<SurveyResponse | null> => {
  const data = await coreQuery<{ surveyResponse: RawResponse | null }>(
    `query SurveyResponse($id: UUID!) {
      surveyResponse(filter: { id: { eq: $id } }) { ${RESPONSE_FIELDS} }
    }`,
    { id: responseId },
  );

  return data.surveyResponse === null ? null : toResponse(data.surveyResponse);
};

export type StaffResponseInput = {
  submissionKey: string;
  formVersionId: string;
  source: 'STAFF_VISIT' | 'PAPER';
  completionStatus: CompletionStatus;
  answers: Record<string, unknown>;
  language?: string;
  name?: string;
  collectedAt?: string;
  collectorId?: string | null;
  paperReference?: string;
  paperReviewNotes?: string;
  buyingInterest?: BuyingInterest | null;
  city?: string;
  area?: string;
  location?: LocationValue | null;
  companyId?: string | null;
  personId?: string | null;
  opportunityId?: string | null;
  campaignId?: string | null;
  visitId?: string | null;
};

const withoutUndefined = (input: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );

// Idempotent from the caller's point of view: a retry with the same
// submission key after a lost reply finds the saved record instead of
// failing on the unique key.
export const createStaffResponse = async (
  input: StaffResponseInput,
): Promise<{ id: string }> => {
  try {
    const data = await coreQuery<{ createSurveyResponse: { id: string } }>(
      `mutation CreateSurveyResponse($data: SurveyResponseCreateInput!) {
        createSurveyResponse(data: $data) { id }
      }`,
      { data: withoutUndefined(input) },
    );

    return data.createSurveyResponse;
  } catch (error) {
    if (error instanceof Error && /duplicate/i.test(error.message)) {
      const existing = await coreQuery<{
        surveyResponses: { edges: { node: { id: string } }[] };
      }>(
        `query($key: String!) { surveyResponses(filter: { submissionKey: { eq: $key } }) { edges { node { id } } } }`,
        { key: input.submissionKey.toLowerCase() },
      );
      const id = existing.surveyResponses.edges[0]?.node.id;

      if (id !== undefined) return { id };
    }

    throw error;
  }
};

export type ResponsePatch = Partial<Omit<StaffResponseInput, 'submissionKey' | 'source'>> & {
  reviewStatus?: ReviewStatus;
  crmActions?: SurveyCrmAction[];
};

export const updateResponse = async (
  responseId: string,
  patch: ResponsePatch,
): Promise<void> => {
  await coreQuery(
    `mutation UpdateSurveyResponse($id: UUID!, $data: SurveyResponseUpdateInput!) {
      updateSurveyResponse(id: $id, data: $data) { id }
    }`,
    { id: responseId, data: withoutUndefined(patch) },
  );
};

export const runResponseAutomations = (
  responseId: string,
): Promise<{ crmActions: SurveyCrmAction[] }> =>
  staff('POST', `responses/${responseId}/automations/run`, {});

// ---- invitations --------------------------------------------------------

export type InvitationTarget = {
  label?: string;
  companyId?: string;
  personId?: string;
  opportunityId?: string;
};

export const createInvitations = (
  formId: string,
  input: { targets: InvitationTarget[]; campaignId?: string | null; expiresAt?: string | null },
): Promise<{ invitations: { id: string; label: string; url: string }[] }> =>
  staff('POST', `forms/${formId}/invitations`, {
    ...input,
    origin: window.location.origin,
  });

// ---- campaigns ----------------------------------------------------------

const CAMPAIGN_FIELDS = `
  id name description campaignStatus startsAt endsAt city areas assigneeIds
  targetResponses channels publicCode formIds createdAt updatedAt
`;

type RawCampaign = Omit<
  SurveyCampaign,
  'description' | 'city' | 'areas' | 'assigneeIds' | 'channels' | 'formIds' | 'campaignStatus' | 'publicCode'
> & {
  description: string | null;
  city: string | null;
  areas: string[] | null;
  assigneeIds: string[] | null;
  channels: SurveySource[] | null;
  formIds: string[] | null;
  campaignStatus: CampaignStatus | null;
  publicCode: string | null;
};

const toCampaign = (raw: RawCampaign): SurveyCampaign => ({
  ...raw,
  description: raw.description ?? '',
  city: raw.city ?? '',
  areas: raw.areas ?? [],
  assigneeIds: raw.assigneeIds ?? [],
  channels: raw.channels ?? [],
  formIds: raw.formIds ?? [],
  campaignStatus: raw.campaignStatus ?? 'PLANNED',
  publicCode: raw.publicCode ?? '',
});

export const listCampaigns = async (): Promise<SurveyCampaign[]> => {
  const data = await coreQuery<{
    surveyCampaigns: { edges: { node: RawCampaign }[] };
  }>(
    `query SurveyCampaigns {
      surveyCampaigns(first: 200, orderBy: [{ startsAt: DescNullsLast }]) {
        edges { node { ${CAMPAIGN_FIELDS} } }
      }
    }`,
  );

  return data.surveyCampaigns.edges.map((edge) => toCampaign(edge.node));
};

export const fetchCampaign = async (
  campaignId: string,
): Promise<SurveyCampaign | null> => {
  const data = await coreQuery<{ surveyCampaign: RawCampaign | null }>(
    `query SurveyCampaign($id: UUID!) {
      surveyCampaign(filter: { id: { eq: $id } }) { ${CAMPAIGN_FIELDS} }
    }`,
    { id: campaignId },
  );

  return data.surveyCampaign === null ? null : toCampaign(data.surveyCampaign);
};

export type CampaignInput = Partial<
  Pick<
    SurveyCampaign,
    | 'name'
    | 'description'
    | 'campaignStatus'
    | 'startsAt'
    | 'endsAt'
    | 'city'
    | 'areas'
    | 'assigneeIds'
    | 'targetResponses'
    | 'channels'
    | 'formIds'
  >
>;

export const createCampaign = async (
  input: CampaignInput,
): Promise<{ id: string }> => {
  const data = await coreQuery<{ createSurveyCampaign: { id: string } }>(
    `mutation CreateSurveyCampaign($data: SurveyCampaignCreateInput!) {
      createSurveyCampaign(data: $data) { id }
    }`,
    { data: input },
  );

  return data.createSurveyCampaign;
};

export const updateCampaign = async (
  campaignId: string,
  input: CampaignInput,
): Promise<void> => {
  await coreQuery(
    `mutation UpdateSurveyCampaign($id: UUID!, $data: SurveyCampaignUpdateInput!) {
      updateSurveyCampaign(id: $id, data: $data) { id }
    }`,
    { id: campaignId, data: input },
  );
};

// ---- visits -------------------------------------------------------------

// A visit is a DONE task of type VISIT. Recorded even when no survey was
// collected, so an unsuccessful visit never needs a fabricated response.
export const createVisitTask = async (input: {
  title: string;
  visitOutcome: VisitOutcome;
  assigneeId: string;
  companyId: string | null;
  opportunityId: string | null;
  surveyCampaignId: string | null;
  notes?: string;
}): Promise<{ id: string }> => {
  const now = new Date().toISOString();
  const data = await coreQuery<{ createTask: { id: string } }>(
    `mutation CreateVisitTask($data: TaskCreateInput!) { createTask(data: $data) { id } }`,
    {
      data: withoutUndefined({
        title: input.title,
        status: 'DONE',
        taskType: 'VISIT',
        dueAt: now,
        assigneeId: input.assigneeId,
        visitOutcome: input.visitOutcome,
        surveyCampaignId: input.surveyCampaignId ?? undefined,
        bodyV2:
          input.notes === undefined || input.notes === ''
            ? undefined
            : { markdown: input.notes },
      }),
    },
  );
  const taskId = data.createTask.id;

  for (const target of [
    input.companyId === null ? null : { targetCompanyId: input.companyId },
    input.opportunityId === null ? null : { targetOpportunityId: input.opportunityId },
  ]) {
    if (target === null) continue;

    await coreQuery(
      `mutation LinkVisit($data: TaskTargetCreateInput!) { createTaskTarget(data: $data) { id } }`,
      { data: { taskId, ...target } },
    );
  }

  return { id: taskId };
};

// ---- public (no login) --------------------------------------------------

const publicUrl = (slug: string, path = '', query: Record<string, string> = {}) => {
  const search = new URLSearchParams({ origin: window.location.origin, ...query });

  return `/public/forms/${encodeURIComponent(slug)}${path}?${search.toString()}`;
};

export const fetchPublicForm = (
  slug: string,
  inviteToken: string | null,
): Promise<PublicForm> =>
  restRequest<PublicForm>(
    'GET',
    publicUrl(slug, '', inviteToken === null ? {} : { i: inviteToken }),
    undefined,
    { authenticated: false },
  );

export const uploadPublicFile = (
  slug: string,
  input: {
    file: File;
    questionId: string;
    submissionKey: string;
    versionNumber: number;
    inviteToken: string | null;
  },
): Promise<FileAnswer> => {
  const body = new FormData();

  body.append('file', input.file);
  body.append('questionId', input.questionId);
  body.append('submissionKey', input.submissionKey);
  body.append('versionNumber', String(input.versionNumber));
  if (input.inviteToken !== null) body.append('inviteToken', input.inviteToken);

  return restRequest<FileAnswer>('POST', publicUrl(slug, '/uploads'), body, {
    authenticated: false,
  });
};

export const submitPublicForm = (
  slug: string,
  input: {
    submissionKey: string;
    versionNumber: number;
    answers: Record<string, unknown>;
    language: string;
    inviteToken: string | null;
    campaignCode: string | null;
    startedAt: number;
    website: string;
  },
): Promise<PublicSubmissionResult> =>
  restRequest<PublicSubmissionResult>('POST', publicUrl(slug, '/submissions'), input, {
    authenticated: false,
  });
