import {
  buildExportTable,
  buildQuestionColumns,
} from '../lib/forms/responses/responseExport';
import {
  type AttachmentKind,
  type ChatAttachment,
  type ResolvedAttachment,
} from '../lib/assistantContext';
import { formatDateTime, formatMoney, fullPhone, personName } from '../lib/format';
import { leadContextText } from '../lib/leadContext';
import { STAGE_LABELS, TASK_TYPE_LABELS } from '../lib/strings';
import {
  fetchCompanyContacts,
  fetchCompanyInfo,
  fetchLead,
  fetchLeadNotes,
  fetchLeadTasks,
  fetchNote,
  fetchPerson,
  fetchTask,
  globalSearch,
} from './records';
import { fetchResponse, fetchVersion, listResponses } from './surveys';

// Finding and reading the records a seller attaches to an assistant message.
// Everything goes through the seller's own token, so the assistant can only
// ever be handed what the seller could open on screen.

const SEARCH_OBJECT: Record<Exclude<AttachmentKind, 'survey'>, string> = {
  lead: 'opportunity',
  person: 'person',
  company: 'company',
  task: 'task',
  note: 'note',
};

const SEARCH_LIMIT = 12;

export type AttachmentCandidate = ChatAttachment & {
  hint: string | null;
};

export const searchAttachments = async (
  kind: AttachmentKind,
  query: string,
): Promise<AttachmentCandidate[]> => {
  if (kind === 'survey') {
    // Surveys exist only where provision-surveys.mjs has run; elsewhere the
    // filter type is unknown and there is simply nothing to attach.
    try {
      const page = await listResponses(
        { search: query, excludeSpam: true },
        { first: SEARCH_LIMIT },
      );
      return page.responses.map((response) => ({
        kind,
        id: response.id,
        label: response.name || response.form?.name || response.id,
        hint: [response.form?.name, response.city, formatDateTime(response.collectedAt)]
          .filter((part) => part && part !== '—')
          .join(' · '),
      }));
    } catch {
      return [];
    }
  }

  const hits = await globalSearch(query, SEARCH_LIMIT, [SEARCH_OBJECT[kind]]);
  return hits.map((hit) => ({
    kind,
    id: hit.recordId,
    label: hit.label,
    hint: null,
  }));
};

const lines = (...entries: [string, string | null | undefined][]): string =>
  entries
    .filter(([, value]) => value !== null && value !== undefined && value !== '' && value !== '—')
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');

const describeLead = async (id: string): Promise<string> => {
  const [lead, tasks, notes] = await Promise.all([
    fetchLead(id),
    fetchLeadTasks(id).catch(() => []),
    fetchLeadNotes(id).catch(() => []),
  ]);
  const amount = lead.amount?.amountMicros
    ? formatMoney(lead.amount.amountMicros, lead.amount.currencyCode)
    : null;

  return [
    leadContextText(lead, tasks, notes),
    amount ? `Deal amount: ${amount}` : '',
  ]
    .filter(Boolean)
    .join('\n');
};

const describePerson = async (id: string): Promise<string> => {
  const person = await fetchPerson(id);
  return lines(
    ['Contact', personName(person)],
    ['Job title', person.jobTitle],
    ['Phone', fullPhone(person.phones)],
    ['Email', person.emails?.primaryEmail],
    ['Company', person.company?.name],
    ['Created', formatDateTime(person.createdAt)],
  );
};

const describeCompany = async (id: string): Promise<string> => {
  const [company, contacts] = await Promise.all([
    fetchCompanyInfo(id),
    fetchCompanyContacts(id).catch(() => []),
  ]);
  const address = company.address
    ? [
        company.address.addressStreet1,
        company.address.addressStreet2,
        company.address.addressCity,
        company.address.addressState,
        company.address.addressCountry,
      ]
        .filter(Boolean)
        .join('، ')
    : null;

  const header = lines(
    ['Company', company.name],
    ['Employees', company.employees === null ? null : String(company.employees)],
    ['Website', company.domainName?.primaryLinkUrl],
    ['Address', address],
    ['Created', formatDateTime(company.createdAt)],
  );
  const people = contacts.map(
    (contact) =>
      `- ${personName(contact)}${contact.jobTitle ? ` (${contact.jobTitle})` : ''}${
        fullPhone(contact.phones) ? ` ${fullPhone(contact.phones)}` : ''
      }`,
  );

  return people.length > 0 ? `${header}\nContacts:\n${people.join('\n')}` : header;
};

