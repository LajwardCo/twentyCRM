import { type FileAnswer } from '@shared/surveys';

import {
  type AttachmentSchema,
  attachmentSelection,
} from '../lib/attachmentSchema';
import { type ActivityRow, type AuditEntry, toAuditEntries } from '../lib/recordHistory';
import {
  type CompanyPatch,
  type OpportunityPatch,
  type PersonPatch,
} from '../lib/forms/responses/crmDiff';
import { type TaskAttachment, getAttachmentMetadata } from './attachments';
import { coreQuery, loadTokens } from './client';
import { createLead } from './surveyCrm';
import {
  type ResponseFilter,
  type ResponsePage,
  type SurveyCrmAction,
  type SurveyResponse,
  SurveyRequestError,
  buildResponseFilter,
  runResponseAutomations,
} from './surveys';

// Response-review data access that api/surveys.ts does not cover: listing
// with "everything but spam", notes, attachments, follow-up tasks, history and
// the field-level CRM updates the review panel applies. Everything runs with
// the signed-in user's permissions through the record API.

// ---- listing ------------------------------------------------------------

// Mirrors api/surveys.ts RESPONSE_FIELDS; kept here because the shared list
// function cannot express "review status is not SPAM".
const RESPONSE_FIELDS = `
  id name formId formVersionId versionNumber submissionKey answers skippedByLogic
  language completionStatus reviewStatus source collectedAt submittedAt enteredAt
  paperReference paperReviewNotes buyingInterest city area location crmActions
  createdAt updatedAt
  form { id name }
  collector { id name { firstName lastName } }
  enteredBy { id name { firstName lastName } }
  company { id name }
  person { id name { firstName lastName } }
  opportunity { id name stage }
  campaign { id name }
  visit { id title visitOutcome }
`;

