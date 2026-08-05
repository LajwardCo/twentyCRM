import { type Member } from '../api/admin';
import {
  LEAD_SOURCES,
  STAGES,
  type LeadSummary,
  type Referrer,
} from '../api/records';
import { type CatalogProduct } from '../api/catalog';
import {
  type FilterField,
  type FilterOption,
  type FilterValue,
} from './filters';
import {
  COMPETITOR_STATUS_LABELS,
  COMPETITOR_THREAT_LABELS,
  COMPETITOR_TIER_LABELS,
  SOURCE_LABELS,
  STAGE_LABELS,
  T7,
  TASK_TYPE_LABELS,
  TEMP_LABELS,
} from './strings';

// Field definitions per list screen. The engine in ./filters.ts owns HOW a
// filter runs; this module owns WHAT each screen offers. Option lists that
// depend on workspace data (sellers, referrers, product categories) are passed
// in rather than fetched here, so a screen filters on exactly the values its
// own query already loaded.

// The empty string is the engine's "no value" sentinel. On the server that
// can't go through `in` -- a NULL column matches no list -- so a selection that
// includes it becomes an explicit NULL check OR'd with the rest.
const NONE = '';

const enumWithNoneServerFilter =
  (path: string) =>
  (value: FilterValue): Record<string, unknown> | undefined => {
    if (value.kind !== 'multiEnum') return undefined;
    const present = value.values.filter((entry) => entry !== NONE);
    const wantsNone = value.values.includes(NONE);

    if (!wantsNone) return { [path]: { in: present } };
    if (present.length === 0) return { [path]: { is: 'NULL' } };
    return {
      or: [{ [path]: { in: present } }, { [path]: { is: 'NULL' } }],
    };
  };

const presenceServerFilter =
  (path: string) =>
  (value: FilterValue): Record<string, unknown> | undefined =>
    value.kind === 'boolean'
      ? { [path]: { is: value.value ? 'NOT_NULL' : 'NULL' } }
      : undefined;

export const memberOptions = (members: Member[]): FilterOption[] =>
  members.map((member) => ({
    value: member.id,
    label: `${member.name.firstName} ${member.name.lastName}`.trim(),
  }));

// Distinct non-empty values off the rows already on screen, alphabetised.
// Twenty stores a cleared TEXT field as '' rather than NULL, so both forms
// collapse into the single NONE bucket.
export const distinctOptions = <TRow>(
  rows: TRow[],
  read: (row: TRow) => string | null | undefined,
  noneLabel: string,
): FilterOption[] => {
  const seen = new Set<string>();
  let hasNone = false;
  for (const row of rows) {
    const raw = (read(row) ?? '').trim();
    if (raw === '') hasNone = true;
    else seen.add(raw);
  }
  const options = [...seen]
    .sort((a, b) => a.localeCompare(b, 'fa'))
    .map((value) => ({ value, label: value }));
  return hasNone ? [...options, { value: NONE, label: noneLabel }] : options;
};

// ---------- leads (server-side) ----------

