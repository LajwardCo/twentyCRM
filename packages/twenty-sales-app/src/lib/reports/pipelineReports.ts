import { personName } from '../format';
import {
  averageNumber,
  countKpi,
  countWhere,
  dateCell,
  daysCell,
  daysKpi,
  moneyKpi,
  sumMoney,
  textCell,
  topLabel,
} from './engine';
import {
  createdInPeriod,
  daysBetween,
  healthCell,
  HEALTH_STALE_DAYS,
  isOpen,
  leadIdentityCells,
  leadsInScope,
  stageSince,
  taskLeadId,
} from './shared';
import { RT } from './strings';
import { type ReportDefinition } from './types';

// Pipeline reports: what is open right now, how long it has been sitting, and
// what came in. Every one of them is a list a seller can act on, which is what
// separates them from the dashboard's aggregate tiles.

const openPipelineReport: ReportDefinition = {
  id: 'pipeline-detail',
  title: RT.rPipelineTitle,
  description: RT.rPipelineDesc,
  category: 'pipeline',
  needs: ['leads'],
  scoped: true,
  defaultSort: { key: 'value', dir: 'desc' },
  groupBy: ['stage', 'owner', 'source', 'temperature'],
  chart: { groupBy: 'stage', value: 'value' },
  columns: [
    { key: 'lead', label: RT.colLead, kind: 'text', filter: 'text' },
    { key: 'company', label: RT.colCompany, kind: 'text', filter: 'text' },
    { key: 'stage', label: RT.colStage, kind: 'text', filter: 'enum' },
    { key: 'owner', label: RT.colOwner, kind: 'text', filter: 'enum' },
    { key: 'source', label: RT.colSource, kind: 'text', filter: 'enum' },
    { key: 'temperature', label: RT.colTemperature, kind: 'text', filter: 'enum' },
    { key: 'value', label: RT.colValue, kind: 'money', filter: 'range' },
    { key: 'age', label: RT.colAge, kind: 'days', filter: 'range' },
    { key: 'created', label: RT.colCreated, kind: 'date', filter: 'dateRange' },
  ],
  build: (data, ctx) =>
    leadsInScope(data.leads, ctx)
      .filter(isOpen)
      .map((lead) => ({
        id: lead.id,
        href: `/lead/${lead.id}`,
        cells: {
          ...leadIdentityCells(lead),
          age: daysCell(daysBetween(lead.createdAt, ctx.now)),
        },
      })),
  kpis: (rows) => [
    countKpi(RT.kOpenLeads, rows.length),
    moneyKpi(RT.kPipelineValue, sumMoney(rows, 'value')),
    daysKpi(RT.kAvgAge, averageNumber(rows, 'age')),
    countKpi(
      RT.kHotLeads,
      countWhere(rows, (row) =>
        String(row.cells.temperature?.value ?? '').includes('داغ'),
      ),
    ),
  ],
};

const stageAgingReport: ReportDefinition = {
  id: 'stage-aging',
  title: RT.rAgingTitle,
  description: RT.rAgingDesc,
  category: 'pipeline',
  needs: ['leads'],
  scoped: true,
  defaultSort: { key: 'daysInStage', dir: 'desc' },
  groupBy: ['stage', 'owner', 'health'],
  chart: { groupBy: 'health' },
  columns: [
    { key: 'lead', label: RT.colLead, kind: 'text', filter: 'text' },
    { key: 'stage', label: RT.colStage, kind: 'text', filter: 'enum' },
    { key: 'owner', label: RT.colOwner, kind: 'text', filter: 'enum' },
    { key: 'daysInStage', label: RT.colDaysInStage, kind: 'days', filter: 'range' },
    { key: 'health', label: RT.colHealth, kind: 'text', filter: 'enum' },
    { key: 'value', label: RT.colValue, kind: 'money', filter: 'range' },
    { key: 'stageSince', label: RT.colStageSince, kind: 'date', filter: 'dateRange' },
    { key: 'age', label: RT.colAge, kind: 'days', filter: 'range' },
  ],
  build: (data, ctx) =>
    leadsInScope(data.leads, ctx)
      .filter(isOpen)
      .map((lead) => {
        const since = stageSince(lead);
        const inStage = daysBetween(since, ctx.now);
        return {
          id: lead.id,
          href: `/lead/${lead.id}`,
          cells: {
            ...leadIdentityCells(lead),
            daysInStage: daysCell(inStage),
            health: healthCell(inStage),
            stageSince: dateCell(since),
            age: daysCell(daysBetween(lead.createdAt, ctx.now)),
          },
        };
      }),
  kpis: (rows) => {
    const stale = rows.filter(
      (row) => Number(row.cells.daysInStage?.value ?? 0) >= HEALTH_STALE_DAYS,
    );
    const oldest = Math.max(
      0,
      ...rows.map((row) => Number(row.cells.daysInStage?.value ?? 0)),
    );
    return [
      countKpi(RT.kOpenLeads, rows.length),
      countKpi(RT.kStale, stale.length, { tone: stale.length > 0 ? 'bad' : 'good' }),
      daysKpi(RT.kAvgDaysInStage, averageNumber(rows, 'daysInStage')),
      daysKpi(RT.kOldest, rows.length > 0 ? oldest : null),
      moneyKpi(RT.kPipelineValue, sumMoney(rows, 'value')),
    ];
  },
};