const describeTask = async (id: string): Promise<string> => {
  const task = await fetchTask(id);
  const targets = (task.taskTargets?.edges ?? [])
    .map(({ node }) => node.opportunity?.name ?? node.company?.name)
    .filter(Boolean)
    .join('، ');

  return [
    lines(
      ['Task', task.title],
      ['Status', task.status],
      ['Type', task.taskType ? TASK_TYPE_LABELS[task.taskType] ?? task.taskType : null],
      ['Due', formatDateTime(task.dueAt)],
      ['Assignee', task.assignee ? personName(task.assignee) : null],
      ['Related to', targets],
    ),
    task.bodyV2?.markdown ?? '',
  ]
    .filter(Boolean)
    .join('\n');
};

const describeNote = async (id: string): Promise<string> => {
  const note = await fetchNote(id);
  const targets = note.targets
    .map((target) =>
      target.opportunity?.name ??
      target.company?.name ??
      (target.person ? personName(target.person) : null),
    )
    .filter(Boolean)
    .join('، ');

  return [
    lines(
      ['Note', note.title],
      ['Written', formatDateTime(note.createdAt)],
      ['Author', note.createdBy?.name],
      ['Related to', targets],
    ),
    note.bodyV2?.markdown ?? '',
  ]
    .filter(Boolean)
    .join('\n');
};

// Question and answer pairs rendered with the response's own form version,
// the same way the spreadsheet export does.
const describeSurvey = async (id: string): Promise<string> => {
  const response = await fetchResponse(id);
  if (response === null) throw new Error('not found');

  const version = await fetchVersion(response.formVersionId).catch(() => null);
  const header = lines(
    ['Survey form', response.form?.name],
    ['Respondent', response.name],
    ['Company', response.company?.name],
    ['Contact', response.person ? personName(response.person) : null],
    ['Lead', response.opportunity?.name],
    [
      'Lead stage',
      response.opportunity?.stage
        ? STAGE_LABELS[response.opportunity.stage] ?? response.opportunity.stage
        : null,
    ],
    ['Buying interest', response.buyingInterest],
    ['City', response.city],
    ['Area', response.area],
    ['Collected', formatDateTime(response.collectedAt)],
    ['Collector', response.collector ? personName(response.collector) : null],
    ['Visit outcome', response.visit?.visitOutcome],
  );

  if (version === null) return header;

  const formNames = new Map([[response.formId, response.form?.name ?? '']]);
  const table = buildExportTable([response], [version], formNames);
  // The export's leading columns are metadata already covered above; the
  // question columns are the last ones.
  const questionCount = buildQuestionColumns([version], formNames).length;
  const firstQuestion = table.headers.length - questionCount;
  const [row] = table.rows;
  const answers = table.headers
    .map((question, index) => [question, row[index]] as const)
    .slice(firstQuestion)
    .filter(([, answer]) => answer !== undefined && answer !== '')
    .map(([question, answer]) => `- ${question}: ${answer}`);

  return `${header}\nAnswers:\n${answers.join('\n')}`;
};

const DESCRIBERS: Record<AttachmentKind, (id: string) => Promise<string>> = {
  lead: describeLead,
  person: describePerson,
  company: describeCompany,
  task: describeTask,
  note: describeNote,
  survey: describeSurvey,
};

export const resolveAttachment = async (
  attachment: ChatAttachment,
): Promise<ResolvedAttachment> => ({
  ...attachment,
  text: await DESCRIBERS[attachment.kind](attachment.id),
});
