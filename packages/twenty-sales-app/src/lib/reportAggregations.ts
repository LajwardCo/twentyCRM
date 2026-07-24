// Pure aggregation helpers for the Reports sections. Kept free of React so
// each can be unit-tested in isolation; the section components are thin
// wrappers that call these and render the result.

import {
  type DealProductStat,
  type DoneTask,
  type LeadSummary,
  STAGES,
} from '../api/records';
import { sumAmountMicros } from './format';

export type BreakdownRow = { label: string; count: number; value: number };

const sumMicros = (leads: LeadSummary[]): number => sumAmountMicros(leads);

// ---------- conversion funnel + win/loss (Overview) ----------

const WON_STAGE = 'ACTIVE_CUSTOMER';
const LOST_STAGE = 'LOST_MISSED';

// Leads counted at each pipeline stage, in canonical pipeline order (not
// sorted by size) so stage-to-stage drop-off reads top to bottom.
export const computeFunnel = (
  leads: LeadSummary[],
  labels: Record<string, string>,
): BreakdownRow[] =>
  STAGES.map((stage) => {
    const atStage = leads.filter((l) => l.stage === stage.value);
    return {
      label: labels[stage.value] ?? stage.label,
      count: atStage.length,
      value: sumMicros(atStage),
    };
  });

export type WinLoss = { won: number; lost: number; winRate: number };

// Win rate = won / (won + lost). Open pipeline is excluded from the
// denominator so the rate reflects closed outcomes only.
export const computeWinLoss = (leads: LeadSummary[]): WinLoss => {
  const won = leads.filter((l) => l.stage === WON_STAGE).length;
  const lost = leads.filter((l) => l.stage === LOST_STAGE).length;
  const closed = won + lost;
  return { won, lost, winRate: closed > 0 ? Math.round((won / closed) * 100) : 0 };
};

export type SourceConversionRow = {
  label: string;
  registered: number;
  won: number;
  rate: number;
};

// Per lead source: how many registered vs. how many became active customers.
export const computeSourceConversion = (
  leads: LeadSummary[],
  labels: Record<string, string>,
): SourceConversionRow[] => {
  const bySource = new Map<string, LeadSummary[]>();
  for (const lead of leads) {
    const key = lead.leadSource ?? '—';
    bySource.set(key, [...(bySource.get(key) ?? []), lead]);
  }
  return [...bySource.entries()]
    .map(([key, list]) => {
      const won = list.filter((l) => l.stage === WON_STAGE).length;
      return {
        label: labels[key] ?? key,
        registered: list.length,
        won,
        rate: list.length > 0 ? Math.round((won / list.length) * 100) : 0,
      };
    })
    .sort((a, b) => b.registered - a.registered);
};

// ---------- marketer leaderboard ----------

export type MarketerRow = {
  key: string;
  label: string;
  leads: number;
  won: number;
  winRate: number;
  pipelineValue: number;
};

const OPEN_FOR_PIPELINE = (l: LeadSummary): boolean =>
  l.stage !== WON_STAGE && l.stage !== LOST_STAGE;

// Group the period leads by their marketer field (via a leadId->marketer map),
// computing leads brought, won, conversion %, and open pipeline value per
// marketer. Leads with no marketer are omitted (unlike stage/source breakdowns
// there's no meaningful "—" marketer bucket to rank).
export const computeMarketerLeaderboard = (
  leads: LeadSummary[],
  marketerMap: Record<string, string | null | undefined>,
  labels: Record<string, string>,
): MarketerRow[] => {
  const byMarketer = new Map<string, LeadSummary[]>();
  for (const lead of leads) {
    const key = marketerMap[lead.id];
    if (!key) continue;
    byMarketer.set(key, [...(byMarketer.get(key) ?? []), lead]);
  }
  return [...byMarketer.entries()]
    .map(([key, list]) => {
      const won = list.filter((l) => l.stage === WON_STAGE).length;
      return {
        key,
        label: labels[key] ?? key,
        leads: list.length,
        won,
        winRate: list.length > 0 ? Math.round((won / list.length) * 100) : 0,
        pipelineValue: sumMicros(list.filter(OPEN_FOR_PIPELINE)),
      };
    })
    .sort((a, b) => b.leads - a.leads);
};

