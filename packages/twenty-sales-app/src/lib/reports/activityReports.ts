import { type ReportTask } from '../../api/reportsData';
import { personName } from '../format';
import { toPersianDigits } from '../jalali';
import { TASK_TYPE_LABELS } from '../strings';
import {
  averageNumber,
  countKpi,
  countWhere,
  daysCell,
  daysKpi,
  kpi,
  numberCell,
  percentCell,
  percentKpi,
  sumNumber,
  textCell,
  topLabel,
} from './engine';
import { assigneeName, DAY_MS, taskLeadId, taskLeadName } from './shared';
import { RT } from './strings';
import { type CellTone, type ReportDefinition } from './types';

// Activity reports describe effort rather than outcome: what the team did, what
// it owes, and whether the daily discipline held.

const taskTypeLabel = (task: ReportTask): string | null =>
  task.taskType ? (TASK_TYPE_LABELS[task.taskType] ?? task.taskType) : null;

const inScope = (task: ReportTask, memberId: string, scope: string): boolean =>
  scope !== 'me' || task.assignee?.id === memberId;

const activityLogReport: ReportDefinition = {
  id: 'activity-log',
  title: RT.rActivityTitle,
  description: RT.rActivityDesc,
  category: 'activity',
  needs: ['doneTasks'],
  scoped: true,
  defaultSort: { key: 'date', dir: 'desc' },
  groupBy: ['seller', 'taskType'],
  chart: { groupBy: 'taskType' },
  columns: [
    { key: 'date', label: RT.colDate, kind: 'date', filter: 'dateRange' },
    { key: 'seller', label: RT.colSeller, kind: 'text', filter: 'enum' },
    { key: 'taskType', label: RT.colTaskType, kind: 'text', filter: 'enum' },
    { key: 'task', label: RT.colTask, kind: 'text', filter: 'text' },
    { key: 'lead', label: RT.colLead, kind: 'text', filter: 'text' },
  ],
  build: (data, ctx) =>
    data.doneTasks
      .filter((task) => inScope(task, ctx.user.workspaceMemberId, ctx.scope))
      .map((task) => {
        const leadId = taskLeadId(task);
        return {
          id: task.id,
          href: leadId ? `/lead/${leadId}` : `/task/${task.id}`,
          cells: {
            date: { value: task.updatedAt },
            seller: textCell(assigneeName(task)),
            taskType: textCell(taskTypeLabel(task)),
            task: textCell(task.title),
            lead: textCell(taskLeadName(task)),
          },
        };
      }),
  kpis: (rows, ctx) => {
    // Per-day rate over the selected window, so a week and a quarter are
    // comparable. All-time has no window, so it has no rate.
    const days =
      ctx.start === null
        ? null
        : Math.max(1, Math.round((ctx.now.getTime() - ctx.start.getTime()) / DAY_MS));
    return [
      countKpi(RT.kTasksDone, rows.length),
      kpi(
        RT.kPerDay,
        days === null
          ? '—'
          : toPersianDigits(Math.round((rows.length / days) * 10) / 10),
      ),
      kpi(RT.kTopType, topLabel(rows, 'taskType')),
      kpi(RT.kTopSeller, topLabel(rows, 'seller')),
    ];
  },
};

const dueBucket = (
  dueAt: string | null,
  now: Date,
): { label: string; tone?: CellTone; overdue: number | null } => {
  if (!dueAt) return { label: RT.noDue, tone: 'muted', overdue: null };
  const diffDays = Math.floor((now.getTime() - new Date(dueAt).getTime()) / DAY_MS);
  if (diffDays > 0) return { label: RT.overdueLabel, tone: 'bad', overdue: diffDays };
  if (diffDays === 0) return { label: RT.dueToday, tone: 'warn', overdue: 0 };
  if (diffDays >= -7) return { label: RT.dueSoon, overdue: diffDays };
  return { label: RT.dueLater, tone: 'muted', overdue: diffDays };
};

