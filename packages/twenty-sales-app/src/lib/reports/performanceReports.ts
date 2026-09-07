import { type LeadSummary } from '../../api/records';
import { addCurrencyTotals, type CurrencyTotals } from '../format';
import {
  averageNumber,
  countKpi,
  dateCell,
  daysCell,
  daysKpi,
  moneyCell,
  moneyKpi,
  numberCell,
  percentCell,
  percentKpi,
  sumMoney,
  sumNumber,
  textCell,
  topLabel,
} from './engine';
import {
  assigneeName,
  closedAt,
  createdInPeriod,
  daysBetween,
  isLost,
  isOpen,
  isWon,
  leadIdentityCells,
  leadsInScope,
  ownerName,
  sourceText,
  withinPeriod,
} from './shared';
import { RT } from './strings';
import { type ReportCell, type ReportDefinition } from './types';

// Performance reports rank people and channels. They are aggregate by nature,
// so each row is a group rather than a record -- which is why none of them
// offers a further group-by.

type Bucket = {
  label: string;
  leads: LeadSummary[];
};

const bucketBy = (
  leads: LeadSummary[],
  key: (lead: LeadSummary) => string | null,
): Bucket[] => {
  const groups = new Map<string, LeadSummary[]>();
  for (const lead of leads) {
    const label = key(lead);
    if (label === null || label === '') continue;
    groups.set(label, [...(groups.get(label) ?? []), lead]);
  }
  return [...groups.entries()].map(([label, list]) => ({ label, leads: list }));
};

const totalsOf = (leads: LeadSummary[]): CurrencyTotals => {
  const totals: CurrencyTotals = {};
  for (const lead of leads) {
    addCurrencyTotals(
      totals,
      lead.amount?.amountMicros,
      lead.amount?.currencyCode,
    );
  }
  return totals;
};

const winRate = (won: number, lost: number): number | null =>
  won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null;

// Shared row shape for the three leaderboards: same columns, same meaning, so
// a seller reading one already knows how to read the others.
const leaderboardCells = (bucket: Bucket): Record<string, ReportCell> => {
  const won = bucket.leads.filter(isWon);
  const lost = bucket.leads.filter(isLost);
  const open = bucket.leads.filter(isOpen);
  const cycles = won
    .map((lead) => daysBetween(lead.createdAt, new Date(closedAt(lead))))
    .filter((days): days is number => days !== null);

  return {
    leads: numberCell(bucket.leads.length),
    won: numberCell(won.length),
    lost: numberCell(lost.length),
    open: numberCell(open.length),
    winRate: percentCell(winRate(won.length, lost.length)),
    pipeline: moneyCell(totalsOf(open)),
    wonValue: moneyCell(totalsOf(won)),
    avgCycle: daysCell(
      cycles.length > 0
        ? cycles.reduce((sum, days) => sum + days, 0) / cycles.length
        : null,
    ),
    lastLead: dateCell(
      bucket.leads
        .map((lead) => lead.createdAt)
        .sort()
        .slice(-1)[0] ?? null,
    ),
  };
};

const LEADERBOARD_COLUMNS = [
  { key: 'leads', label: RT.colLeads, kind: 'number' as const, filter: 'range' as const },
  { key: 'won', label: RT.colWon, kind: 'number' as const, filter: 'range' as const },
  { key: 'lost', label: RT.colLost, kind: 'number' as const },
  { key: 'open', label: RT.colOpen, kind: 'number' as const },
  { key: 'winRate', label: RT.colWinRate, kind: 'percent' as const, filter: 'range' as const },
  { key: 'pipeline', label: RT.colPipeline, kind: 'money' as const },
  { key: 'wonValue', label: RT.colWonValue, kind: 'money' as const },
  { key: 'avgCycle', label: RT.colDaysToClose, kind: 'days' as const },
];

