import { type LinePriceOverridesPayload } from '../lib/dealLinePricing';
import {
  parsePriceBook,
  type PricingFactor,
  type ProductPriceBook,
} from './catalog';
import { coreQuery } from './client';

// ---------- shared types ----------

export type TaskType = 'CALL' | 'MEETING' | 'DEMO' | 'VISIT' | 'OTHER';

export type Task = {
  id: string;
  title: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | null;
  taskType: TaskType | null;
  dueAt: string | null;
  createdAt: string;
  bodyV2: { markdown: string | null } | null;
  assignee?: {
    id: string;
    name: { firstName: string; lastName: string };
  } | null;
  taskTargets?: {
    edges: {
      node: {
        opportunity: { id: string; name: string } | null;
        company: { id: string; name: string } | null;
      };
    }[];
  };
};

export type Note = {
  id: string;
  title: string;
  createdAt: string;
  bodyV2: { markdown: string | null } | null;
};

export type LeadSummary = {
  id: string;
  name: string;
  stage: string | null;
  temperature: string | null;
  leadSource: string | null;
  createdAt: string;
  company: { id: string; name: string } | null;
  pointOfContact: {
    id: string;
    name: { firstName: string; lastName: string };
    phones: { primaryPhoneCallingCode: string | null; primaryPhoneNumber: string | null } | null;
    emails: { primaryEmail: string | null } | null;
  } | null;
  owner: { id: string; name: { firstName: string; lastName: string } } | null;
  amount: { amountMicros: number | null; currencyCode: string | null } | null;
  createdBy: { name: string | null; source: string | null } | null;
  referrer: {
    id: string;
    name: string;
    partnerType: string | null;
    commissionPercent: number | null;
  } | null;
};

// Stages considered "open pipeline" (not yet won or lost).
export const OPEN_STAGES = [
  'NEW_LEAD',
  'FOLLOWING_UP',
  'DEMO_SCHEDULED',
  'DEMO_NEGOTIATION',
  'CONTRACT_SENT',
  'SIGNED_AWAITING_PAYMENT',
  'PAID_AWAITING_TRAINING',
  'IN_TRAINING',
];

export const STAGES: { value: string; label: string }[] = [
  { value: 'NEW_LEAD', label: 'New Lead' },
  { value: 'FOLLOWING_UP', label: 'Following Up' },
  { value: 'DEMO_SCHEDULED', label: 'Demo Scheduled' },
  { value: 'DEMO_NEGOTIATION', label: 'Demo & Negotiation' },
  { value: 'CONTRACT_SENT', label: 'Contract Sent' },
  { value: 'SIGNED_AWAITING_PAYMENT', label: 'Signed (Awaiting Payment)' },
  { value: 'PAID_AWAITING_TRAINING', label: 'Paid (Awaiting Training)' },
  { value: 'IN_TRAINING', label: 'In Training' },
  { value: 'ACTIVE_CUSTOMER', label: 'Active Customer' },
  { value: 'LOST_MISSED', label: 'Lost / Missed' },
];

export const LEAD_SOURCES: { value: string; label: string }[] = [
  { value: 'FIELD', label: 'Field Visit' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'TELEGRAM', label: 'Telegram' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'OTHER', label: 'Other' },
];

export const stageLabel = (value: string | null): string =>
  STAGES.find((s) => s.value === value)?.label ?? value ?? '—';

const LEAD_FIELDS = `
  id
  name
  stage
  temperature
  leadSource
  createdAt
  company { id name }
  pointOfContact {
    id
    name { firstName lastName }
    phones { primaryPhoneCallingCode primaryPhoneNumber }
    emails { primaryEmail }
  }
  owner { id name { firstName lastName } }
  amount { amountMicros currencyCode }
  createdBy { name source }
  referrer { id name partnerType commissionPercent }
`;

// ---------- pagination ----------

// Twenty serves at most QUERY_MAX_RECORDS (200) rows per page and honours
// `first` as given, so a lone `first: 300` silently returns a truncated set --
// which is how the reports came to describe only part of the pipeline. Anything
// that aggregates rather than previews goes through the connection cursor.
const PAGE_SIZE = 200;

// 10k rows. Past this the caller wants a data export, not a report, and the
// request budget (100 req/60s) is better spent elsewhere.
const MAX_PAGES = 50;

