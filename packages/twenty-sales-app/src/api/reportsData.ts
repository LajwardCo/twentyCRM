import { coreQuery } from './client';
import {
  fetchAllPages,
  fetchLeadsMarketers,
  PAGE_SIZE,
  type Connection,
  type LeadSummary,
  type PagedResult,
  type TaskType,
  withOptionalLeadFields,
} from './records';
import { fetchMembers, type Member } from './admin';

// Dataset fetchers for the report library.
//
// The dashboard (views/ReportsView) reads a handful of shapes it happens to
// need; a report catalog needs whole tables, joined to the records they hang
// off, and it needs them without a report ever half-loading. So every fetcher
// here follows the same two rules:
//
//   * paginate through the connection cursor -- a report that silently stops
//     at one page reads exactly like a complete one;
//   * degrade rather than throw where the object may not be provisioned
//     (subscription, leadOffer, leadReferrer all arrive with a provisioning
//     script), returning `supported: false` so the report can say so.

export type Supported<TValue> =
  | { supported: true; value: TValue; truncated: boolean }
  | { supported: false };

const unsupportedFor = (names: string[]) => (error: unknown): boolean =>
  error instanceof Error &&
  new RegExp(
    `(Cannot query field|is not defined by type|Unknown type|Unknown argument).*"?(${names.join('|')})`,
    'i',
  ).test(error.message);

// ---------- leads ----------