// ---------- product performance ----------

export type ProductTotals = {
  lines: number;
  units: number;
  installRevenue: number;
  annualRevenue: number;
  avgDiscount: number;
};

export type ProductStats = {
  byUnits: BreakdownRow[];
  byRevenue: BreakdownRow[];
  totals: ProductTotals;
};

const productKey = (line: DealProductStat): string =>
  line.product?.id ?? line.name ?? '—';
const productLabel = (line: DealProductStat): string =>
  line.product?.name ?? line.name ?? '—';

const lineRevenue = (line: DealProductStat): number =>
  (line.installPrice?.amountMicros ?? 0) + (line.annualPrice?.amountMicros ?? 0);

export const computeProductStats = (lines: DealProductStat[]): ProductStats => {
  const grouped = new Map<
    string,
    { label: string; units: number; revenue: number }
  >();
  let installRevenue = 0;
  let annualRevenue = 0;
  let discountSum = 0;
  let discountCount = 0;
  let units = 0;

  for (const line of lines) {
    const key = productKey(line);
    const qty = line.quantity ?? 0;
    const entry = grouped.get(key) ?? { label: productLabel(line), units: 0, revenue: 0 };
    entry.units += qty;
    entry.revenue += lineRevenue(line);
    grouped.set(key, entry);

    units += qty;
    installRevenue += line.installPrice?.amountMicros ?? 0;
    annualRevenue += line.annualPrice?.amountMicros ?? 0;
    if (line.discountPercent !== null && line.discountPercent !== undefined) {
      discountSum += line.discountPercent;
      discountCount += 1;
    }
  }

  const entries = [...grouped.values()];
  return {
    byUnits: entries
      .map((e) => ({ label: e.label, count: e.units, value: e.revenue }))
      .sort((a, b) => b.count - a.count),
    byRevenue: entries
      .map((e) => ({ label: e.label, count: e.units, value: e.revenue }))
      .sort((a, b) => b.value - a.value),
    totals: {
      lines: lines.length,
      units,
      installRevenue,
      annualRevenue,
      avgDiscount: discountCount > 0 ? Math.round(discountSum / discountCount) : 0,
    },
  };
};

// ---------- activity by task type ----------

export type SellerActivityRow = {
  sellerId: string;
  name: string;
  total: number;
  byType: Record<string, number>;
};

export type ActivityStats = {
  mix: BreakdownRow[];
  bySeller: SellerActivityRow[];
};

const taskTypeKey = (task: DoneTask): string => task.taskType ?? 'OTHER';

export const computeActivity = (
  tasks: DoneTask[],
  labels: Record<string, string>,
): ActivityStats => {
  const mixMap = new Map<string, number>();
  const sellerMap = new Map<
    string,
    { name: string; total: number; byType: Record<string, number> }
  >();

  for (const task of tasks) {
    const type = taskTypeKey(task);
    mixMap.set(type, (mixMap.get(type) ?? 0) + 1);

    if (!task.assignee) continue;
    const id = task.assignee.id;
    const entry =
      sellerMap.get(id) ?? {
        name: `${task.assignee.name.firstName} ${task.assignee.name.lastName}`.trim(),
        total: 0,
        byType: {},
      };
    entry.total += 1;
    entry.byType[type] = (entry.byType[type] ?? 0) + 1;
    sellerMap.set(id, entry);
  }

  return {
    mix: [...mixMap.entries()]
      .map(([type, count]) => ({ label: labels[type] ?? type, count, value: 0 }))
      .sort((a, b) => b.count - a.count),
    bySeller: [...sellerMap.entries()]
      .map(([sellerId, e]) => ({ sellerId, name: e.name, total: e.total, byType: e.byType }))
      .sort((a, b) => b.total - a.total),
  };
};