const sellerScorecardReport: ReportDefinition = {
  id: 'seller-scorecard',
  title: RT.rSellerTitle,
  description: RT.rSellerDesc,
  category: 'performance',
  needs: ['leads', 'doneTasks'],
  defaultSort: { key: 'leads', dir: 'desc' },
  chart: { groupBy: 'seller', count: 'leads', value: 'wonValue' },
  columns: [
    { key: 'seller', label: RT.colSeller, kind: 'text', filter: 'enum' },
    ...LEADERBOARD_COLUMNS,
    { key: 'tasksDone', label: RT.colTasksDone, kind: 'number', filter: 'range' },
    { key: 'tasksPerLead', label: RT.colTasksPerLead, kind: 'number' },
  ],
  build: (data, ctx) => {
    const tasksBySeller = new Map<string, number>();
    for (const task of data.doneTasks) {
      const name = assigneeName(task);
      if (!name) continue;
      tasksBySeller.set(name, (tasksBySeller.get(name) ?? 0) + 1);
    }

    return bucketBy(createdInPeriod(data.leads, ctx), ownerName).map((bucket) => {
      const tasksDone = tasksBySeller.get(bucket.label) ?? 0;
      return {
        id: bucket.label,
        cells: {
          ...leaderboardCells(bucket),
          seller: textCell(bucket.label),
          tasksDone: numberCell(tasksDone),
          tasksPerLead: numberCell(
            bucket.leads.length > 0
              ? Math.round((tasksDone / bucket.leads.length) * 10) / 10
              : null,
          ),
        },
      };
    });
  },
  kpis: (rows) => [
    countKpi(RT.kSellers, rows.length),
    countKpi(RT.kTeamWon, sumNumber(rows, 'won')),
    percentKpi(RT.kTeamWinRate, averageNumber(rows, 'winRate')),
    moneyKpi(RT.kWonValue, sumMoney(rows, 'wonValue')),
    countKpi(RT.kTeamTasks, sumNumber(rows, 'tasksDone')),
  ],
};

const marketerReport: ReportDefinition = {
  id: 'marketer-attribution',
  title: RT.rMarketerTitle,
  description: RT.rMarketerDesc,
  category: 'performance',
  needs: ['leads', 'marketers'],
  defaultSort: { key: 'leads', dir: 'desc' },
  chart: { groupBy: 'marketer', count: 'leads', value: 'wonValue' },
  columns: [
    { key: 'marketer', label: RT.colMarketer, kind: 'text', filter: 'enum' },
    ...LEADERBOARD_COLUMNS,
    { key: 'lastLead', label: RT.colCreated, kind: 'date' },
  ],
  build: (data, ctx) =>
    bucketBy(
      createdInPeriod(data.leads, ctx),
      (lead) => data.marketers[lead.id] ?? null,
    ).map((bucket) => ({
      id: bucket.label,
      cells: {
        ...leaderboardCells(bucket),
        marketer: textCell(bucket.label),
      },
    })),
  kpis: (rows) => [
    countKpi(RT.kMarketers, rows.length),
    countKpi(RT.kRegistered, sumNumber(rows, 'leads')),
    countKpi(RT.kTeamWon, sumNumber(rows, 'won')),
    percentKpi(RT.kTeamWinRate, averageNumber(rows, 'winRate')),
    moneyKpi(RT.kWonValue, sumMoney(rows, 'wonValue')),
  ],
};

const sourceReport: ReportDefinition = {
  id: 'source-effectiveness',
  title: RT.rSourceTitle,
  description: RT.rSourceDesc,
  category: 'performance',
  needs: ['leads'],
  scoped: true,
  defaultSort: { key: 'leads', dir: 'desc' },
  chart: { groupBy: 'source', count: 'leads', value: 'wonValue' },
  columns: [
    { key: 'source', label: RT.colSource, kind: 'text', filter: 'enum' },
    ...LEADERBOARD_COLUMNS,
  ],
  build: (data, ctx) =>
    bucketBy(createdInPeriod(leadsInScope(data.leads, ctx), ctx), sourceText).map(
      (bucket) => ({
        id: bucket.label,
        cells: {
          ...leaderboardCells(bucket),
          source: textCell(bucket.label),
        },
      }),
    ),
  kpis: (rows) => [
    countKpi(RT.kSources, rows.length),
    countKpi(RT.kRegistered, sumNumber(rows, 'leads')),
    percentKpi(RT.kTeamWinRate, averageNumber(rows, 'winRate')),
    moneyKpi(RT.kWonValue, sumMoney(rows, 'wonValue')),
    { label: RT.kBestSource, value: topLabel(rows, 'source') },
  ],
};