export const leadFilterFields = (
  members: Member[],
  referrers: Referrer[],
): FilterField<LeadSummary>[] => [
  {
    key: 'stage',
    label: T7.fStage,
    kind: 'multiEnum',
    serverPath: 'stage',
    get: (lead) => lead.stage,
    options: STAGES.map((stage) => ({
      value: stage.value,
      label: STAGE_LABELS[stage.value] ?? stage.label,
    })),
    buildServerFilter: enumWithNoneServerFilter('stage'),
  },
  {
    key: 'temp',
    label: T7.fTemperature,
    kind: 'multiEnum',
    serverPath: 'temperature',
    get: (lead) => lead.temperature,
    options: [
      ...Object.entries(TEMP_LABELS).map(([value, label]) => ({ value, label })),
      { value: NONE, label: T7.fNoValue },
    ],
    buildServerFilter: enumWithNoneServerFilter('temperature'),
  },
  {
    key: 'source',
    label: T7.fSource,
    kind: 'multiEnum',
    serverPath: 'leadSource',
    get: (lead) => lead.leadSource,
    options: [
      ...LEAD_SOURCES.map((source) => ({
        value: source.value,
        label: SOURCE_LABELS[source.value] ?? source.label,
      })),
      { value: NONE, label: T7.fNoSource },
    ],
    buildServerFilter: enumWithNoneServerFilter('leadSource'),
  },
  {
    key: 'owner',
    label: T7.fOwner,
    kind: 'multiEnum',
    serverPath: 'ownerId',
    get: (lead) => lead.owner?.id,
    options: [...memberOptions(members), { value: NONE, label: T7.fNoOwner }],
    buildServerFilter: enumWithNoneServerFilter('ownerId'),
  },
  {
    key: 'referrer',
    label: T7.fReferrer,
    kind: 'multiEnum',
    serverPath: 'referrerId',
    get: (lead) => lead.referrer?.id,
    options: referrers.map((referrer) => ({
      value: referrer.id,
      label: referrer.name,
    })),
    buildServerFilter: enumWithNoneServerFilter('referrerId'),
  },
  {
    key: 'value',
    label: T7.fValue,
    kind: 'numberRange',
    serverPath: 'amount.amountMicros',
    // Sellers type whole afghanis; the column holds micros.
    scale: 1_000_000,
    get: (lead) => lead.amount?.amountMicros,
  },
  {
    key: 'created',
    label: T7.fCreated,
    kind: 'dateRange',
    serverPath: 'createdAt',
    get: (lead) => lead.createdAt,
  },
  {
    key: 'hasContact',
    label: T7.fHasContact,
    kind: 'boolean',
    get: (lead) => lead.pointOfContact !== null,
    buildServerFilter: presenceServerFilter('pointOfContactId'),
  },
];

// ---------- contacts (server-side) ----------

export type ContactRow = {
  id: string;
  name: { firstName: string; lastName: string };
  jobTitle: string | null;
  createdAt: string;
  company: { id: string; name: string } | null;
  phones: {
    primaryPhoneCallingCode: string | null;
    primaryPhoneNumber: string | null;
  } | null;
  emails: { primaryEmail: string | null } | null;
};

export const contactFilterFields = (
  companies: { id: string; name: string }[],
): FilterField<ContactRow>[] => [
  {
    key: 'company',
    label: T7.fCompany,
    kind: 'multiEnum',
    serverPath: 'companyId',
    get: (person) => person.company?.id,
    options: [
      ...companies.map((company) => ({
        value: company.id,
        label: company.name,
      })),
      { value: NONE, label: T7.noCompany },
    ],
    buildServerFilter: enumWithNoneServerFilter('companyId'),
  },
  {
    key: 'job',
    label: T7.fJobTitle,
    kind: 'text',
    serverPath: 'jobTitle',
    get: (person) => person.jobTitle,
  },
  {
    key: 'hasPhone',
    label: T7.fHasPhone,
    kind: 'boolean',
    get: (person) => (person.phones?.primaryPhoneNumber ?? '') !== '',
    // A cleared phone is stored as '' rather than NULL, so presence is a
    // not-equals-empty test, not a NULL check.
    buildServerFilter: (value) =>
      value.kind === 'boolean'
        ? {
            phones: {
              primaryPhoneNumber: value.value ? { neq: '' } : { eq: '' },
            },
          }
        : undefined,
  },
  {
    key: 'hasEmail',
    label: T7.fHasEmail,
    kind: 'boolean',
    get: (person) => (person.emails?.primaryEmail ?? '') !== '',
    buildServerFilter: (value) =>
      value.kind === 'boolean'
        ? { emails: { primaryEmail: value.value ? { neq: '' } : { eq: '' } } }
        : undefined,
  },
  {
    key: 'created',
    label: T7.fCreated,
    kind: 'dateRange',
    serverPath: 'createdAt',
    get: (person) => person.createdAt,
  },
];

// ---------- tasks (client-side) ----------

// The tasks screen holds two row shapes: full Task rows for the open list and
// the thinner DoneTask rows for the completed one. The filters are declared
// over what both have in common, so one set of fields serves both lists and a
// field that reads something DoneTask lacks simply never matches there.
export type TaskFilterRow = {
  taskType?: string | null;
  status?: string | null;
  dueAt?: string | null;
  assignee?: { id: string } | null;
  taskTargets?: {
    edges: { node: { opportunity: { id: string } | null } }[];
  };
};

const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const;

const STATUS_LABELS: Record<string, string> = {
  TODO: 'انجام نشده',
  IN_PROGRESS: 'در جریان',
  DONE: 'انجام شده',
};

