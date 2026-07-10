import { coreQuery } from './client';

export type DailyReport = {
  id: string;
  reportDate: string;
  summary: string | null;
  tomorrowPlan: string | null;
  tasksDoneCount: number | null;
  submittedAt: string;
  seller: { id: string; name: { firstName: string; lastName: string } } | null;
};

const DAILY_REPORT_FIELDS = `
  id
  reportDate
  summary
  tomorrowPlan
  tasksDoneCount
  submittedAt
  seller { id name { firstName lastName } }
`;

// Normalizes any date to local midnight ISO, so "today's report" always
// resolves to the same reportDate value on write and on read.
export const reportDateKeyFor = (date: Date): string => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export const fetchMyDailyReportForDate = async (
  sellerId: string,
  reportDateIso: string,
): Promise<DailyReport | null> => {
  const data = await coreQuery<{
    dailyReports: { edges: { node: DailyReport }[] };
  }>(
    `query MyDailyReportForDate($filter: DailyReportFilterInput) {
      dailyReports(filter: $filter, first: 1) {
        edges { node { ${DAILY_REPORT_FIELDS} } }
      }
    }`,
    {
      filter: {
        and: [
          { sellerId: { eq: sellerId } },
          { reportDate: { eq: reportDateIso } },
        ],
      },
    },
  );
  return data.dailyReports.edges[0]?.node ?? null;
};

export const fetchMyDailyReports = async (
  sellerId: string,
  limit = 14,
): Promise<DailyReport[]> => {
  const data = await coreQuery<{
    dailyReports: { edges: { node: DailyReport }[] };
  }>(
    `query MyDailyReports($filter: DailyReportFilterInput, $limit: Int) {
      dailyReports(filter: $filter, first: $limit, orderBy: [{ reportDate: DescNullsLast }]) {
        edges { node { ${DAILY_REPORT_FIELDS} } }
      }
    }`,
    {
      filter: { sellerId: { eq: sellerId } },
      limit,
    },
  );
  return data.dailyReports.edges.map((e) => e.node);
};

export const fetchTeamDailyReports = async (
  reportDateIso: string,
): Promise<DailyReport[]> => {
  const data = await coreQuery<{
    dailyReports: { edges: { node: DailyReport }[] };
  }>(
    `query TeamDailyReports($filter: DailyReportFilterInput) {
      dailyReports(filter: $filter, first: 100, orderBy: [{ submittedAt: DescNullsLast }]) {
        edges { node { ${DAILY_REPORT_FIELDS} } }
      }
    }`,
    { filter: { reportDate: { eq: reportDateIso } } },
  );
  return data.dailyReports.edges.map((e) => e.node);
};

export const upsertDailyReport = async (input: {
  id?: string;
  sellerId: string;
  reportDate: string;
  summary: string;
  tomorrowPlan: string;
  tasksDoneCount: number;
}): Promise<string> => {
  const payload = {
    summary: input.summary,
    tomorrowPlan: input.tomorrowPlan,
    tasksDoneCount: input.tasksDoneCount,
    submittedAt: new Date().toISOString(),
  };
  if (input.id) {
    await coreQuery(
      `mutation UpdateDailyReport($id: UUID!, $data: DailyReportUpdateInput!) {
        updateDailyReport(id: $id, data: $data) { id }
      }`,
      { id: input.id, data: payload },
    );
    return input.id;
  }
  const created = await coreQuery<{ createDailyReport: { id: string } }>(
    `mutation CreateDailyReport($data: DailyReportCreateInput!) {
      createDailyReport(data: $data) { id }
    }`,
    {
      data: {
        ...payload,
        sellerId: input.sellerId,
        reportDate: input.reportDate,
      },
    },
  );
  return created.createDailyReport.id;
};