const winLossReport: ReportDefinition = {
  id: 'win-loss',
  title: RT.rWinLossTitle,
  description: RT.rWinLossDesc,
  category: 'performance',
  needs: ['leads'],
  scoped: true,
  defaultSort: { key: 'closedAt', dir: 'desc' },
  groupBy: ['outcome', 'owner', 'source', 'temperature'],
  chart: { groupBy: 'outcome', value: 'value' },
  columns: [
    { key: 'lead', label: RT.colLead, kind: 'text', filter: 'text' },
    { key: 'outcome', label: RT.colOutcome, kind: 'text', filter: 'enum' },
    { key: 'owner', label: RT.colOwner, kind: 'text', filter: 'enum' },
    { key: 'source', label: RT.colSource, kind: 'text', filter: 'enum' },
    { key: 'temperature', label: RT.colTemperature, kind: 'text', filter: 'enum' },
    { key: 'value', label: RT.colValue, kind: 'money', filter: 'range' },
    { key: 'created', label: RT.colCreated, kind: 'date', filter: 'dateRange' },
    { key: 'closedAt', label: RT.colClosedAt, kind: 'date', filter: 'dateRange' },
    { key: 'daysToClose', label: RT.colDaysToClose, kind: 'days', filter: 'range' },
  ],
  // "Closed in the period" is the honest question here, so the period bounds
  // the closing date rather than registration.
  build: (data, ctx) =>
    leadsInScope(data.leads, ctx)
      .filter((lead) => isWon(lead) || isLost(lead))
      .filter((lead) => withinPeriod(closedAt(lead), ctx))
      .map((lead) => {
        const closed = closedAt(lead);
        return {
          id: lead.id,
          href: `/lead/${lead.id}`,
          cells: {
            ...leadIdentityCells(lead),
            outcome: isWon(lead)
              ? textCell(RT.won, { tone: 'good' })
              : textCell(RT.lost, { tone: 'bad' }),
            closedAt: dateCell(closed),
            daysToClose: daysCell(daysBetween(lead.createdAt, new Date(closed))),
          },
        };
      }),
  kpis: (rows) => {
    const won = rows.filter((row) => row.cells.outcome?.value === RT.won);
    const lost = rows.filter((row) => row.cells.outcome?.value === RT.lost);
    return [
      countKpi(RT.kClosed, rows.length),
      percentKpi(RT.kWinRate, winRate(won.length, lost.length), {
        tone: 'good',
      }),
      moneyKpi(RT.kWonValue, sumMoney(won, 'value'), { tone: 'good' }),
      moneyKpi(RT.kLostValue, sumMoney(lost, 'value'), { tone: 'bad' }),
      daysKpi(RT.kAvgCycle, averageNumber(won, 'daysToClose')),
    ];
  },
};

const CYCLE_BUCKETS: { limit: number; label: string }[] = [
  { limit: 7, label: RT.cycleFast },
  { limit: 30, label: RT.cycleNormal },
  { limit: 90, label: RT.cycleSlow },
  { limit: Number.POSITIVE_INFINITY, label: RT.cycleVerySlow },
];

const cycleBucket = (days: number | null): string | null =>
  days === null
    ? null
    : (CYCLE_BUCKETS.find((bucket) => days < bucket.limit)?.label ?? null);

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const salesCycleReport: ReportDefinition = {
  id: 'sales-cycle',
  title: RT.rCycleTitle,
  description: RT.rCycleDesc,
  category: 'performance',
  needs: ['leads'],
  scoped: true,
  defaultSort: { key: 'daysToClose', dir: 'desc' },
  groupBy: ['bucket', 'owner', 'source'],
  chart: { groupBy: 'bucket', value: 'value' },
  columns: [
    { key: 'lead', label: RT.colLead, kind: 'text', filter: 'text' },
    { key: 'owner', label: RT.colOwner, kind: 'text', filter: 'enum' },
    { key: 'source', label: RT.colSource, kind: 'text', filter: 'enum' },
    { key: 'value', label: RT.colValue, kind: 'money', filter: 'range' },
    { key: 'created', label: RT.colCreated, kind: 'date', filter: 'dateRange' },
    { key: 'closedAt', label: RT.colClosedAt, kind: 'date', filter: 'dateRange' },
    { key: 'daysToClose', label: RT.colDaysToClose, kind: 'days', filter: 'range' },
    { key: 'bucket', label: RT.colCycleBucket, kind: 'text', filter: 'enum' },
  ],
  build: (data, ctx) =>
    leadsInScope(data.leads, ctx)
      .filter(isWon)
      .filter((lead) => withinPeriod(closedAt(lead), ctx))
      .map((lead) => {
        const closed = closedAt(lead);
        const days = daysBetween(lead.createdAt, new Date(closed));
        return {
          id: lead.id,
          href: `/lead/${lead.id}`,
          cells: {
            ...leadIdentityCells(lead),
            closedAt: dateCell(closed),
            daysToClose: daysCell(days),
            bucket: textCell(cycleBucket(days)),
          },
        };
      }),
  kpis: (rows) => {
    const cycles = rows
      .map((row) => row.cells.daysToClose?.value)
      .filter((value): value is number => typeof value === 'number');
    return [
      countKpi(RT.kClosed, rows.length),
      daysKpi(RT.kAvgCycle, averageNumber(rows, 'daysToClose')),
      daysKpi(RT.kMedianCycle, median(cycles)),
      daysKpi(RT.kFastest, cycles.length > 0 ? Math.min(...cycles) : null),
      daysKpi(RT.kSlowest, cycles.length > 0 ? Math.max(...cycles) : null),
    ];
  },
};

export const PERFORMANCE_REPORTS: ReportDefinition[] = [
  sellerScorecardReport,
  marketerReport,
  sourceReport,
  winLossReport,
  salesCycleReport,
];
