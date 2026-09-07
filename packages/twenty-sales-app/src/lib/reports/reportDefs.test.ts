import { describe, expect, it } from 'vitest';

import { type CurrentUser } from '../../api/auth';
import {
  type ReportDataset,
  type ReportTask,
} from '../../api/reportsData';
import { type LeadSummary } from '../../api/records';
import { findReport, REPORTS } from './index';
import { type ReportContext, type ReportRow } from './types';

const NOW = new Date('2026-06-01T12:00:00.000Z');

const USER: CurrentUser = {
  workspaceMemberId: 'me',
  firstName: 'احمد',
  lastName: 'رضایی',
  userEmail: 'ahmad@example.com',
} as CurrentUser;

const lead = (over: Partial<LeadSummary> & { id: string }): LeadSummary => ({
  name: `لید ${over.id}`,
  stage: 'NEW_LEAD',
  temperature: 'WARM',
  leadSource: 'FIELD',
  createdAt: '2026-05-01T00:00:00.000Z',
  company: null,
  pointOfContact: null,
  owner: { id: 'me', name: { firstName: 'احمد', lastName: 'رضایی' } },
  amount: { amountMicros: 1_000_000, currencyCode: 'AFN' },
  createdBy: null,
  referrer: null,
  ...over,
});

const task = (over: Partial<ReportTask> & { id: string }): ReportTask => ({
  title: 'تماس',
  status: 'DONE',
  taskType: 'CALL',
  dueAt: null,
  createdAt: '2026-05-20T00:00:00.000Z',
  updatedAt: '2026-05-20T00:00:00.000Z',
  assignee: { id: 'me', name: { firstName: 'احمد', lastName: 'رضایی' } },
  taskTargets: { edges: [] },
  ...over,
});

const dataset = (over: Partial<ReportDataset> = {}): ReportDataset => ({
  leads: [],
  marketers: {},
  members: [],
  doneTasks: [],
  openTasks: [],
  dealProducts: [],
  subscriptions: [],
  offers: [],
  leadReferrers: [],
  dailyReports: [],
  missing: [],
  truncated: false,
  ...over,
});

const ctx = (over: Partial<ReportContext> = {}): ReportContext => ({
  user: USER,
  scope: 'team',
  start: new Date('2026-03-01T00:00:00.000Z'),
  now: NOW,
  ...over,
});

// One dataset that reaches every report in the catalog at once.
const fullDataset = (): ReportDataset => {
  const seller = { id: 'me', name: { firstName: 'احمد', lastName: 'رضایی' } };
  const targets = {
    edges: [{ node: { opportunity: { id: 'L1', name: 'لید L1' }, company: null } }],
  };
  return dataset({
    leads: [
      lead({ id: 'L1' }),
      lead({
        id: 'L2',
        stage: 'ACTIVE_CUSTOMER',
        stageChangedAt: '2026-05-10T00:00:00.000Z',
        referrer: {
          id: 'p1',
          name: 'شرکت الف',
          partnerType: 'PARTNER',
          commissionPercent: 10,
        },
      }),
      lead({ id: 'L3', stage: 'LOST_MISSED', stageChangedAt: '2026-05-12T00:00:00.000Z' }),
    ],
    marketers: { L1: 'بازاریاب یک', L2: 'بازاریاب یک' },
    members: [{ id: 'me', name: seller.name, userEmail: 'a@b.c' }],
    doneTasks: [task({ id: 't1', taskTargets: targets })],
    openTasks: [
      task({ id: 't2', status: 'TODO', dueAt: '2026-05-20T00:00:00.000Z', taskTargets: targets }),
    ],
    dealProducts: [
      {
        id: 'dp1',
        name: 'خط',
        quantity: 2,
        discountPercent: 15,
        installPrice: { amountMicros: 5_000_000, currencyCode: 'AFN' },
        annualPrice: { amountMicros: 1_000_000, currencyCode: 'AFN' },
        product: { id: 'p', name: 'محصول' },
        createdAt: '2026-05-05T00:00:00.000Z',
        opportunity: { id: 'L2', name: 'لید L2', stage: 'ACTIVE_CUSTOMER', owner: seller },
      },
    ],
    subscriptions: [
      {
        id: 's1',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-12-01T00:00:00.000Z',
        subscriptionStatus: 'ACTIVE',
        billingPeriod: 'ANNUAL',
        autoRenew: true,
        recurringAmount: { amountMicros: 9_000_000, currencyCode: 'AFN' },
        product: { id: 'p', name: 'محصول' },
        company: { id: 'c', name: 'مشتری' },
      },
    ],
    offers: [
      {
        id: 'o1',
        offeredAt: '2026-05-02T00:00:00.000Z',
        createdAt: '2026-05-02T00:00:00.000Z',
        offerStatus: 'ACCEPTED',
        amount: { amountMicros: 4_000_000, currencyCode: 'AFN' },
        offeredBy: seller,
        opportunity: { id: 'L2', name: 'لید L2', stage: 'ACTIVE_CUSTOMER' },
      },
    ],
    leadReferrers: [
      {
        id: 'r1',
        commissionPercent: 10,
        referrerRole: 'FINDER',
        partner: { id: 'p1', name: 'شرکت الف', partnerType: 'PARTNER' },
        opportunity: { id: 'L2', name: 'لید L2', stage: 'ACTIVE_CUSTOMER' },
      },
    ],
    dailyReports: [
      {
        id: 'd1',
        reportDate: '2026-05-30T00:00:00.000Z',
        summary: 'کار روز',
        tasksDoneCount: 3,
        submittedAt: '2026-05-30T15:00:00.000Z',
        seller,
      },
    ],
  });
};

