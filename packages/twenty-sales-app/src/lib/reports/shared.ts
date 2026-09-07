import { type LeadSummary } from '../../api/records';
import { type ReportTask } from '../../api/reportsData';
import { personName } from '../format';
import { SOURCE_LABELS, STAGE_LABELS, TEMP_LABELS } from '../strings';
import { amountCell, dateCell, daysCell, NO_VALUE, textCell } from './engine';
import { RT } from './strings';
import { type CellTone, type ReportCell, type ReportContext } from './types';

// Vocabulary shared by the lead-shaped reports. The dashboard's definitions
// (lib/reportAggregations) stay as they are -- these mirror them rather than
// reach into them, so a change to a report never silently moves the dashboard.

export const WON_STAGE = 'ACTIVE_CUSTOMER';
export const LOST_STAGE = 'LOST_MISSED';

export const isWon = (lead: LeadSummary): boolean => lead.stage === WON_STAGE;
export const isLost = (lead: LeadSummary): boolean => lead.stage === LOST_STAGE;
export const isOpen = (lead: LeadSummary): boolean => !isWon(lead) && !isLost(lead);

export const DAY_MS = 86_400_000;

export const daysBetween = (
  from: string | Date | null | undefined,
  to: Date,
): number | null => {
  if (!from) return null;
  const start = from instanceof Date ? from : new Date(from);
  const ms = start.getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor((to.getTime() - ms) / DAY_MS));
};

export const ownerName = (lead: LeadSummary): string | null =>
  lead.owner ? personName(lead.owner) : null;

export const stageText = (lead: LeadSummary): string | null =>
  lead.stage ? (STAGE_LABELS[lead.stage] ?? lead.stage) : null;

export const sourceText = (lead: LeadSummary): string | null =>
  lead.leadSource ? (SOURCE_LABELS[lead.leadSource] ?? lead.leadSource) : null;

export const temperatureText = (lead: LeadSummary): string | null =>
  lead.temperature ? (TEMP_LABELS[lead.temperature] ?? lead.temperature) : null;

// When a lead last moved. `stageChangedAt` only exists once the pricing
// provisioning script has run, so ageing falls back to registration date --
// which over-states freshness rather than inventing a movement that never
// happened.
export const stageSince = (lead: LeadSummary): string =>
  lead.stageChangedAt ?? lead.createdAt;

// When a closed lead closed. Same fallback, same reason.
export const closedAt = (lead: LeadSummary): string =>
  lead.agreedAt ?? lead.stageChangedAt ?? lead.createdAt;

export const HEALTH_WATCH_DAYS = 10;
export const HEALTH_STALE_DAYS = 21;

export const healthCell = (days: number | null): ReportCell => {
  if (days === null) return textCell(null);
  if (days >= HEALTH_STALE_DAYS) {
    return textCell(RT.healthStale, { tone: 'bad' satisfies CellTone });
  }
  if (days >= HEALTH_WATCH_DAYS) {
    return textCell(RT.healthWatch, { tone: 'warn' satisfies CellTone });
  }
  return textCell(RT.healthFresh, { tone: 'good' satisfies CellTone });
};

// The columns almost every lead report opens with, so a seller reads the same
// first four columns wherever they are.
export const leadIdentityCells = (
  lead: LeadSummary,
): Record<string, ReportCell> => ({
  lead: textCell(lead.name),
  company: textCell(lead.company?.name ?? null),
  stage: textCell(stageText(lead)),
  owner: textCell(ownerName(lead)),
  source: textCell(sourceText(lead)),
  temperature: textCell(temperatureText(lead)),
  value: amountCell(lead.amount?.amountMicros, lead.amount?.currencyCode),
  created: dateCell(lead.createdAt),
});

export const leadAgeCells = (
  lead: LeadSummary,
  now: Date,
): Record<string, ReportCell> => ({
  age: daysCell(daysBetween(lead.createdAt, now)),
});

// Period + scope narrowing, applied the same way by every lead report: the
// period bounds registration date, the scope bounds ownership.
export const leadsInScope = (
  leads: LeadSummary[],
  ctx: ReportContext,
): LeadSummary[] =>
  leads.filter(
    (lead) =>
      ctx.scope !== 'me' || lead.owner?.id === ctx.user.workspaceMemberId,
  );

export const createdInPeriod = (
  leads: LeadSummary[],
  ctx: ReportContext,
): LeadSummary[] => {
  const start = ctx.start;
  if (start === null) return leads;
  return leads.filter((lead) => new Date(lead.createdAt) >= start);
};

export const withinPeriod = (
  iso: string | null | undefined,
  ctx: ReportContext,
): boolean => {
  if (ctx.start === null) return true;
  if (!iso) return false;
  return new Date(iso) >= ctx.start;
};

export const taskLeadId = (task: ReportTask): string | null =>
  task.taskTargets?.edges.find((edge) => edge.node.opportunity)?.node.opportunity
    ?.id ?? null;

export const taskLeadName = (task: ReportTask): string | null =>
  task.taskTargets?.edges.find((edge) => edge.node.opportunity)?.node.opportunity
    ?.name ?? null;

export const assigneeName = (task: ReportTask): string | null =>
  task.assignee ? personName(task.assignee) : null;

export const displayOr = (value: string | null): string => value ?? NO_VALUE;
