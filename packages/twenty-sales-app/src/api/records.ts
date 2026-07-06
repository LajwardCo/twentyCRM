import { coreQuery } from './client';

// ---------- shared types ----------

export type Task = {
  id: string;
  title: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | null;
  dueAt: string | null;
  createdAt: string;
  bodyV2: { markdown: string | null } | null;
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
`;

// ---------- leads ----------

export const fetchLeads = async (options: {
  search?: string;
  ownerId?: string;
  openOnly?: boolean;
  limit?: number;
}): Promise<LeadSummary[]> => {
  const filters: Record<string, unknown>[] = [];
  if (options.search) {
    filters.push({ name: { ilike: `%${options.search}%` } });
  }
  if (options.openOnly) {
    filters.push({ stage: { in: OPEN_STAGES } });
  }
  if (options.ownerId) {
    filters.push({ ownerId: { eq: options.ownerId } });
  }

  const data = await coreQuery<{
    opportunities: { edges: { node: LeadSummary }[] };
  }>(
    `query Leads($filter: OpportunityFilterInput, $limit: Int) {
      opportunities(
        filter: $filter
        first: $limit
        orderBy: [{ createdAt: DescNullsLast }]
      ) {
        edges { node { ${LEAD_FIELDS} } }
      }
    }`,
    {
      filter: filters.length > 0 ? { and: filters } : undefined,
      limit: options.limit ?? 60,
    },
  );

  return data.opportunities.edges.map((e) => e.node);
};

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
export const fetchMyOpenTasks = async (
  assigneeId: string,
  window: { dueBefore?: string; dueAfter?: string; limit?: number } = {},
): Promise<Task[]> => {
  const filters: Record<string, unknown>[] = [
    { assigneeId: { eq: assigneeId } },
    { status: { in: ['TODO', 'IN_PROGRESS'] } },
  ];
  if (window.dueBefore) {
    filters.push({ dueAt: { lte: window.dueBefore } });
  }
  if (window.dueAfter) {
    filters.push({ dueAt: { gt: window.dueAfter } });
  }

  const data = await coreQuery<{
    tasks: { edges: { node: Task }[] };
  }>(
    `query MyOpenTasks($filter: TaskFilterInput, $limit: Int) {
      tasks(filter: $filter, first: $limit, orderBy: [{ dueAt: AscNullsLast }]) {
        edges {
          node {
            id
            title
            status
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
      filter: { and: filters },
      limit: window.limit ?? 100,
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

// ---------- create: task / note attached to a lead ----------

type LeadTargetIds = {
  opportunityId: string;
  companyId?: string | null;
};

export const createTaskForLead = async (input: {
  title: string;
  bodyMarkdown?: string;
  status: 'TODO' | 'DONE';
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
  firstContactNote: string;
  firstContactDate: string; // ISO
  followUpNote: string;
  followUpDate: string | null; // ISO or null to skip
  estimatedAmountAfn: number | null; // plain AFN, converted to micros
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
        ...(input.estimatedAmountAfn
          ? {
              amount: {
                amountMicros: Math.round(input.estimatedAmountAfn * 1_000_000),
                currencyCode: 'AFN',
              },
            }
          : {}),
      },
    },
  );
  const opportunityId = oppData.createOpportunity.id;
  const target = { opportunityId, companyId };

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