const run = (id: string, data: ReportDataset, context = ctx()): ReportRow[] => {
  const report = findReport(id);
  if (!report) throw new Error(`no report ${id}`);
  return report.build(data, context);
};

describe('the catalog', () => {
  it('should give every report a unique id', () => {
    const ids = REPORTS.map((report) => report.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should sort by a column it actually declares', () => {
    for (const report of REPORTS) {
      expect(
        report.columns.some((column) => column.key === report.defaultSort.key),
      ).toBe(true);
    }
  });

  it('should only offer group-by and chart keys that exist as columns', () => {
    for (const report of REPORTS) {
      const keys = new Set(report.columns.map((column) => column.key));
      for (const key of report.groupBy ?? []) expect(keys.has(key)).toBe(true);
      if (report.chart) expect(keys.has(report.chart.groupBy)).toBe(true);
      if (report.chart?.value) expect(keys.has(report.chart.value)).toBe(true);
    }
  });

  // A column with no cell renders as a permanent em dash, sorts as "no value"
  // and exports as blank -- a silent hole rather than an error, so it is worth
  // asserting across the whole catalog on data that reaches every report.
  it('should fill every declared column on every row it builds', () => {
    const data = fullDataset();
    const holes: string[] = [];
    let built = 0;

    for (const report of REPORTS) {
      const rows = report.build(data, ctx());
      built += rows.length > 0 ? 1 : 0;
      for (const row of rows) {
        for (const column of report.columns) {
          if (row.cells[column.key] === undefined) {
            holes.push(`${report.id}.${column.key}`);
          }
        }
      }
    }

    expect(holes).toEqual([]);
    // Guards the guard: an empty dataset would make the loop above vacuous.
    expect(built).toBe(REPORTS.length);
  });
});

describe('pipeline-detail', () => {
  it('should list only leads that are still open', () => {
    const rows = run(
      'pipeline-detail',
      dataset({
        leads: [
          lead({ id: 'open' }),
          lead({ id: 'won', stage: 'ACTIVE_CUSTOMER' }),
          lead({ id: 'lost', stage: 'LOST_MISSED' }),
        ],
      }),
    );
    expect(rows.map((row) => row.id)).toEqual(['open']);
  });

  it('should narrow to the signed-in seller in "me" scope', () => {
    const rows = run(
      'pipeline-detail',
      dataset({
        leads: [
          lead({ id: 'mine' }),
          lead({
            id: 'theirs',
            owner: { id: 'other', name: { firstName: 'سارا', lastName: 'ن' } },
          }),
        ],
      }),
      ctx({ scope: 'me' }),
    );
    expect(rows.map((row) => row.id)).toEqual(['mine']);
  });
});

describe('stage-aging', () => {
  it('should age from the stage change, not from registration', () => {
    const rows = run(
      'stage-aging',
      dataset({
        leads: [
          lead({
            id: '1',
            createdAt: '2026-01-01T00:00:00.000Z',
            stageChangedAt: '2026-05-30T00:00:00.000Z',
          }),
        ],
      }),
    );
    expect(rows[0].cells.daysInStage.value).toBe(2);
    expect(rows[0].cells.age.value).toBe(151);
  });

  it('should fall back to registration where no stage timestamp exists', () => {
    const rows = run(
      'stage-aging',
      dataset({ leads: [lead({ id: '1', createdAt: '2026-05-02T00:00:00.000Z' })] }),
    );
    expect(rows[0].cells.daysInStage.value).toBe(30);
  });

  it('should flag a long-stalled lead', () => {
    const rows = run(
      'stage-aging',
      dataset({ leads: [lead({ id: '1', createdAt: '2026-01-01T00:00:00.000Z' })] }),
    );
    expect(rows[0].cells.health.tone).toBe('bad');
  });
});

describe('silent-leads', () => {
  const leads = [lead({ id: 'L1', createdAt: '2026-01-01T00:00:00.000Z' })];
  const targeting = (id: string) => ({
    edges: [{ node: { opportunity: { id, name: 'لید' }, company: null } }],
  });

  it('should measure silence from the last completed task', () => {
    const rows = run(
      'silent-leads',
      dataset({
        leads,
        doneTasks: [
          task({
            id: 't',
            updatedAt: '2026-05-25T00:00:00.000Z',
            taskTargets: targeting('L1'),
          }),
        ],
      }),
    );
    expect(rows[0].cells.daysSilent.value).toBe(7);
  });

  it('should count a task booked for later as contact, not silence', () => {
    const rows = run(
      'silent-leads',
      dataset({
        leads,
        openTasks: [
          task({
            id: 't',
            status: 'TODO',
            createdAt: '2026-05-28T00:00:00.000Z',
            dueAt: '2026-06-10T00:00:00.000Z',
            taskTargets: targeting('L1'),
          }),
        ],
      }),
    );
    expect(rows[0].cells.daysSilent.value).toBe(4);
  });

  it('should fall back to registration and mark it as never touched', () => {
    const rows = run('silent-leads', dataset({ leads }));
    expect(rows[0].cells.daysSilent.value).toBe(151);
    expect(rows[0].cells.lastActivity.tone).toBe('warn');
  });
});

describe('win-loss', () => {
  it('should count only deals closed inside the period', () => {
    const rows = run(
      'win-loss',
      dataset({
        leads: [
          lead({
            id: 'inside',
            stage: 'ACTIVE_CUSTOMER',
            createdAt: '2026-01-01T00:00:00.000Z',
            stageChangedAt: '2026-04-01T00:00:00.000Z',
          }),
          lead({
            id: 'outside',
            stage: 'LOST_MISSED',
            createdAt: '2025-06-01T00:00:00.000Z',
            stageChangedAt: '2025-07-01T00:00:00.000Z',
          }),
        ],
      }),
    );
    expect(rows.map((row) => row.id)).toEqual(['inside']);
    expect(rows[0].cells.daysToClose.value).toBe(90);
  });

  it('should compute the win rate from closed deals only', () => {
    const report = findReport('win-loss');
    const data = dataset({
      leads: [
        lead({ id: 'w', stage: 'ACTIVE_CUSTOMER', stageChangedAt: '2026-05-01T00:00:00.000Z' }),
        lead({ id: 'l', stage: 'LOST_MISSED', stageChangedAt: '2026-05-01T00:00:00.000Z' }),
        lead({ id: 'open' }),
      ],
    });
    const rows = report!.build(data, ctx());
    const kpis = report!.kpis!(rows, ctx());
    expect(kpis.find((k) => k.label.includes('نرخ موفقیت'))?.value).toBe('۵۰٪');
  });
});

describe('referrer-commission', () => {
  const partner = { id: 'p1', name: 'شرکت الف', partnerType: 'PARTNER' };

  it('should apply the negotiated rate to won value, per currency', () => {
    const rows = run(
      'referrer-commission',
      dataset({
        leads: [
          lead({
            id: 'L1',
            stage: 'ACTIVE_CUSTOMER',
            amount: { amountMicros: 10_000_000, currencyCode: 'USD' },
          }),
        ],
        leadReferrers: [
          {
            id: 'r1',
            commissionPercent: 10,
            referrerRole: 'FINDER',
            partner,
            opportunity: { id: 'L1', name: 'لید L1', stage: 'ACTIVE_CUSTOMER' },
          },
        ],
      }),
    );
    expect(rows[0].cells.commissionDue.totals).toEqual({ USD: 1_000_000 });
  });

  it('should not pay commission on a deal that is still open', () => {
    const rows = run(
      'referrer-commission',
      dataset({
        leads: [lead({ id: 'L1' })],
        leadReferrers: [
          {
            id: 'r1',
            commissionPercent: 10,
            referrerRole: 'FINDER',
            partner,
            opportunity: { id: 'L1', name: 'لید L1', stage: 'NEW_LEAD' },
          },
        ],
      }),
    );
    expect(rows[0].cells.commissionDue.totals).toEqual({});
    expect(rows[0].cells.leads.value).toBe(1);
  });

  it('should credit a partner named twice on one lead only once', () => {
    const rows = run(
      'referrer-commission',
      dataset({
        leads: [
          lead({
            id: 'L1',
            stage: 'ACTIVE_CUSTOMER',
            referrer: {
              id: 'p1',
              name: 'شرکت الف',
              partnerType: 'PARTNER',
              commissionPercent: 25,
            },
          }),
        ],
        leadReferrers: [
          {
            id: 'r1',
            commissionPercent: 10,
            referrerRole: 'FINDER',
            partner,
            opportunity: { id: 'L1', name: 'لید L1', stage: 'ACTIVE_CUSTOMER' },
          },
        ],
      }),
    );
    expect(rows).toHaveLength(1);
    // The negotiated join-row rate wins over the partner's default.
    expect(rows[0].cells.rate.value).toBe(10);
  });
});

describe('subscriptions', () => {
  it('should annualise a monthly plan so plans are comparable', () => {
    const rows = run(
      'subscriptions',
      dataset({
        subscriptions: [
          {
            id: 's1',
            startDate: '2026-01-01T00:00:00.000Z',
            endDate: '2026-06-20T00:00:00.000Z',
            subscriptionStatus: 'ACTIVE',
            billingPeriod: 'MONTHLY',
            autoRenew: true,
            recurringAmount: { amountMicros: 1_000_000, currencyCode: 'AFN' },
            product: { id: 'p', name: 'محصول' },
            company: { id: 'c', name: 'مشتری' },
          },
        ],
      }),
    );
    expect(rows[0].cells.annualized.totals).toEqual({ AFN: 12_000_000 });
    expect(rows[0].cells.daysToRenewal.value).toBe(19);
  });
});

describe('task-sla', () => {
  it('should count overdue days from the due date', () => {
    const rows = run(
      'task-sla',
      dataset({
        openTasks: [
          task({ id: 't', status: 'TODO', dueAt: '2026-05-25T12:00:00.000Z' }),
        ],
      }),
    );
    expect(rows[0].cells.overdue.value).toBe(7);
    expect(rows[0].cells.status.tone).toBe('bad');
  });

  it('should place a task with no due date in its own bucket', () => {
    const rows = run(
      'task-sla',
      dataset({ openTasks: [task({ id: 't', status: 'TODO', dueAt: null })] }),
    );
    expect(rows[0].cells.overdue.value).toBeNull();
    expect(rows[0].cells.status.value).toBe('بدون موعد');
  });
});

describe('daily-report-compliance', () => {
  it('should give a member who filed nothing a row with a zero rate', () => {
    const rows = run(
      'daily-report-compliance',
      dataset({
        members: [
          {
            id: 'm1',
            name: { firstName: 'سارا', lastName: 'نوری' },
            userEmail: null,
          },
        ],
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].cells.submitted.value).toBe(0);
    expect(rows[0].cells.complianceRate.value).toBe(0);
  });

  it('should count one submission per day, not per row', () => {
    const seller = { id: 'm1', name: { firstName: 'سارا', lastName: 'نوری' } };
    const rows = run(
      'daily-report-compliance',
      dataset({
        dailyReports: [
          {
            id: 'd1',
            reportDate: '2026-05-30T00:00:00.000Z',
            summary: null,
            tasksDoneCount: 4,
            submittedAt: '2026-05-30T15:00:00.000Z',
            seller,
          },
          {
            id: 'd2',
            reportDate: '2026-05-30T00:00:00.000Z',
            summary: null,
            tasksDoneCount: 6,
            submittedAt: '2026-05-30T18:00:00.000Z',
            seller,
          },
        ],
      }),
    );
    expect(rows[0].cells.submitted.value).toBe(1);
    expect(rows[0].cells.avgReported.value).toBe(5);
  });
});