type Connection<TNode> = {
  edges: { node: TNode }[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

// `truncated` is surfaced rather than swallowed: a report that quietly stops at
// a cap reads exactly like a complete one, which is the bug this replaces.
export type PagedResult<TNode> = { items: TNode[]; truncated: boolean };

const fetchAllPages = async <TNode>(
  runPage: (after: string | null) => Promise<Connection<TNode>>,
): Promise<PagedResult<TNode>> => {
  const items: TNode[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const connection = await runPage(after);
    items.push(...connection.edges.map((edge) => edge.node));

    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) {
      return { items, truncated: false };
    }
    after = connection.pageInfo.endCursor;
  }

  return { items, truncated: true };
};

// ---------- leads ----------

export type LeadQueryOptions = {
  search?: string;
  ownerId?: string;
  openOnly?: boolean;
  limit?: number;
  companyId?: string;
  pointOfContactId?: string;
  // Server-side period bound: lets a report paginate only the rows it uses
  // instead of walking the whole pipeline.
  createdAfter?: string;
  stages?: string[];
};

const leadFilter = (
  options: LeadQueryOptions,
): Record<string, unknown> | undefined => {
  const filters: Record<string, unknown>[] = [];
  if (options.search) {
    filters.push({ name: { ilike: `%${options.search}%` } });
  }
  if (options.openOnly) {
    filters.push({ stage: { in: OPEN_STAGES } });
  }
  if (options.stages) {
    filters.push({ stage: { in: options.stages } });
  }
  if (options.ownerId) {
    filters.push({ ownerId: { eq: options.ownerId } });
  }
  if (options.companyId) {
    filters.push({ companyId: { eq: options.companyId } });
  }
  if (options.pointOfContactId) {
    filters.push({ pointOfContactId: { eq: options.pointOfContactId } });
  }
  if (options.createdAfter) {
    filters.push({ createdAt: { gte: options.createdAfter } });
  }
  return filters.length > 0 ? { and: filters } : undefined;
};

const LEADS_PAGE_QUERY = `query Leads($filter: OpportunityFilterInput, $limit: Int, $after: String) {
  opportunities(
    filter: $filter
    first: $limit
    after: $after
    orderBy: [{ createdAt: DescNullsLast }]
  ) {
    edges { node { ${LEAD_FIELDS} } }
    pageInfo { hasNextPage endCursor }
  }
}`;

// Bounded fetch, for pickers and list previews where one page is the point.
// Reports must use fetchAllLeads instead.
export const fetchLeads = async (
  options: LeadQueryOptions,
): Promise<LeadSummary[]> => {
  const data = await coreQuery<{ opportunities: Connection<LeadSummary> }>(
    LEADS_PAGE_QUERY,
    {
      filter: leadFilter(options),
      limit: options.limit ?? 60,
      after: null,
    },
  );

  return data.opportunities.edges.map((e) => e.node);
};

// Every lead matching the filter, followed across pages.
export const fetchAllLeads = (
  options: LeadQueryOptions = {},
): Promise<PagedResult<LeadSummary>> =>
  fetchAllPages<LeadSummary>(async (after) => {
    const data = await coreQuery<{ opportunities: Connection<LeadSummary> }>(
      LEADS_PAGE_QUERY,
      { filter: leadFilter(options), limit: PAGE_SIZE, after },
    );
    return data.opportunities;
  });

export const fetchLead = async (id: string): Promise<LeadSummary> => {
  const data = await coreQuery<{ opportunity: LeadSummary }>(
    `query Lead($id: UUID!) {
      opportunity(filter: { id: { eq: $id } }) { ${LEAD_FIELDS} }
    }`,
    { id },
  );
  return data.opportunity;
};

export const updateLead = async (
  id: string,
  update: Record<string, unknown>,
): Promise<void> => {
  await coreQuery(
    `mutation UpdateLead($id: UUID!, $data: OpportunityUpdateInput!) {
      updateOpportunity(id: $id, data: $data) { id }
    }`,
    { id, data: update },
  );
};

// ---------- lead timeline (tasks + notes via targets) ----------

export const fetchLeadTasks = async (opportunityId: string): Promise<Task[]> => {
  const data = await coreQuery<{
    taskTargets: {
      edges: {
        node: {
          task: Task | null;
        };
      }[];
    };
  }>(
    `query LeadTasks($oppId: UUID!) {
      taskTargets(
        filter: { targetOpportunityId: { eq: $oppId } }
        first: 100
      ) {
        edges {
          node {
            task {
              id
              title
              status
              taskType
              dueAt
              createdAt
              bodyV2 { markdown }
            }
          }
        }
      }
    }`,
    { oppId: opportunityId },
  );

  return data.taskTargets.edges
    .map((e) => e.node.task)
    .filter((t): t is Task => t !== null)
    .sort((a, b) => (b.dueAt ?? b.createdAt).localeCompare(a.dueAt ?? a.createdAt));
};

export const fetchLeadNotes = async (opportunityId: string): Promise<Note[]> => {
  const data = await coreQuery<{
    noteTargets: {
      edges: { node: { note: Note | null } }[];
    };
  }>(
    `query LeadNotes($oppId: UUID!) {
      noteTargets(
        filter: { targetOpportunityId: { eq: $oppId } }
        first: 100
      ) {
        edges {
          node {
            note {
              id
              title
              createdAt
              bodyV2 { markdown }
            }
          }
        }
      }
    }`,
    { oppId: opportunityId },
  );

  return data.noteTargets.edges
    .map((e) => e.node.note)
    .filter((n): n is Note => n !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

// ---------- today's tasks ----------

// Two windows so a pile of overdue tasks can never push upcoming ones past
// the pagination limit.
// assigneeId is optional: pass it to scope to one seller ("my tasks"), or omit
// it so admins see every open task (the server still row-filters by the
// caller's permissions).
const OPEN_TASKS_PAGE_QUERY = `query MyOpenTasks($filter: TaskFilterInput, $limit: Int, $after: String) {
  tasks(
    filter: $filter
    first: $limit
    after: $after
    orderBy: [{ dueAt: AscNullsLast }]
  ) {
    edges {
      node {
        id
        title
        status
        taskType
        dueAt
        createdAt
        bodyV2 { markdown }
        assignee { id name { firstName lastName } }
        taskTargets {
          edges {
            node {
              opportunity { id name }
              company { id name }
            }
          }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const openTaskFilter = (
  assigneeId: string | null,
  window: { dueBefore?: string; dueAfter?: string },
) => {
  const filters: Record<string, unknown>[] = [
    { status: { in: ['TODO', 'IN_PROGRESS'] } },
  ];
  if (assigneeId) {
    filters.push({ assigneeId: { eq: assigneeId } });
  }
  if (window.dueBefore) {
    filters.push({ dueAt: { lte: window.dueBefore } });
  }
  if (window.dueAfter) {
    filters.push({ dueAt: { gt: window.dueAfter } });
  }
  return { and: filters };
};

export const fetchMyOpenTasks = async (
  assigneeId: string | null,
  window: { dueBefore?: string; dueAfter?: string; limit?: number } = {},
): Promise<Task[]> => {
  const data = await coreQuery<{ tasks: Connection<Task> }>(
    OPEN_TASKS_PAGE_QUERY,
    {
      filter: openTaskFilter(assigneeId, window),
      limit: window.limit ?? 100,
      after: null,
    },
  );

  return data.tasks.edges.map((e) => e.node);
};

// The full open-task list, for the tasks screen and any count that must be
// right rather than approximately right.
export const fetchAllOpenTasks = (
  assigneeId: string | null,
  window: { dueBefore?: string; dueAfter?: string } = {},
): Promise<PagedResult<Task>> =>
  fetchAllPages<Task>(async (after) => {
    const data = await coreQuery<{ tasks: Connection<Task> }>(
      OPEN_TASKS_PAGE_QUERY,
      { filter: openTaskFilter(assigneeId, window), limit: PAGE_SIZE, after },
    );
    return data.tasks;
  });

// Calendar: same task shape as fetchMyOpenTasks, but no status filter (DONE
// tasks are shown on the calendar too, styled differently) and a plain
// dueAt range instead of the today/upcoming split. Tasks with no dueAt are
// excluded by the gte/lte filter — there's no cell to place them in.
export const fetchTasksForCalendar = async (
  assigneeId: string,
  range: { fromIso: string; toIso: string },
): Promise<Task[]> => {
  const data = await coreQuery<{
    tasks: { edges: { node: Task }[] };
  }>(
    `query TasksForCalendar($filter: TaskFilterInput) {
      tasks(filter: $filter, first: 500, orderBy: [{ dueAt: AscNullsLast }]) {
        edges {
          node {
            id
            title
            status
            taskType
            dueAt
            createdAt
            bodyV2 { markdown }
            taskTargets {
              edges {
                node {
                  opportunity { id name }
                  company { id name }
                }
              }
            }
          }
        }
      }
    }`,
    {
      filter: {
        and: [
          { assigneeId: { eq: assigneeId } },
          { dueAt: { gte: range.fromIso } },
          { dueAt: { lte: range.toIso } },
        ],
      },
    },
  );

  return data.tasks.edges.map((e) => e.node);
};

export const setTaskStatus = async (
  taskId: string,
  status: 'TODO' | 'DONE',
): Promise<void> => {
  await coreQuery(
    `mutation SetTaskStatus($id: UUID!, $data: TaskUpdateInput!) {
      updateTask(id: $id, data: $data) { id }
    }`,
    { id: taskId, data: { status } },
  );
};

// Single task with its lead/company targets — for the task execution view.
export const fetchTask = async (taskId: string): Promise<Task> => {
  const data = await coreQuery<{ task: Task }>(
    `query TaskById($id: UUID) {
      task(filter: { id: { eq: $id } }) {
        id
        title
        status
        taskType
        dueAt
        createdAt
        bodyV2 { markdown }
        assignee { id name { firstName lastName } }
        taskTargets {
          edges {
            node {
              opportunity { id name }
              company { id name }
            }
          }
        }
      }
    }`,
    { id: taskId },
  );
  return data.task;
};

export const updateTask = async (
  taskId: string,
  update: Record<string, unknown>,
): Promise<void> => {
  await coreQuery(
    `mutation UpdateTaskFields($id: UUID!, $data: TaskUpdateInput!) {
      updateTask(id: $id, data: $data) { id }
    }`,
    { id: taskId, data: update },
  );
};

// ---------- create: task / note attached to a lead ----------

type LeadTargetIds = {
  opportunityId: string;
  companyId?: string | null;
};

export const createTaskForLead = async (input: {
  title: string;
  bodyMarkdown?: string;
  status: 'TODO' | 'DONE';
  taskType?: TaskType;
  dueAt: string | null;
  assigneeId: string;
  target: LeadTargetIds;
}): Promise<string> => {
  const created = await coreQuery<{ createTask: { id: string } }>(
    `mutation CreateTask($data: TaskCreateInput!) {
      createTask(data: $data) { id }
    }`,
    {
      data: {
        title: input.title,
        status: input.status,
        dueAt: input.dueAt,
        assigneeId: input.assigneeId,
        ...(input.taskType ? { taskType: input.taskType } : {}),
        ...(input.bodyMarkdown
          ? { bodyV2: { markdown: input.bodyMarkdown } }
          : {}),
      },
    },
  );

  await coreQuery(
    `mutation CreateTaskTarget($data: TaskTargetCreateInput!) {
      createTaskTarget(data: $data) { id }
    }`,
    {
      data: {
        taskId: created.createTask.id,
        targetOpportunityId: input.target.opportunityId,
        ...(input.target.companyId
          ? { targetCompanyId: input.target.companyId }
          : {}),
      },
    },
  );

  return created.createTask.id;
};

export const createNoteForLead = async (input: {
  title: string;
  bodyMarkdown: string;
  target: LeadTargetIds;
}): Promise<string> => {
  const created = await coreQuery<{ createNote: { id: string } }>(
    `mutation CreateNote($data: NoteCreateInput!) {
      createNote(data: $data) { id }
    }`,
    {
      data: {
        title: input.title,
        bodyV2: { markdown: input.bodyMarkdown },
      },
    },
  );

  await coreQuery(
    `mutation CreateNoteTarget($data: NoteTargetCreateInput!) {
      createNoteTarget(data: $data) { id }
    }`,
    {
      data: {
        noteId: created.createNote.id,
        targetOpportunityId: input.target.opportunityId,
        ...(input.target.companyId
          ? { targetCompanyId: input.target.companyId }
          : {}),
      },
    },
  );

  return created.createNote.id;
};

// Sellers type local numbers like "0764993011"; Twenty validates against the
// calling code, so normalize to +93 without the trunk zero. International
// numbers entered with "+" keep their own code.
export const normalizePhone = (
  raw: string,
): { primaryPhoneCallingCode: string; primaryPhoneNumber: string } | null => {
  const cleaned = raw.replace(/[\s\-()]/g, '');
  if (cleaned === '') return null;
  if (cleaned.startsWith('+93')) {
    return {
      primaryPhoneCallingCode: '+93',
      primaryPhoneNumber: cleaned.slice(3).replace(/^0/, ''),
    };
  }
  if (cleaned.startsWith('+')) {
    // Unknown foreign code: let the server validate the split.
    return {
      primaryPhoneCallingCode: cleaned.slice(0, 3),
      primaryPhoneNumber: cleaned.slice(3),
    };
  }
  return {
    primaryPhoneCallingCode: '+93',
    primaryPhoneNumber: cleaned.replace(/^0/, ''),
  };
};

// ---------- the one-page "register lead" flow ----------

export type NewLeadInput = {
  companyName: string;
  contactFirstName: string;
  contactLastName: string;
  contactPhone: string;
  contactEmail: string;
  temperature: 'HOT' | 'WARM' | 'COLD' | null;
  leadSource: string | null;
  marketer: string | null; // SELECT value (e.g. ALAVI) or null
  referrerId: string | null; // partner relation id or null
  firstContactNote: string;
  firstContactDate: string; // ISO
  followUpNote: string;
  followUpDate: string | null; // ISO or null to skip
  estimatedAmount: number | null; // plain amount in estimatedCurrency
  estimatedCurrency: string; // 'AFN' | 'USD'
  workspaceMemberId: string;
};

export type NewLeadResult = {
  opportunityId: string;
  companyId: string;
  personId: string;
};

// Sequential on purpose: each step depends on the previous id, and staying
// sequential keeps us far below the API rate limit (100 req/60s).
export const registerLead = async (
  input: NewLeadInput,
  onProgress: (step: string) => void,
): Promise<NewLeadResult> => {
  onProgress('ایجاد شرکت…');
  const companyData = await coreQuery<{ createCompany: { id: string } }>(
    `mutation CreateCompany($data: CompanyCreateInput!) {
      createCompany(data: $data) { id }
    }`,
    { data: { name: input.companyName.trim() } },
  );
  const companyId = companyData.createCompany.id;

  onProgress('ایجاد شخص تماس…');
  const hasContactName =
    input.contactFirstName.trim() !== '' || input.contactLastName.trim() !== '';
  let personId: string | null = null;
  if (hasContactName) {
    const personData = await coreQuery<{ createPerson: { id: string } }>(
      `mutation CreatePerson($data: PersonCreateInput!) {
        createPerson(data: $data) { id }
      }`,
      {
        data: {
          name: {
            firstName: input.contactFirstName.trim(),
            lastName: input.contactLastName.trim(),
          },
          companyId,
          ...(normalizePhone(input.contactPhone)
            ? { phones: normalizePhone(input.contactPhone) }
            : {}),
          ...(input.contactEmail.trim() !== ''
            ? { emails: { primaryEmail: input.contactEmail.trim() } }
            : {}),
        },
      },
    );
    personId = personData.createPerson.id;
  }

  onProgress('ایجاد لید…');
  const oppData = await coreQuery<{ createOpportunity: { id: string } }>(
    `mutation CreateOpportunity($data: OpportunityCreateInput!) {
      createOpportunity(data: $data) { id }
    }`,
    {
      data: {
        name: input.companyName.trim(),
        companyId,
        stage: 'NEW_LEAD',
        ownerId: input.workspaceMemberId,
        ...(personId ? { pointOfContactId: personId } : {}),
        ...(input.temperature ? { temperature: input.temperature } : {}),
        ...(input.leadSource ? { leadSource: input.leadSource } : {}),
        ...(input.referrerId ? { referrerId: input.referrerId } : {}),
        ...(input.estimatedAmount
          ? {
              amount: {
                amountMicros: Math.round(input.estimatedAmount * 1_000_000),
                currencyCode: input.estimatedCurrency || 'AFN',
              },
            }
          : {}),
      },
    },
  );
  const opportunityId = oppData.createOpportunity.id;
  const target = { opportunityId, companyId };

  // Marketer is a production-only SELECT field; set it best-effort so a lead
  // still registers on environments where the field doesn't exist.
  if (input.marketer) {
    try {
      await updateLead(opportunityId, { marketer: input.marketer });
    } catch {
      // field absent on this env — ignore
    }
  }

  if (input.firstContactNote.trim() !== '') {
    onProgress('ثبت تماس اول…');
    await createTaskForLead({
      title: `تماس اول — ${input.companyName.trim()}`,
      bodyMarkdown: input.firstContactNote.trim(),
      status: 'DONE',
      dueAt: input.firstContactDate,
      assigneeId: input.workspaceMemberId,
      target,
    });
    await createNoteForLead({
      title: `تماس اول — ${input.companyName.trim()}`,
      bodyMarkdown: input.firstContactNote.trim(),
      target,
    });
  }

  if (input.followUpDate !== null) {
    onProgress('ثبت پیگیری…');
    await createTaskForLead({
      title:
        input.followUpNote.trim() !== ''
          ? input.followUpNote.trim()
          : `پیگیری — ${input.companyName.trim()}`,
      status: 'TODO',
      dueAt: input.followUpDate,
      assigneeId: input.workspaceMemberId,
      target,
    });
  }

  return { opportunityId, companyId, personId: personId ?? '' };
};

// ---------- soft delete (this app never hard-deletes) ----------
//
// Twenty's `delete<Object>` mutation sets deletedAt: the record leaves every
// list but stays restorable from the CRM's trash view. `destroy<Object>` is the
// irreversible one, and it is deliberately absent from this module -- the
// Seller role is provisioned with canDestroyObjectRecords: false, so the server
// refuses it even if a caller went looking for it. records.test.ts asserts no
// destroy mutation ever appears here.

type DeletableObject = 'Opportunity' | 'Task' | 'Note';

// deletionReason is added by provision-deletion-reason.mjs. An instance that
// has not run it yet must still be able to delete, so the reason write is
// best-effort -- losing the record because we could not file the paperwork
// would be the worse failure.
const writeDeletionReason = async (
  objectName: DeletableObject,
  id: string,
  reason: string,
): Promise<boolean> => {
  try {
    await coreQuery(
      `mutation SetDeletionReason($id: UUID!, $data: ${objectName}UpdateInput!) {
        update${objectName}(id: $id, data: $data) { id }
      }`,
      { id, data: { deletionReason: reason } },
    );
    return true;
  } catch {
    return false;
  }
};

const softDeleteRecord = async (
  objectName: DeletableObject,
  id: string,
): Promise<void> => {
  await coreQuery(
    `mutation SoftDelete($id: UUID!) {
      delete${objectName}(id: $id) { id }
    }`,
    { id },
  );
};

// The reason is written before the delete so it lands while the record is
// still writable. Where the field is missing it becomes a note on the lead
// instead, which survives the delete and is visible when the lead is restored.
export const softDeleteLead = async (
  lead: { id: string; companyId?: string | null },
  reason: string,
): Promise<void> => {
  const trimmed = reason.trim();
  const stored = await writeDeletionReason('Opportunity', lead.id, trimmed);

  if (!stored) {
    try {
      await createNoteForLead({
        title: 'دلیل حذف لید',
        bodyMarkdown: trimmed,
        target: { opportunityId: lead.id, companyId: lead.companyId },
      });
    } catch {
      // The reason could not be filed anywhere; the delete still proceeds
      // because the seller asked for it and it stays reversible.
    }
  }

  await softDeleteRecord('Opportunity', lead.id);
};

export const softDeleteTask = async (
  taskId: string,
  reason: string,
): Promise<void> => {
  await writeDeletionReason('Task', taskId, reason.trim());
  await softDeleteRecord('Task', taskId);
};

export const softDeleteNote = async (
  noteId: string,
  reason: string,
): Promise<void> => {
  await writeDeletionReason('Note', noteId, reason.trim());
  await softDeleteRecord('Note', noteId);
};

// ---------- company panel (info + other contacts) ----------

export type CompanyInfo = {
  id: string;
  name: string;
  employees: number | null;
  domainName: { primaryLinkUrl: string | null } | null;
  address: {
    addressCity: string | null;
    addressStreet1: string | null;
  } | null;
  createdAt: string;
};

export type CompanyContact = {
  id: string;
  name: { firstName: string; lastName: string };
  jobTitle: string | null;
  phones: {
    primaryPhoneCallingCode: string | null;
    primaryPhoneNumber: string | null;
  } | null;
  emails: { primaryEmail: string | null } | null;
};

export const fetchCompanyInfo = async (
  companyId: string,
): Promise<CompanyInfo> => {
  const data = await coreQuery<{ company: CompanyInfo }>(
    `query CompanyInfo($id: UUID!) {
      company(filter: { id: { eq: $id } }) {
        id
        name
        employees
        domainName { primaryLinkUrl }
        address { addressCity addressStreet1 }
        createdAt
      }
    }`,
    { id: companyId },
  );
  return data.company;
};

// Fields that only exist on some instances (added ad hoc in production);
// fetched separately so the main query never breaks.
export const fetchCompanyExtras = async (
  companyId: string,
): Promise<{ businessType: string | null; productsServices: string | null }> => {
  try {
    const data = await coreQuery<{
      company: { businessType: string | null; productsServices: string | null };
    }>(
      `query CompanyExtras($id: UUID!) {
        company(filter: { id: { eq: $id } }) { businessType productsServices }
      }`,
      { id: companyId },
    );
    return data.company;
  } catch {
    return { businessType: null, productsServices: null };
  }
};

export const fetchCompanyContacts = async (
  companyId: string,
): Promise<CompanyContact[]> => {
  const data = await coreQuery<{
    people: { edges: { node: CompanyContact }[] };
  }>(
    `query CompanyContacts($companyId: UUID!) {
      people(filter: { companyId: { eq: $companyId } }, first: 50) {
        edges {
          node {
            id
            name { firstName lastName }
            jobTitle
            phones { primaryPhoneCallingCode primaryPhoneNumber }
            emails { primaryEmail }
          }
        }
      }
    }`,
    { companyId },
  );
  return data.people.edges.map((e) => e.node);
};

// Referrers/partners a lead can be attributed to (relation target of
// Opportunity.referrer). Defensive: the partner object may be absent on some
// environments, so callers get an empty list rather than a hard failure.
export type Referrer = {
  id: string;
  name: string;
  partnerType: string | null;
  commissionPercent: number | null;
};

export const fetchReferrers = async (): Promise<Referrer[]> => {
  try {
    const data = await coreQuery<{
      partners: { edges: { node: Referrer }[] };
    }>(
      `query Partners {
        partners(first: 200, orderBy: [{ name: AscNullsLast }]) {
          edges { node { id name partnerType commissionPercent } }
        }
      }`,
    );
    return data.partners.edges.map((e) => e.node);
  } catch {
    return [];
  }
};

// Marketer is a production-only SELECT field on Opportunity.
export const fetchLeadMarketer = async (
  opportunityId: string,
): Promise<string | null> => {
  try {
    const data = await coreQuery<{ opportunity: { marketer: string | null } }>(
      `query LeadMarketer($id: UUID!) {
        opportunity(filter: { id: { eq: $id } }) { marketer }
      }`,
      { id: opportunityId },
    );
    return data.opportunity.marketer;
  } catch {
    return null;
  }
};

// Bulk variant for reports: one marketer per lead id, in a single request.
// Same defensive try/catch as fetchLeadMarketer — the field doesn't exist on
// every environment (e.g. local dev), so callers must treat {} as "no data".
export const fetchLeadsMarketers = async (
  ids: string[],
): Promise<Record<string, string | null>> => {
  if (ids.length === 0) return {};
  try {
    const data = await coreQuery<{
      opportunities: { edges: { node: { id: string; marketer: string | null } }[] };
    }>(
      `query LeadsMarketers($ids: [UUID!]!, $limit: Int!) {
        opportunities(filter: { id: { in: $ids } }, first: $limit) {
          edges { node { id marketer } }
        }
      }`,
      { ids, limit: ids.length },
    );
    return Object.fromEntries(
      data.opportunities.edges.map((e) => [e.node.id, e.node.marketer]),
    );
  } catch {
    return {};
  }
};

// ---------- pricing: deal products + quotations ----------

export type DealProductLine = {
  id: string;
  name: string;
  quantity: number | null;
  discountPercent: number | null;
  lineStatus: string | null;
  installPrice: { amountMicros: number | null; currencyCode: string | null } | null;
  annualPrice: { amountMicros: number | null; currencyCode: string | null } | null;
  product: { id: string; name: string } | null;
};

export type QuotationRow = {
  id: string;
  name: string;
  quoteNumber: string | null;
  status: string | null;
  issuedAt: string | null;
  validUntil: string | null;
  agreedPrice: { amountMicros: number | null; currencyCode: string | null } | null;
};

export const fetchLeadPricing = async (
  opportunityId: string,
): Promise<{ dealProducts: DealProductLine[]; quotations: QuotationRow[] }> => {
  const [dealProducts, quotations] = await Promise.all([
    coreQuery<{ dealProducts: { edges: { node: DealProductLine }[] } }>(
      `query LeadDealProducts($oppId: UUID!) {
        dealProducts(filter: { opportunityId: { eq: $oppId } }, first: 50) {
          edges {
            node {
              id
              name
              quantity
              discountPercent
              lineStatus
              installPrice { amountMicros currencyCode }
              annualPrice { amountMicros currencyCode }
              product { id name }
            }
          }
        }
      }`,
      { oppId: opportunityId },
    )
      .then((d) => d.dealProducts.edges.map((e) => e.node))
      .catch(() => [] as DealProductLine[]),
    coreQuery<{ quotations: { edges: { node: QuotationRow }[] } }>(
      `query LeadQuotations($oppId: UUID!) {
        quotations(filter: { opportunityId: { eq: $oppId } }, first: 50) {
          edges {
            node {
              id
              name
              quoteNumber
              status
              issuedAt
              validUntil
              agreedPrice { amountMicros currencyCode }
            }
          }
        }
      }`,
      { oppId: opportunityId },
    )
      .then((d) => d.quotations.edges.map((e) => e.node))
      .catch(() => [] as QuotationRow[]),
  ]);
  return { dealProducts, quotations };
};

export type ProductOption = {
  id: string;
  name: string;
  // Catalog taxonomy — the picker groups by category and shows the brand, so a
  // seller can find a product in a catalog that has outgrown a flat list.
  brand: string | null;
  category: string | null;
  baseInstallPrice: { amountMicros: number | null; currencyCode: string | null } | null;
  baseAnnualPrice: { amountMicros: number | null; currencyCode: string | null } | null;
  // A PER_FACTOR product prices off its own metric table -- for the metrics no
  // package tiers, and for every metric when the seller picks no package. The
  // deal-line form collects a quantity per metric.
  pricingModel: string | null;
  pricingFactors: PricingFactor[] | null;
  // Fixed amounts per currency, so the deal-line form can suggest the right
  // numbers when the seller quotes in USD rather than AFN.
  priceBook: ProductPriceBook | null;
};

// brand/category/priceBook only exist once their provisioning script has run
// on the instance; one unknown field fails the whole document, so drop
// whichever the server rejects rather than lose the pricing panel. Same
// pattern as catalog.ts and admin.ts's `link`.
const missingProductFieldFromError = (
  error: unknown,
  candidates: string[],
): string | undefined =>
  error instanceof Error
    ? candidates.find((name) =>
        // Reads are rejected as `Cannot query field "x"`, writes as
        // `Field "x" is not defined by type ...` -- the name lands on either
        // side of the phrase depending on which.
        new RegExp(
          `(Cannot query field|is not defined by type).*"${name}"|"${name}".*is not defined by type`,
          'i',
        ).test(error.message),
      )
    : undefined;

export const fetchProducts = async (): Promise<ProductOption[]> => {
  const run = async (optionalFields: string[]) => {
    const data = await coreQuery<{
      products: { edges: { node: ProductOption }[] };
    }>(
      `query Products {
        products(first: 100, orderBy: [{ name: AscNullsLast }]) {
          edges {
            node {
              id
              name
              ${optionalFields.join('\n              ')}
              pricingModel
              pricingFactors
              baseInstallPrice { amountMicros currencyCode }
              baseAnnualPrice { amountMicros currencyCode }
            }
          }
        }
      }`,
    );
    return data.products.edges.map((e) => ({
      ...e.node,
      brand: e.node.brand ?? null,
      category: e.node.category ?? null,
      priceBook: parsePriceBook(e.node.priceBook),
    }));
  };

  // Grouped by provisioning script: an instance missing `brand` is missing
  // `category` too, so they are dropped together.
  let groups = [['brand', 'category'], ['priceBook']];

  for (;;) {
    try {
      return await run(groups.flat());
    } catch (error) {
      const remaining = groups.filter(
        (group) =>
          missingProductFieldFromError(error, group) === undefined,
      );
      if (remaining.length === groups.length) throw error;
      groups = remaining;
    }
  }
};

// The server-side PRE hook computes installPrice from the product's pricing
// model (or the Pricing Version's tier schedule, when pricingVersionId is
// set) and applies the Discount Rule, when discountRuleId is set -- so we
// only send the linkage + whichever selections the seller made.
export const addProductToLead = async (input: {
  opportunityId: string;
  productId: string;
  productName: string;
  quantity: number;
  factorQuantities?: Record<string, number>;
  pricingVersionId?: string;
  discountRuleId?: string;
  // Rates the seller restated for this line only -- the hook re-prices from
  // them instead of the catalog. Omitted when nothing was changed.
  priceOverrides?: LinePriceOverridesPayload;
}): Promise<void> => {
  const data: Record<string, unknown> = {
    name: input.productName,
    opportunityId: input.opportunityId,
    productId: input.productId,
    quantity: input.quantity,
    ...(input.factorQuantities ? { factorQuantities: input.factorQuantities } : {}),
    ...(input.pricingVersionId ? { pricingVersionId: input.pricingVersionId } : {}),
    ...(input.discountRuleId ? { discountRuleId: input.discountRuleId } : {}),
    ...(input.priceOverrides ? { priceOverrides: input.priceOverrides } : {}),
  };

  const run = (payload: Record<string, unknown>) =>
    coreQuery(
      `mutation AddDealProduct($data: DealProductCreateInput!) {
        createDealProduct(data: $data) { id }
      }`,
      { data: payload },
    );

  try {
    await run(data);
  } catch (error) {
    // An instance without provision-line-pricing-multicurrency.mjs run yet
    // doesn't know priceOverrides. Saving the line at catalog prices beats
    // losing it -- the seller sees the price it got and can correct it in the
    // CRM; a lost line is silent.
    if (
      input.priceOverrides === undefined ||
      missingProductFieldFromError(error, ['priceOverrides']) === undefined
    ) {
      throw error;
    }
    const { priceOverrides: _dropped, ...withoutOverrides } = data;
    await run(withoutOverrides);
  }
};

// ---------- reports ----------

export type DoneTask = {
  id: string;
  title: string;
  updatedAt: string;
  taskType: TaskType | null;
  bodyV2: { markdown: string | null } | null;
  assignee: { id: string; name: { firstName: string; lastName: string } } | null;
};

// assigneeId omitted = every seller's done tasks since sinceIso (used for
// team-wide reporting); passed = one seller's (used for "my" reports).
const DONE_TASKS_PAGE_QUERY = `query DoneTasksSince($filter: TaskFilterInput, $limit: Int, $after: String) {
  tasks(
    filter: $filter
    first: $limit
    after: $after
    orderBy: [{ updatedAt: DescNullsLast }]
  ) {
    edges {
      node {
        id
        title
        updatedAt
        taskType
        bodyV2 { markdown }
        assignee { id name { firstName lastName } }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const doneTaskFilter = (sinceIso: string, assigneeId?: string) => {
  const filters: Record<string, unknown>[] = [
    { status: { eq: 'DONE' } },
    { updatedAt: { gte: sinceIso } },
  ];
  if (assigneeId) {
    filters.push({ assigneeId: { eq: assigneeId } });
  }
  return { and: filters };
};

// Every done task in the period. A team-wide month easily passes the old
// single-page 200 cap, which made the activity mix and the seller
// leaderboard's task counts describe a subset of the period.
export const fetchAllDoneTasksSince = (
  sinceIso: string,
  assigneeId?: string,
): Promise<PagedResult<DoneTask>> =>
  fetchAllPages<DoneTask>(async (after) => {
    const data = await coreQuery<{ tasks: Connection<DoneTask> }>(
      DONE_TASKS_PAGE_QUERY,
      { filter: doneTaskFilter(sinceIso, assigneeId), limit: PAGE_SIZE, after },
    );
    return data.tasks;
  });

export const fetchDoneTasksSince = async (
  sinceIso: string,
  assigneeId?: string,
): Promise<DoneTask[]> =>
  (await fetchAllDoneTasksSince(sinceIso, assigneeId)).items;

// Deal-product lines created in the period, across all leads -- powers the
// Products report. Defensive try/catch (same precedent as fetchLeadPricing):
// where the dealProduct object isn't provisioned (local dev), returns [] so
// the Products tab degrades to an empty state instead of erroring.
export type DealProductStat = {
  id: string;
  name: string;
  quantity: number | null;
  discountPercent: number | null;
  installPrice: { amountMicros: number | null; currencyCode?: string | null } | null;
  annualPrice: { amountMicros: number | null; currencyCode?: string | null } | null;
  product: { id: string; name: string } | null;
  createdAt: string;
};

const DEAL_PRODUCTS_PAGE_QUERY = `query DealProductsSince($filter: DealProductFilterInput, $limit: Int, $after: String) {
  dealProducts(
    filter: $filter
    first: $limit
    after: $after
    orderBy: [{ createdAt: DescNullsLast }]
  ) {
    edges {
      node {
        id
        name
        quantity
        discountPercent
        installPrice { amountMicros currencyCode }
        annualPrice { amountMicros currencyCode }
        product { id name }
        createdAt
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

export const fetchAllDealProductsSince = (
  sinceIso: string,
): Promise<PagedResult<DealProductStat>> =>
  fetchAllPages<DealProductStat>(async (after) => {
    const data = await coreQuery<{ dealProducts: Connection<DealProductStat> }>(
      DEAL_PRODUCTS_PAGE_QUERY,
      { filter: { createdAt: { gte: sinceIso } }, limit: PAGE_SIZE, after },
    );
    return data.dealProducts;
  }).catch(() => ({ items: [] as DealProductStat[], truncated: false }));

export const fetchDealProductsSince = async (
  sinceIso: string,
): Promise<DealProductStat[]> =>
  (await fetchAllDealProductsSince(sinceIso)).items;

// ---------- comprehensive search (native tsvector full-text) ----------

// Twenty's search vectors index names AND long text: task/note bodies,
// person emails/phones — so deep search reaches inside details.
export type SearchHit = {
  recordId: string;
  objectNameSingular: string;
  label: string;
};

export const globalSearch = async (
  searchInput: string,
  limit = 16,
): Promise<SearchHit[]> => {
  const data = await coreQuery<{
    search: { edges: { node: SearchHit }[] };
  }>(
    `query GlobalSearch($s: String!, $limit: Int!, $included: [String!]) {
      search(
        searchInput: $s
        limit: $limit
        includedObjectNameSingulars: $included
      ) {
        edges { node { recordId objectNameSingular label } }
      }
    }`,
    {
      s: searchInput,
      limit,
      included: ['opportunity', 'person', 'company', 'task', 'note'],
    },
  );
  return data.search.edges.map((e) => e.node);
};

// Every search hit opens its own page — no dead ends.
export const searchHitRoute = (hit: SearchHit): string => {
  switch (hit.objectNameSingular) {
    case 'opportunity':
      return `/lead/${hit.recordId}`;
    case 'task':
      return `/task/${hit.recordId}`;
    case 'note':
      return `/note/${hit.recordId}`;
    case 'person':
      return `/person/${hit.recordId}`;
    case 'company':
      return `/company/${hit.recordId}`;
    default:
      return `/lead/${hit.recordId}`;
  }
};

// ---------- entity viewers (note / person / company pages) ----------

export type NoteDetail = {
  id: string;
  title: string;
  createdAt: string;
  createdBy: { name: string | null } | null;
  bodyV2: { markdown: string | null } | null;
  targets: {
    opportunity: { id: string; name: string } | null;
    company: { id: string; name: string } | null;
    person: {
      id: string;
      name: { firstName: string; lastName: string };
    } | null;
  }[];
};

export const fetchNote = async (id: string): Promise<NoteDetail> => {
  const data = await coreQuery<{
    note: {
      id: string;
      title: string;
      createdAt: string;
      createdBy: { name: string | null } | null;
      bodyV2: { markdown: string | null } | null;
      noteTargets: {
        edges: {
          node: {
            opportunity: { id: string; name: string } | null;
            company: { id: string; name: string } | null;
            person: {
              id: string;
              name: { firstName: string; lastName: string };
            } | null;
          };
        }[];
      };
    };
  }>(
    `query NoteDetail($id: UUID!) {
      note(filter: { id: { eq: $id } }) {
        id
        title
        createdAt
        createdBy { name }
        bodyV2 { markdown }
        noteTargets {
          edges {
            node {
              opportunity { id name }
              company { id name }
              person { id name { firstName lastName } }
            }
          }
        }
      }
    }`,
    { id },
  );
  return {
    id: data.note.id,
    title: data.note.title,
    createdAt: data.note.createdAt,
    createdBy: data.note.createdBy,
    bodyV2: data.note.bodyV2,
    targets: data.note.noteTargets.edges.map((e) => e.node),
  };
};

export const updateNote = async (
  noteId: string,
  update: Record<string, unknown>,
): Promise<void> => {
  await coreQuery(
    `mutation UpdateNoteFields($id: UUID!, $data: NoteUpdateInput!) {
      updateNote(id: $id, data: $data) { id }
    }`,
    { id: noteId, data: update },
  );
};

export type PersonDetail = {
  id: string;
  name: { firstName: string; lastName: string };
  jobTitle: string | null;
  phones: {
    primaryPhoneCallingCode: string | null;
    primaryPhoneNumber: string | null;
  } | null;
  emails: { primaryEmail: string | null } | null;
  company: { id: string; name: string } | null;
  createdAt: string;
};

export const fetchPerson = async (id: string): Promise<PersonDetail> => {
  const data = await coreQuery<{ person: PersonDetail }>(
    `query PersonDetail($id: UUID!) {
      person(filter: { id: { eq: $id } }) {
        id
        name { firstName lastName }
        jobTitle
        phones { primaryPhoneCallingCode primaryPhoneNumber }
        emails { primaryEmail }
        company { id name }
        createdAt
      }
    }`,
    { id },
  );
  return data.person;
};

// --- restored (required by QuickTaskModal.tsx) ---
export const createQuickTask = async (input: {
  title: string;
  status: 'TODO' | 'DONE';
  taskType?: TaskType;
  dueAt: string | null;
  assigneeId: string;
}): Promise<string> => {
  const created = await coreQuery<{ createTask: { id: string } }>(
    `mutation CreateQuickTask($data: TaskCreateInput!) {
      createTask(data: $data) { id }
    }`,
    {
      data: {
        title: input.title,
        status: input.status,
        dueAt: input.dueAt,
        assigneeId: input.assigneeId,
        ...(input.taskType ? { taskType: input.taskType } : {}),
      },
    },
  );
  return created.createTask.id;
};