type RawResponse = Omit<SurveyResponse, 'answers' | 'skippedByLogic' | 'crmActions'> & {
  answers: SurveyResponse['answers'] | null;
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

const NOT_SPAM = {
  or: [{ reviewStatus: { neq: 'SPAM' } }, { reviewStatus: { is: 'NULL' } }],
};

export const queryResponses = async (
  filter: ResponseFilter,
  { excludeSpam, first = 50, after = null }: { excludeSpam: boolean; first?: number; after?: string | null },
): Promise<ResponsePage> => {
  const base = buildResponseFilter(filter) as { and?: Record<string, unknown>[] };
  const and = [...(base.and ?? []), ...(excludeSpam ? [NOT_SPAM] : [])];
  const data = await coreQuery<{
    surveyResponses: {
      totalCount: number;
      pageInfo: { endCursor: string | null; hasNextPage: boolean };
      edges: { node: RawResponse }[];
    };
  }>(
    `query SurveyResponsesReview($filter: SurveyResponseFilterInput, $first: Int, $after: String) {
      surveyResponses(filter: $filter, first: $first, after: $after, orderBy: [{ collectedAt: DescNullsLast }]) {
        totalCount
        pageInfo { endCursor hasNextPage }
        edges { node { ${RESPONSE_FIELDS} } }
      }
    }`,
    { filter: and.length === 0 ? {} : { and }, first, after },
  );

  return {
    responses: data.surveyResponses.edges.map((edge) => toResponse(edge.node)),
    totalCount: data.surveyResponses.totalCount,
    endCursor: data.surveyResponses.pageInfo.endCursor,
    hasNextPage: data.surveyResponses.pageInfo.hasNextPage,
  };
};

// Follows cursors: the record API silently returns fewer rows than `first`
// asks for, so an export must never trust one big page.
export const queryAllResponses = async (
  filter: ResponseFilter,
  excludeSpam: boolean,
  { limit = 10_000 }: { limit?: number } = {},
): Promise<SurveyResponse[]> => {
  const all: SurveyResponse[] = [];
  let after: string | null = null;

  for (;;) {
    const page: ResponsePage = await queryResponses(filter, { excludeSpam, first: 100, after });

    all.push(...page.responses);

    if (!page.hasNextPage || page.endCursor === null || all.length >= limit) return all;

    after = page.endCursor;
  }
};

// The /rest/sales endpoints do not renew an expired access token the way
// GraphQL calls do (another tab may have rotated it), so a 401 renews the
// session through one cheap GraphQL read and retries once.
export const runAutomationsWithSession = async (responseId: string): Promise<{ crmActions: SurveyCrmAction[] }> => {
  try {
    return await runResponseAutomations(responseId);
  } catch (error) {
    if (!(error instanceof SurveyRequestError) || error.status !== 401) throw error;

    await coreQuery(`query SurveySessionPing { surveyForms(first: 1) { totalCount } }`);

    return runResponseAutomations(responseId);
  }
};

// ---- notes --------------------------------------------------------------

export type ResponseNote = {
  id: string;
  title: string;
  createdAt: string;
  body: string;
  author: string;
};

export const fetchResponseNotes = async (responseId: string): Promise<ResponseNote[]> => {
  const data = await coreQuery<{
    noteTargets: {
      edges: {
        node: {
          note: {
            id: string;
            title: string | null;
            createdAt: string;
            bodyV2: { markdown: string | null } | null;
            createdBy: { name: string | null } | null;
          } | null;
        };
      }[];
    };
  }>(
    `query SurveyResponseNotes($id: UUID!) {
      noteTargets(filter: { targetSurveyResponseId: { eq: $id } }, first: 100) {
        edges { node { note { id title createdAt bodyV2 { markdown } createdBy { name } } } }
      }
    }`,
    { id: responseId },
  );

  return data.noteTargets.edges
    .map((edge) => edge.node.note)
    .filter((note): note is NonNullable<typeof note> => note !== null)
    .map((note) => ({
      id: note.id,
      title: note.title ?? '',
      createdAt: note.createdAt,
      body: note.bodyV2?.markdown ?? '',
      author: note.createdBy?.name ?? '',
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

// One note, attached to the response and (when given) to the linked lead so
// it shows up in the lead's timeline too.
export const createResponseNote = async (input: {
  responseId: string | null;
  opportunityId?: string | null;
  title: string;
  body: string;
}): Promise<string> => {
  const created = await coreQuery<{ createNote: { id: string } }>(
    `mutation SurveyCreateNote($data: NoteCreateInput!) { createNote(data: $data) { id } }`,
    { data: { title: input.title, bodyV2: { markdown: input.body } } },
  );
  const noteId = created.createNote.id;

  for (const target of [
    input.responseId === null ? null : { targetSurveyResponseId: input.responseId },
    input.opportunityId ? { targetOpportunityId: input.opportunityId } : null,
  ]) {
    if (target === null) continue;

    await coreQuery(
      `mutation SurveyNoteTarget($data: NoteTargetCreateInput!) { createNoteTarget(data: $data) { id } }`,
      { data: { noteId, ...target } },
    );
  }

  return noteId;
};

// ---- follow-up tasks ----------------------------------------------------

export type ResponseTask = {
  id: string;
  title: string;
  status: string | null;
  dueAt: string | null;
  assignee: string;
};

export const fetchResponseTasks = async (responseId: string): Promise<ResponseTask[]> => {
  const data = await coreQuery<{
    taskTargets: {
      edges: {
        node: {
          task: {
            id: string;
            title: string | null;
            status: string | null;
            dueAt: string | null;
            assignee: { name: { firstName: string; lastName: string } } | null;
          } | null;
        };
      }[];
    };
  }>(
    `query SurveyResponseTasks($id: UUID!) {
      taskTargets(filter: { targetSurveyResponseId: { eq: $id } }, first: 100) {
        edges { node { task { id title status dueAt assignee { name { firstName lastName } } } } }
      }
    }`,
    { id: responseId },
  );

  return data.taskTargets.edges
    .map((edge) => edge.node.task)
    .filter((task): task is NonNullable<typeof task> => task !== null)
    .map((task) => ({
      id: task.id,
      title: task.title ?? '',
      status: task.status,
      dueAt: task.dueAt,
      assignee: task.assignee === null ? '' : `${task.assignee.name.firstName} ${task.assignee.name.lastName}`.trim(),
    }));
};

export const createResponseTask = async (input: {
  responseId: string | null;
  opportunityId?: string | null;
  title: string;
  body?: string;
  dueAt: string | null;
  assigneeId: string;
}): Promise<string> => {
  const created = await coreQuery<{ createTask: { id: string } }>(
    `mutation SurveyCreateTask($data: TaskCreateInput!) { createTask(data: $data) { id } }`,
    {
      data: {
        title: input.title,
        status: 'TODO',
        dueAt: input.dueAt,
        assigneeId: input.assigneeId,
        ...(input.body ? { bodyV2: { markdown: input.body } } : {}),
      },
    },
  );
  const taskId = created.createTask.id;

  for (const target of [
    input.responseId === null ? null : { targetSurveyResponseId: input.responseId },
    input.opportunityId ? { targetOpportunityId: input.opportunityId } : null,
  ]) {
    if (target === null) continue;

    await coreQuery(
      `mutation SurveyTaskTarget($data: TaskTargetCreateInput!) { createTaskTarget(data: $data) { id } }`,
      { data: { taskId, ...target } },
    );
  }

  return taskId;
};

// ---- attachments --------------------------------------------------------

export const fetchResponseAttachments = async (responseId: string): Promise<TaskAttachment[]> => {
  const schema: AttachmentSchema = await getAttachmentMetadata();
  const data = await coreQuery<{ attachments: { edges: { node: TaskAttachment }[] } }>(
    `query SurveyResponseAttachments($id: UUID) {
      attachments(filter: { targetSurveyResponseId: { eq: $id } }, first: 100, orderBy: [{ createdAt: DescNullsLast }]) {
        edges { node { ${attachmentSelection(schema)} } }
      }
    }`,
    { id: responseId },
  );

  return data.attachments.edges.map((edge) => edge.node);
};

// Same multipart upload as api/attachments.ts (which keeps its helper
// private): store the file, then create the attachment record.
const uploadFilesFieldFile = async (file: File): Promise<{ id: string }> => {
  const { fileFieldId } = await getAttachmentMetadata();
  const form = new FormData();

  form.append(
    'operations',
    JSON.stringify({
      query: `mutation UploadFilesFieldFile($file: Upload!, $fieldMetadataId: String!) {
        uploadFilesFieldFile(file: $file, fieldMetadataId: $fieldMetadataId) { id url }
      }`,
      variables: { file: null, fieldMetadataId: fileFieldId },
    }),
  );
  form.append('map', JSON.stringify({ '0': ['variables.file'] }));
  form.append('0', file, file.name);

  const response = await fetch('/metadata', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${loadTokens()?.accessToken ?? ''}`,
      'apollo-require-preflight': 'true',
    },
    body: form,
  });
  const json = (await response.json()) as {
    data?: { uploadFilesFieldFile: { id: string } };
    errors?: { message: string }[];
  };

  if (json.errors?.length) throw new Error(json.errors[0].message);
  if (!json.data) throw new Error('upload failed');

  return json.data.uploadFilesFieldFile;
};

export const uploadResponseAttachment = async (
  responseId: string,
  file: File,
): Promise<{ attachmentId: string }> => {
  const uploaded = await uploadFilesFieldFile(file);
  const data = await coreQuery<{ createAttachment: { id: string } }>(
    `mutation SurveyCreateAttachment($data: AttachmentCreateInput!) { createAttachment(data: $data) { id } }`,
    {
      data: {
        name: file.name,
        file: [{ fileId: uploaded.id, label: file.name }],
        targetSurveyResponseId: responseId,
      },
    },
  );

  return { attachmentId: data.createAttachment.id };
};

// Staff corrections of a file question: the file is kept as an attachment of
// the response, and the answer references that attachment.
export const uploadCorrectionFile = async (responseId: string, file: File): Promise<FileAnswer> => {
  const { attachmentId } = await uploadResponseAttachment(responseId, file);

  return {
    ref: `attachment:${attachmentId}`,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
  };
};

// ---- history ------------------------------------------------------------

export const fetchResponseHistory = async (responseId: string): Promise<AuditEntry[]> => {
  try {
    const data = await coreQuery<{ timelineActivities: { edges: { node: ActivityRow }[] } }>(
      `query SurveyResponseHistory($id: UUID!) {
        timelineActivities(
          filter: { targetSurveyResponseId: { eq: $id } }
          orderBy: [{ happensAt: DescNullsLast }]
          first: 60
        ) {
          edges { node { id name happensAt properties linkedRecordCachedName workspaceMember { name { firstName lastName } } } }
        }
      }`,
      { id: responseId },
    );

    return toAuditEntries(data.timelineActivities.edges.map((edge) => edge.node));
  } catch {
    return [];
  }
};

// ---- CRM field updates --------------------------------------------------

export const updateCompanyFields = async (companyId: string, patch: CompanyPatch): Promise<void> => {
  const { businessType, ...core } = patch;

  if (Object.keys(core).length > 0) {
    await coreQuery(
      `mutation SurveyApplyCompany($id: UUID!, $data: CompanyUpdateInput!) { updateCompany(id: $id, data: $data) { id } }`,
      { id: companyId, data: core },
    );
  }

  // Fork-provisioned field; its own call so a workspace without it still
  // gets the other fields.
  if (businessType !== undefined) {
    await coreQuery(
      `mutation SurveyApplyCompanyType($id: UUID!, $data: CompanyUpdateInput!) { updateCompany(id: $id, data: $data) { id } }`,
      { id: companyId, data: { businessType } },
    );
  }
};

export const updatePersonFields = async (personId: string, patch: PersonPatch): Promise<void> => {
  await coreQuery(
    `mutation SurveyApplyPerson($id: UUID!, $data: PersonUpdateInput!) { updatePerson(id: $id, data: $data) { id } }`,
    { id: personId, data: patch },
  );
};

export const updateOpportunityFields = async (opportunityId: string, patch: OpportunityPatch): Promise<void> => {
  await coreQuery(
    `mutation SurveyApplyLead($id: UUID!, $data: OpportunityUpdateInput!) { updateOpportunity(id: $id, data: $data) { id } }`,
    { id: opportunityId, data: patch },
  );
};

// surveyCrm.createLead sets the fork's NEW_LEAD stage; a workspace whose
// opportunity stages were never customised rejects it. The server's own
// CREATE_LEAD automation leaves the stage to the workspace default, so this
// does the same when the fork stage is missing.
export const createLeadForResponse = async (input: Parameters<typeof createLead>[0]): Promise<{ id: string }> => {
  try {
    return await createLead(input);
  } catch (error) {
    if (!(error instanceof Error) || !/NEW_LEAD/.test(error.message) || !/stage/.test(error.message)) throw error;

    const data = await coreQuery<{ createOpportunity: { id: string } }>(
      `mutation SurveyCreateLeadDefaultStage($data: OpportunityCreateInput!) { createOpportunity(data: $data) { id } }`,
      {
        data: {
          name: input.name.trim(),
          ownerId: input.ownerId,
          ...(input.companyId !== null ? { companyId: input.companyId } : {}),
          ...(input.personId !== null ? { pointOfContactId: input.personId } : {}),
        },
      },
    );

    return data.createOpportunity;
  }
};

// Invitation suggestions carry only a record id; the panel shows its name.
export const fetchRecordLabel = async (
  kind: 'company' | 'person' | 'opportunity',
  id: string,
): Promise<string> => {
  if (kind === 'person') {
    const data = await coreQuery<{ person: { name: { firstName: string; lastName: string } } | null }>(
      `query SurveyPersonLabel($id: UUID!) { person(filter: { id: { eq: $id } }) { name { firstName lastName } } }`,
      { id },
    );

    return data.person === null ? '' : `${data.person.name.firstName} ${data.person.name.lastName}`.trim();
  }

  const data = await coreQuery<Record<string, { name: string } | null>>(
    `query SurveyRecordLabel($id: UUID!) { ${kind}(filter: { id: { eq: $id } }) { name } }`,
    { id },
  );

  return data[kind]?.name ?? '';
};