const taskSlaReport: ReportDefinition = {
  id: 'task-sla',
  title: RT.rSlaTitle,
  description: RT.rSlaDesc,
  category: 'activity',
  needs: ['openTasks'],
  scoped: true,
  defaultSort: { key: 'overdue', dir: 'desc' },
  groupBy: ['assignee', 'status', 'taskType'],
  chart: { groupBy: 'status' },
  columns: [
    { key: 'task', label: RT.colTask, kind: 'text', filter: 'text' },
    { key: 'assignee', label: RT.colAssignee, kind: 'text', filter: 'enum' },
    { key: 'lead', label: RT.colLead, kind: 'text', filter: 'text' },
    { key: 'taskType', label: RT.colTaskType, kind: 'text', filter: 'enum' },
    { key: 'due', label: RT.colDue, kind: 'date', filter: 'dateRange' },
    { key: 'overdue', label: RT.colOverdue, kind: 'days', filter: 'range' },
    { key: 'status', label: RT.colStatus, kind: 'text', filter: 'enum' },
    { key: 'created', label: RT.colCreated, kind: 'date', filter: 'dateRange' },
  ],
  // Open tasks are deliberately not bounded by the period: an overdue task from
  // four months ago is exactly what this report exists to surface.
  build: (data, ctx) =>
    data.openTasks
      .filter((task) => inScope(task, ctx.user.workspaceMemberId, ctx.scope))
      .map((task) => {
        const bucket = dueBucket(task.dueAt, ctx.now);
        const leadId = taskLeadId(task);
        return {
          id: task.id,
          href: leadId ? `/lead/${leadId}` : `/task/${task.id}`,
          cells: {
            task: textCell(task.title),
            assignee: textCell(assigneeName(task)),
            lead: textCell(taskLeadName(task)),
            taskType: textCell(taskTypeLabel(task)),
            due: { value: task.dueAt },
            overdue: daysCell(
              bucket.overdue !== null && bucket.overdue > 0 ? bucket.overdue : null,
              { tone: 'bad' },
            ),
            status: textCell(bucket.label, { tone: bucket.tone }),
            created: { value: task.createdAt },
          },
        };
      }),
  kpis: (rows) => [
    countKpi(RT.rows, rows.length),
    countKpi(
      RT.kOverdue,
      countWhere(rows, (row) => row.cells.status?.value === RT.overdueLabel),
      { tone: 'bad' },
    ),
    countKpi(
      RT.kDueToday,
      countWhere(rows, (row) => row.cells.status?.value === RT.dueToday),
      { tone: 'warn' },
    ),
    countKpi(
      RT.kNoDue,
      countWhere(rows, (row) => row.cells.status?.value === RT.noDue),
    ),
    daysKpi(
      RT.kWorstDelay,
      Math.max(
        0,
        ...rows.map((row) => Number(row.cells.overdue?.value ?? 0)),
      ) || null,
    ),
  ],
};

// Working days in the window, Friday excluded: the Afghan week runs Saturday to
// Thursday, so counting Fridays would mark every seller permanently behind.
const workingDaysBetween = (start: Date, end: Date): number => {
  let count = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    if (cursor.getDay() !== 5) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
};

const dailyComplianceReport: ReportDefinition = {
  id: 'daily-report-compliance',
  title: RT.rDailyTitle,
  description: RT.rDailyDesc,
  category: 'activity',
  needs: ['dailyReports', 'members'],
  requires: 'dailyReport',
  defaultSort: { key: 'complianceRate', dir: 'desc' },
  chart: { groupBy: 'seller', count: 'submitted' },
  columns: [
    { key: 'seller', label: RT.colSeller, kind: 'text', filter: 'enum' },
    { key: 'submitted', label: RT.colSubmitted, kind: 'number', filter: 'range' },
    { key: 'expected', label: RT.colExpected, kind: 'number' },
    { key: 'complianceRate', label: RT.colComplianceRate, kind: 'percent', filter: 'range' },
    { key: 'avgReported', label: RT.colAvgReported, kind: 'number' },
    { key: 'lastSubmission', label: RT.colLastSubmission, kind: 'date', filter: 'dateRange' },
  ],
  build: (data, ctx) => {
    const expected =
      ctx.start === null ? null : workingDaysBetween(ctx.start, ctx.now);

    const bySeller = new Map<string, typeof data.dailyReports>();
    for (const report of data.dailyReports) {
      const name = report.seller ? personName(report.seller) : null;
      if (!name) continue;
      bySeller.set(name, [...(bySeller.get(name) ?? []), report]);
    }

    // Members who filed nothing are the point of a compliance report, so every
    // known member gets a row even with no submissions.
    for (const member of data.members) {
      const name = personName(member);
      if (!bySeller.has(name)) bySeller.set(name, []);
    }

    return [...bySeller.entries()].map(([seller, reports]) => {
      const days = new Set(reports.map((report) => report.reportDate.slice(0, 10)));
      const counts = reports
        .map((report) => report.tasksDoneCount)
        .filter((count): count is number => count !== null && count !== undefined);
      return {
        id: seller,
        cells: {
          seller: textCell(seller),
          submitted: numberCell(days.size),
          expected: numberCell(expected),
          complianceRate: percentCell(
            expected && expected > 0
              ? Math.min(100, (days.size / expected) * 100)
              : null,
          ),
          avgReported: numberCell(
            counts.length > 0
              ? Math.round(
                  (counts.reduce((sum, count) => sum + count, 0) / counts.length) * 10,
                ) / 10
              : null,
          ),
          lastSubmission: {
            value:
              reports
                .map((report) => report.submittedAt)
                .sort()
                .slice(-1)[0] ?? null,
          },
        },
      };
    });
  },
  kpis: (rows) => [
    countKpi(RT.kSellers, rows.length),
    countKpi(RT.kReportDays, sumNumber(rows, 'submitted')),
    percentKpi(RT.kCompliance, averageNumber(rows, 'complianceRate')),
    kpi(RT.kTopSeller, topLabel(rows, 'seller')),
  ],
};

export const ACTIVITY_REPORTS: ReportDefinition[] = [
  activityLogReport,
  taskSlaReport,
  dailyComplianceReport,
];