const silentLeadsReport: ReportDefinition = {
  id: 'silent-leads',
  title: RT.rSilentTitle,
  description: RT.rSilentDesc,
  category: 'pipeline',
  needs: ['leads', 'doneTasks', 'openTasks'],
  scoped: true,
  defaultSort: { key: 'daysSilent', dir: 'desc' },
  groupBy: ['owner', 'stage'],
  chart: { groupBy: 'owner' },
  columns: [
    { key: 'lead', label: RT.colLead, kind: 'text', filter: 'text' },
    { key: 'company', label: RT.colCompany, kind: 'text', filter: 'text' },
    { key: 'stage', label: RT.colStage, kind: 'text', filter: 'enum' },
    { key: 'owner', label: RT.colOwner, kind: 'text', filter: 'enum' },
    { key: 'daysSilent', label: RT.colDaysSilent, kind: 'days', filter: 'range' },
    { key: 'lastActivity', label: RT.colLastActivity, kind: 'date', filter: 'dateRange' },
    { key: 'value', label: RT.colValue, kind: 'money', filter: 'range' },
    { key: 'temperature', label: RT.colTemperature, kind: 'text', filter: 'enum' },
  ],
  build: (data, ctx) => {
    // Last time anything happened on a lead. Done tasks carry the moment they
    // were ticked; open tasks only prove someone planned something, so their
    // creation date counts too -- a lead with a task booked for next week is
    // not abandoned.
    const lastTouch = new Map<string, string>();
    const remember = (leadId: string | null, iso: string | null) => {
      if (!leadId || !iso) return;
      const current = lastTouch.get(leadId);
      if (!current || iso > current) lastTouch.set(leadId, iso);
    };
    for (const task of data.doneTasks) remember(taskLeadId(task), task.updatedAt);
    for (const task of data.openTasks) remember(taskLeadId(task), task.createdAt);

    return leadsInScope(data.leads, ctx)
      .filter(isOpen)
      .map((lead) => {
        const touched = lastTouch.get(lead.id) ?? null;
        // Never touched is not the same as touched long ago: fall back to
        // registration, which is the only date we can honestly claim.
        const last = touched ?? lead.createdAt;
        return {
          id: lead.id,
          href: `/lead/${lead.id}`,
          cells: {
            ...leadIdentityCells(lead),
            daysSilent: daysCell(daysBetween(last, ctx.now)),
            lastActivity: dateCell(last, touched ? {} : { tone: 'warn' }),
          },
        };
      });
  },
  kpis: (rows) => [
    countKpi(RT.kOpenLeads, rows.length),
    countKpi(
      RT.kSilent14,
      countWhere(rows, (row) => Number(row.cells.daysSilent?.value ?? 0) >= 14),
      { tone: 'warn' },
    ),
    countKpi(
      RT.kSilent30,
      countWhere(rows, (row) => Number(row.cells.daysSilent?.value ?? 0) >= 30),
      { tone: 'bad' },
    ),
    moneyKpi(
      RT.kPipelineValue,
      sumMoney(
        rows.filter((row) => Number(row.cells.daysSilent?.value ?? 0) >= 14),
        'value',
      ),
    ),
  ],
};

const leadRegisterReport: ReportDefinition = {
  id: 'lead-register',
  title: RT.rRegisterTitle,
  description: RT.rRegisterDesc,
  category: 'pipeline',
  needs: ['leads', 'marketers'],
  scoped: true,
  defaultSort: { key: 'created', dir: 'desc' },
  groupBy: ['source', 'owner', 'marketer', 'registeredBy'],
  chart: { groupBy: 'source', value: 'value' },
  columns: [
    { key: 'created', label: RT.colCreated, kind: 'date', filter: 'dateRange' },
    { key: 'lead', label: RT.colLead, kind: 'text', filter: 'text' },
    { key: 'company', label: RT.colCompany, kind: 'text', filter: 'text' },
    { key: 'contact', label: RT.colContact, kind: 'text', filter: 'text' },
    { key: 'owner', label: RT.colOwner, kind: 'text', filter: 'enum' },
    { key: 'source', label: RT.colSource, kind: 'text', filter: 'enum' },
    { key: 'temperature', label: RT.colTemperature, kind: 'text', filter: 'enum' },
    { key: 'stage', label: RT.colStage, kind: 'text', filter: 'enum' },
    { key: 'value', label: RT.colValue, kind: 'money', filter: 'range' },
    { key: 'referrer', label: RT.colReferrer, kind: 'text', filter: 'enum' },
    { key: 'marketer', label: RT.colMarketer, kind: 'text', filter: 'enum' },
    { key: 'registeredBy', label: RT.colRegisteredBy, kind: 'text', filter: 'enum' },
  ],
  build: (data, ctx) =>
    createdInPeriod(leadsInScope(data.leads, ctx), ctx).map((lead) => ({
      id: lead.id,
      href: `/lead/${lead.id}`,
      cells: {
        ...leadIdentityCells(lead),
        contact: textCell(
          lead.pointOfContact ? personName(lead.pointOfContact) : null,
        ),
        referrer: textCell(lead.referrer?.name ?? null),
        marketer: textCell(data.marketers[lead.id] ?? null),
        registeredBy: textCell(lead.createdBy?.name ?? null),
      },
    })),
  kpis: (rows) => [
    countKpi(RT.kRegistered, rows.length),
    moneyKpi(RT.kTotalValue, sumMoney(rows, 'value')),
    countKpi(
      RT.kWithContact,
      countWhere(rows, (row) => row.cells.contact?.value !== null),
    ),
    {
      label: RT.kBestSource,
      value: topLabel(rows, 'source'),
    },
  ],
};

export const PIPELINE_REPORTS: ReportDefinition[] = [
  openPipelineReport,
  stageAgingReport,
  silentLeadsReport,
  leadRegisterReport,
];