// Every lead, with the optional pricing/stage-timestamp fields where the
// instance has them. Reports need the whole pipeline, not a period slice: open
// pipeline, ageing and win rates are all-time questions, and the period
// selector narrows them afterwards.
export const fetchReportLeads = (): Promise<PagedResult<LeadSummary>> =>
  withOptionalLeadFields((fields) =>
    fetchAllPages<LeadSummary>(async (after) => {
      const data = await coreQuery<{ opportunities: Connection<LeadSummary> }>(
        `query ReportLeads($limit: Int, $after: String) {
          opportunities(
            first: $limit
            after: $after
            orderBy: [{ createdAt: DescNullsLast }]
          ) {
            edges { node { ${fields} } }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { limit: PAGE_SIZE, after },
      );
      return data.opportunities;
    }),
  );

// ---------- tasks ----------

// Wider than records.ts's DoneTask: the activity and follow-up reports name the
// lead a task belongs to, which needs taskTargets, and the SLA report needs
// dueAt on open tasks.
export type ReportTask = {
  id: string;
  title: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | null;
  taskType: TaskType | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: { id: string; name: { firstName: string; lastName: string } } | null;
  taskTargets?: {
    edges: {
      node: {
        opportunity: { id: string; name: string } | null;
        company: { id: string; name: string } | null;
      };
    }[];
  };
};

const REPORT_TASK_FIELDS = `
  id
  title
  status
  taskType
  dueAt
  createdAt
  updatedAt
  assignee { id name { firstName lastName } }
  taskTargets {
    edges { node { opportunity { id name } company { id name } } }
  }
`;

const TASKS_PAGE_QUERY = `query ReportTasks($filter: TaskFilterInput, $limit: Int, $after: String) {
  tasks(filter: $filter, first: $limit, after: $after, orderBy: [{ updatedAt: DescNullsLast }]) {
    edges { node { ${REPORT_TASK_FIELDS} } }
    pageInfo { hasNextPage endCursor }
  }
}`;

const fetchTasksPaged = (
  filter: Record<string, unknown>,
): Promise<PagedResult<ReportTask>> =>
  fetchAllPages<ReportTask>(async (after) => {
    const data = await coreQuery<{ tasks: Connection<ReportTask> }>(
      TASKS_PAGE_QUERY,
      { filter, limit: PAGE_SIZE, after },
    );
    return data.tasks;
  });

// Tasks completed in the period. `updatedAt` is when the row last changed,
// which for a DONE task is when it was ticked -- the same signal the dashboard
// already reports on.
export const fetchReportDoneTasks = (
  sinceIso: string,
): Promise<PagedResult<ReportTask>> =>
  fetchTasksPaged({
    and: [{ status: { eq: 'DONE' } }, { updatedAt: { gte: sinceIso } }],
  });

// Everything still open, with no date bound: an overdue task from four months
// ago is exactly what the SLA report exists to surface.
export const fetchReportOpenTasks = (): Promise<PagedResult<ReportTask>> =>
  fetchTasksPaged({ status: { in: ['TODO', 'IN_PROGRESS'] } });

// ---------- deal products ----------

export type ReportDealProduct = {
  id: string;
  name: string;
  quantity: number | null;
  discountPercent: number | null;
  installPrice: { amountMicros: number | null; currencyCode?: string | null } | null;
  annualPrice: { amountMicros: number | null; currencyCode?: string | null } | null;
  product: { id: string; name: string } | null;
  createdAt: string;
  opportunity?: {
    id: string;
    name: string;
    stage: string | null;
    owner: { id: string; name: { firstName: string; lastName: string } } | null;
  } | null;
};

const DEAL_PRODUCT_FIELDS = `
  id
  name
  quantity
  discountPercent
  installPrice { amountMicros currencyCode }
  annualPrice { amountMicros currencyCode }
  product { id name }
  createdAt
`;

const OPPORTUNITY_SELECTION = `
  opportunity {
    id
    name
    stage
    owner { id name { firstName lastName } }
  }
`;

const dealProductsQuery = (extra: string) =>
  `query ReportDealProducts($filter: DealProductFilterInput, $limit: Int, $after: String) {
    dealProducts(filter: $filter, first: $limit, after: $after, orderBy: [{ createdAt: DescNullsLast }]) {
      edges { node { ${DEAL_PRODUCT_FIELDS} ${extra} } }
      pageInfo { hasNextPage endCursor }
    }
  }`;

const isMissingDealProduct = unsupportedFor(['dealProduct', 'dealProducts', 'DealProduct']);

// Deal lines created in the period, joined to the lead they price. The join is
// retried without `opportunity` because an instance can have the dealProduct
// object without the relation, and losing the lead column is a far better
// outcome than losing the whole revenue report.
export const fetchReportDealProducts = async (
  sinceIso: string,
): Promise<Supported<ReportDealProduct[]>> => {
  const run = (extra: string) =>
    fetchAllPages<ReportDealProduct>(async (after) => {
      const data = await coreQuery<{
        dealProducts: Connection<ReportDealProduct>;
      }>(dealProductsQuery(extra), {
        filter: { createdAt: { gte: sinceIso } },
        limit: PAGE_SIZE,
        after,
      });
      return data.dealProducts;
    });

  try {
    const page = await run(OPPORTUNITY_SELECTION);
    return { supported: true, value: page.items, truncated: page.truncated };
  } catch (error) {
    if (isMissingDealProduct(error)) return { supported: false };
    try {
      const page = await run('');
      return { supported: true, value: page.items, truncated: page.truncated };
    } catch {
      return { supported: false };
    }
  }
};

// ---------- subscriptions ----------

export type ReportSubscription = {
  id: string;
  startDate: string | null;
  endDate: string | null;
  subscriptionStatus: string | null;
  billingPeriod: 'MONTHLY' | 'ANNUAL' | null;
  autoRenew: boolean | null;
  recurringAmount: { amountMicros: number | null; currencyCode: string | null } | null;
  product: { id: string; name: string } | null;
  company: { id: string; name: string } | null;
};

const isMissingSubscription = unsupportedFor([
  'subscription',
  'subscriptions',
  'Subscription',
]);

export const fetchReportSubscriptions = async (): Promise<
  Supported<ReportSubscription[]>
> => {
  try {
    const page = await fetchAllPages<ReportSubscription>(async (after) => {
      const data = await coreQuery<{
        subscriptions: Connection<ReportSubscription>;
      }>(
        `query ReportSubscriptions($limit: Int, $after: String) {
          subscriptions(first: $limit, after: $after, orderBy: [{ startDate: DescNullsLast }]) {
            edges {
              node {
                id
                startDate
                endDate
                subscriptionStatus
                billingPeriod
                autoRenew
                recurringAmount { amountMicros currencyCode }
                product { id name }
                company { id name }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { limit: PAGE_SIZE, after },
      );
      return data.subscriptions;
    });
    return { supported: true, value: page.items, truncated: page.truncated };
  } catch (error) {
    if (isMissingSubscription(error)) return { supported: false };
    throw error;
  }
};

// ---------- offers ----------

export type ReportOffer = {
  id: string;
  offeredAt: string | null;
  createdAt: string;
  offerStatus: string | null;
  amount: { amountMicros: number | null; currencyCode: string | null } | null;
  offeredBy: { id: string; name: { firstName: string; lastName: string } } | null;
  opportunity?: { id: string; name: string; stage: string | null } | null;
};

const isMissingOffer = unsupportedFor(['leadOffer', 'leadOffers', 'LeadOffer']);

export const fetchReportOffers = async (
  sinceIso: string,
): Promise<Supported<ReportOffer[]>> => {
  try {
    const page = await fetchAllPages<ReportOffer>(async (after) => {
      const data = await coreQuery<{ leadOffers: Connection<ReportOffer> }>(
        `query ReportOffers($filter: LeadOfferFilterInput, $limit: Int, $after: String) {
          leadOffers(filter: $filter, first: $limit, after: $after, orderBy: [{ createdAt: DescNullsLast }]) {
            edges {
              node {
                id
                offeredAt
                createdAt
                offerStatus
                amount { amountMicros currencyCode }
                offeredBy { id name { firstName lastName } }
                opportunity { id name stage }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { filter: { createdAt: { gte: sinceIso } }, limit: PAGE_SIZE, after },
      );
      return data.leadOffers;
    });
    return { supported: true, value: page.items, truncated: page.truncated };
  } catch (error) {
    if (isMissingOffer(error)) return { supported: false };
    throw error;
  }
};

// ---------- lead referrers (commission credit) ----------

export type ReportLeadReferrer = {
  id: string;
  commissionPercent: number | null;
  referrerRole: string | null;
  partner: { id: string; name: string; partnerType: string | null } | null;
  opportunity?: { id: string; name: string; stage: string | null } | null;
};

const isMissingLeadReferrer = unsupportedFor([
  'leadReferrer',
  'leadReferrers',
  'LeadReferrer',
]);

export const fetchReportLeadReferrers = async (): Promise<
  Supported<ReportLeadReferrer[]>
> => {
  try {
    const page = await fetchAllPages<ReportLeadReferrer>(async (after) => {
      const data = await coreQuery<{
        leadReferrers: Connection<ReportLeadReferrer>;
      }>(
        `query ReportLeadReferrers($limit: Int, $after: String) {
          leadReferrers(first: $limit, after: $after, orderBy: [{ createdAt: DescNullsLast }]) {
            edges {
              node {
                id
                commissionPercent
                referrerRole
                partner { id name partnerType }
                opportunity { id name stage }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { limit: PAGE_SIZE, after },
      );
      return data.leadReferrers;
    });
    return { supported: true, value: page.items, truncated: page.truncated };
  } catch (error) {
    if (isMissingLeadReferrer(error)) return { supported: false };
    throw error;
  }
};

// ---------- daily reports ----------

export type ReportDailyReport = {
  id: string;
  reportDate: string;
  summary: string | null;
  tasksDoneCount: number | null;
  submittedAt: string;
  seller: { id: string; name: { firstName: string; lastName: string } } | null;
};

const isMissingDailyReport = unsupportedFor([
  'dailyReport',
  'dailyReports',
  'DailyReport',
]);

export const fetchReportDailyReports = async (
  sinceIso: string,
): Promise<Supported<ReportDailyReport[]>> => {
  try {
    const page = await fetchAllPages<ReportDailyReport>(async (after) => {
      const data = await coreQuery<{
        dailyReports: Connection<ReportDailyReport>;
      }>(
        `query ReportDailyReports($filter: DailyReportFilterInput, $limit: Int, $after: String) {
          dailyReports(filter: $filter, first: $limit, after: $after, orderBy: [{ reportDate: DescNullsLast }]) {
            edges {
              node {
                id
                reportDate
                summary
                tasksDoneCount
                submittedAt
                seller { id name { firstName lastName } }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { filter: { reportDate: { gte: sinceIso } }, limit: PAGE_SIZE, after },
      );
      return data.dailyReports;
    });
    return { supported: true, value: page.items, truncated: page.truncated };
  } catch (error) {
    if (isMissingDailyReport(error)) return { supported: false };
    throw error;
  }
};

// ---------- assembled dataset ----------

export type DatasetKey =
  | 'leads'
  | 'marketers'
  | 'members'
  | 'doneTasks'
  | 'openTasks'
  | 'dealProducts'
  | 'subscriptions'
  | 'offers'
  | 'leadReferrers'
  | 'dailyReports';

export type ReportDataset = {
  leads: LeadSummary[];
  marketers: Record<string, string | null | undefined>;
  members: Member[];
  doneTasks: ReportTask[];
  openTasks: ReportTask[];
  dealProducts: ReportDealProduct[];
  subscriptions: ReportSubscription[];
  offers: ReportOffer[];
  leadReferrers: ReportLeadReferrer[];
  dailyReports: ReportDailyReport[];
  // Objects the instance does not have provisioned; the runner shows a note
  // instead of an empty table that looks like "no business happened".
  missing: DatasetKey[];
  // A capped fetch reads exactly like a complete one, so say so.
  truncated: boolean;
};

// fetchLeadsMarketers asks for `first: ids.length`, and Twenty caps a page at
// 200 however large `first` is -- so a workspace past 200 leads would quietly
// lose every marketer after the cap. Ask in page-sized batches instead.
const fetchMarketersForLeads = async (
  ids: string[],
): Promise<Record<string, string | null | undefined>> => {
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += PAGE_SIZE) {
    batches.push(ids.slice(index, index + PAGE_SIZE));
  }
  const results = await Promise.all(batches.map(fetchLeadsMarketers));
  return Object.assign({}, ...results);
};

const EMPTY: ReportDataset = {
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
};

// Loads exactly the datasets a report declares, in parallel. `marketers`
// depends on `leads`, so it is resolved in a second pass.
export const loadReportDataset = async (
  needs: readonly DatasetKey[],
  sinceIso: string,
): Promise<ReportDataset> => {
  const wanted = new Set<DatasetKey>(needs);
  if (wanted.has('marketers')) wanted.add('leads');

  const result: ReportDataset = { ...EMPTY, missing: [], truncated: false };

  const take = <TValue>(
    key: DatasetKey,
    outcome: Supported<TValue>,
    assign: (value: TValue) => void,
  ) => {
    if (!outcome.supported) {
      result.missing.push(key);
      return;
    }
    assign(outcome.value);
    result.truncated = result.truncated || outcome.truncated;
  };

  await Promise.all([
    wanted.has('leads')
      ? fetchReportLeads().then((page) => {
          result.leads = page.items;
          result.truncated = result.truncated || page.truncated;
        })
      : null,
    wanted.has('members')
      ? fetchMembers()
          .then((members) => {
            result.members = members;
          })
          .catch(() => undefined)
      : null,
    wanted.has('doneTasks')
      ? fetchReportDoneTasks(sinceIso).then((page) => {
          result.doneTasks = page.items;
          result.truncated = result.truncated || page.truncated;
        })
      : null,
    wanted.has('openTasks')
      ? fetchReportOpenTasks().then((page) => {
          result.openTasks = page.items;
          result.truncated = result.truncated || page.truncated;
        })
      : null,
    wanted.has('dealProducts')
      ? fetchReportDealProducts(sinceIso).then((outcome) =>
          take('dealProducts', outcome, (value) => {
            result.dealProducts = value;
          }),
        )
      : null,
    wanted.has('subscriptions')
      ? fetchReportSubscriptions().then((outcome) =>
          take('subscriptions', outcome, (value) => {
            result.subscriptions = value;
          }),
        )
      : null,
    wanted.has('offers')
      ? fetchReportOffers(sinceIso).then((outcome) =>
          take('offers', outcome, (value) => {
            result.offers = value;
          }),
        )
      : null,
    wanted.has('leadReferrers')
      ? fetchReportLeadReferrers().then((outcome) =>
          take('leadReferrers', outcome, (value) => {
            result.leadReferrers = value;
          }),
        )
      : null,
    wanted.has('dailyReports')
      ? fetchReportDailyReports(sinceIso).then((outcome) =>
          take('dailyReports', outcome, (value) => {
            result.dailyReports = value;
          }),
        )
      : null,
  ]);

  if (wanted.has('marketers')) {
    result.marketers = await fetchMarketersForLeads(
      result.leads.map((lead) => lead.id),
    );
  }

  return result;
};
