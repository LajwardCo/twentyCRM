// Turning Twenty's timelineActivity rows into a change log a seller can read.
//
// The server already records every write to every object -- created, updated,
// deleted, restored -- with a before/after diff, on its own. Nothing here adds
// tracking; this module only decides which of those rows say something a person
// can act on, and how to say it in Persian.
//
// Kept free of network and React so the filtering rules can be tested directly.
import { formatMoney } from './format';
import { formatJalaliDateTime } from './jalali';
import {
  MARKETER_LABELS,
  PARTNER_TYPE_LABELS,
  SOURCE_LABELS,
  STAGE_LABELS,
  TASK_TYPE_LABELS,
  TEMP_LABELS,
} from './strings';

export type ActivityRow = {
  id: string;
  name: string;
  happensAt: string;
  properties: { diff?: Record<string, { before: unknown; after: unknown }> } | null;
  workspaceMember: { name: { firstName: string; lastName: string } | null } | null;
  linkedRecordCachedName: string | null;
};

export type AuditAction = 'created' | 'updated' | 'deleted' | 'restored';

export type AuditChange = {
  field: string;
  label: string;
  before: string;
  after: string;
};

export type AuditEntry = {
  id: string;
  at: string;
  action: AuditAction;
  objectName: string;
  actor: string;
  subject: string | null;
  changes: AuditChange[];
};

const ACTIONS = new Set<AuditAction>(['created', 'updated', 'deleted', 'restored']);

// The server writes note/task activity twice: once under the object's own name
// and once as `linked-<type>.<action>` carrying the record it was attached to.
export const parseActivityName = (
  name: string,
): { objectName: string; action: AuditAction } | null => {
  const separator = name.lastIndexOf('.');
  if (separator <= 0) return null;

  const action = name.slice(separator + 1);
  if (!ACTIONS.has(action as AuditAction)) return null;

  return {
    objectName: name.slice(0, separator).replace(/^linked-/, ''),
    action: action as AuditAction,
  };
};

// Fields the server maintains for itself. They change on every write, describe
// no decision anyone made, and would otherwise be most of the log.
const BOOKKEEPING_FIELDS = new Set([
  'updatedBy',
  'createdBy',
  'position',
  'searchVector',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'stageChangedAt',
]);

// Rich text: the diff is a BlockNote document, unreadable and enormous.
const RICH_TEXT_FIELDS = new Set(['body', 'bodyV2', 'note', 'description']);

const FIELD_LABELS: Record<string, string> = {
  name: 'نام',
  stage: 'مرحله',
  temperature: 'دما',
  leadSource: 'منبع لید',
  amount: 'ارزش تخمینی',
  agreedPrice: 'قیمت توافقی',
  agreedAt: 'تاریخ توافق',
  closeDate: 'تاریخ بستن',
  pointOfContact: 'شخص تماس',
  pointOfContactId: 'شخص تماس',
  referrer: 'معرف',
  referrerId: 'معرف',
  marketer: 'بازاریاب',
  marketerPartner: 'بازاریاب',
  marketerPartnerId: 'بازاریاب',
  owner: 'مسئول',
  ownerId: 'مسئول',
  company: 'شرکت',
  companyId: 'شرکت',
  deletionReason: 'دلیل حذف',
  status: 'وضعیت',
  title: 'عنوان',
  dueAt: 'موعد',
  taskType: 'نوع کار',
  assignee: 'مسئول',
  assigneeId: 'مسئول',
  bodyV2: 'متن',
  body: 'متن',
  emails: 'ایمیل',
  phones: 'تلفن',
  jobTitle: 'سمت',
  city: 'شهر',
  partnerType: 'نوع همکار',
  commissionPercent: 'درصد کمیسیون',
  quantity: 'تعداد',
  unitPrice: 'قیمت واحد',
  threatLevel: 'سطح تهدید',
  tier: 'رده',
  strengths: 'نقاط قوت',
  weaknesses: 'نقاط ضعف',
};

// Enum-ish fields whose stored value is a code the seller never types.
const VALUE_LABELS: Record<string, Record<string, string>> = {
  stage: STAGE_LABELS,
  temperature: TEMP_LABELS,
  leadSource: SOURCE_LABELS,
  marketer: MARKETER_LABELS,
  partnerType: PARTNER_TYPE_LABELS,
  taskType: TASK_TYPE_LABELS,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const formatValue = (field: string, value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';

  const labels = VALUE_LABELS[field];
  if (labels && typeof value === 'string') return labels[value] ?? value;

  if (isRecord(value)) {
    // Twenty's composite fields, in the shapes this app actually stores.
    if ('amountMicros' in value) {
      const micros = value.amountMicros;
      if (typeof micros !== 'number') return '—';
      return formatMoney(micros, String(value.currencyCode ?? 'AFN'));
    }
    if ('firstName' in value || 'lastName' in value) {
      const full = `${value.firstName ?? ''} ${value.lastName ?? ''}`.trim();
      return full === '' ? '—' : full;
    }
    if ('primaryEmail' in value) return String(value.primaryEmail || '—');
    if ('primaryPhoneNumber' in value)
      return String(value.primaryPhoneNumber || '—');
    if ('primaryLinkUrl' in value) return String(value.primaryLinkUrl || '—');
    if ('name' in value) return String(value.name || '—');
    return '—';
  }

  if (typeof value === 'boolean') return value ? 'بله' : 'خیر';

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return formatJalaliDateTime(value);
  }

  return String(value);
};

const RICH_TEXT_CHANGED = 'متن تغییر کرد';

const humanizeDiff = (
  diff: Record<string, { before: unknown; after: unknown }>,
): AuditChange[] =>
  Object.entries(diff)
    .filter(([field]) => !BOOKKEEPING_FIELDS.has(field))
    .map(([field, { before, after }]) => ({
      field,
      label: FIELD_LABELS[field] ?? field,
      ...(RICH_TEXT_FIELDS.has(field)
        ? { before: '', after: RICH_TEXT_CHANGED }
        : { before: formatValue(field, before), after: formatValue(field, after) }),
    }))
    // A diff can survive formatting and still say nothing -- an empty string and
    // a null both read as "—", and a row saying "— ← —" is noise.
    .filter((change) => change.before !== change.after);

const actorName = (row: ActivityRow): string => {
  const name = row.workspaceMember?.name;
  const full = `${name?.firstName ?? ''} ${name?.lastName ?? ''}`.trim();
  return full === '' ? 'سیستم' : full;
};

// Returns null for a row with nothing left to show, so callers can filter in
// one pass rather than rendering blanks.
export const humanizeActivity = (row: ActivityRow): AuditEntry | null => {
  const parsed = parseActivityName(row.name);
  if (parsed === null) return null;

  const changes = humanizeDiff(row.properties?.diff ?? {});

  // Creations and deletions are events in their own right and carry no diff.
  // An update that filtered down to nothing was pure bookkeeping.
  if (parsed.action === 'updated' && changes.length === 0) return null;

  return {
    id: row.id,
    at: row.happensAt,
    action: parsed.action,
    objectName: parsed.objectName,
    actor: actorName(row),
    subject: row.linkedRecordCachedName?.trim() || null,
    changes,
  };
};

export const toAuditEntries = (rows: ActivityRow[]): AuditEntry[] =>
  rows
    .map(humanizeActivity)
    .filter((entry): entry is AuditEntry => entry !== null)
    .sort((a, b) => b.at.localeCompare(a.at));