export const taskFilterFields = (
  members: Member[],
): FilterField<TaskFilterRow>[] => [
  {
    key: 'type',
    label: T7.fTaskType,
    kind: 'multiEnum',
    get: (task) => task.taskType,
    options: [
      ...Object.entries(TASK_TYPE_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
      { value: NONE, label: T7.fNoValue },
    ],
  },
  {
    key: 'status',
    label: T7.fStatus,
    kind: 'multiEnum',
    get: (task) => task.status,
    options: TASK_STATUSES.map((value) => ({
      value,
      label: STATUS_LABELS[value],
    })),
  },
  {
    key: 'assignee',
    label: T7.fAssignee,
    kind: 'multiEnum',
    get: (task) => task.assignee?.id,
    options: [...memberOptions(members), { value: NONE, label: T7.fNoAssignee }],
  },
  {
    key: 'due',
    label: T7.fDue,
    kind: 'dateRange',
    get: (task) => task.dueAt,
  },
  {
    key: 'hasLead',
    label: T7.fHasLead,
    kind: 'boolean',
    get: (task) =>
      (task.taskTargets?.edges ?? []).some((edge) => edge.node.opportunity),
  },
];

// ---------- catalog (client-side) ----------

export const catalogFilterFields = (
  products: CatalogProduct[],
): FilterField<CatalogProduct>[] => [
  {
    key: 'category',
    label: T7.fCategory,
    kind: 'multiEnum',
    get: (product) => (product.category ?? '').trim(),
    options: distinctOptions(
      products,
      (product) => product.category,
      T7.fNoCategory,
    ),
  },
  {
    key: 'brand',
    label: T7.fBrand,
    kind: 'multiEnum',
    get: (product) => (product.brand ?? '').trim(),
    options: distinctOptions(products, (product) => product.brand, T7.fNoBrand),
  },
  {
    key: 'currency',
    label: T7.fCurrency,
    kind: 'multiEnum',
    get: (product) => product.baseInstallPrice?.currencyCode,
    options: distinctOptions(
      products,
      (product) => product.baseInstallPrice?.currencyCode,
      T7.fNoValue,
    ),
  },
  {
    key: 'sellable',
    label: 'قابل فروش',
    kind: 'boolean',
    get: (product) => product.isSellable !== false,
  },
  {
    key: 'hasPricing',
    label: T7.fHasPricing,
    kind: 'boolean',
    get: (product) =>
      (product.baseInstallPrice?.amountMicros ?? 0) > 0 ||
      (product.baseAnnualPrice?.amountMicros ?? 0) > 0,
  },
];

// ---------- competitors (client-side) ----------

export type CompetitorRow = {
  id: string;
  name: string;
  status: string | null;
  threatLevel: string | null;
  tier: string | null;
  createdAt: string;
};

// These three are SELECTs with fixed choices, so the options come from the
// label maps rather than from whatever the loaded rows happen to contain -- a
// seller can filter for a value none of the visible rows uses yet.
const labelMapOptions = (
  labels: Record<string, string>,
  noneLabel: string,
): FilterOption[] => [
  ...Object.entries(labels).map(([value, label]) => ({ value, label })),
  { value: NONE, label: noneLabel },
];

export const competitorFilterFields = (): FilterField<CompetitorRow>[] => [
  {
    key: 'threat',
    label: T7.fStrength,
    kind: 'multiEnum',
    get: (competitor) => (competitor.threatLevel ?? '').trim(),
    options: labelMapOptions(COMPETITOR_THREAT_LABELS, T7.fNoValue),
  },
  {
    key: 'tier',
    label: T7.fCompetitorType,
    kind: 'multiEnum',
    get: (competitor) => (competitor.tier ?? '').trim(),
    options: labelMapOptions(COMPETITOR_TIER_LABELS, T7.fNoValue),
  },
  {
    key: 'status',
    label: T7.fStatus,
    kind: 'multiEnum',
    get: (competitor) => (competitor.status ?? '').trim(),
    options: labelMapOptions(COMPETITOR_STATUS_LABELS, T7.fNoValue),
  },
  {
    key: 'created',
    label: T7.fCreated,
    kind: 'dateRange',
    get: (competitor) => competitor.createdAt,
  },
];
