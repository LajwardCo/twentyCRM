import { type FollowUpTask, type VisitRecord } from '../lib/forms/insights';
import { coreQuery } from './client';
import { type PageInfo, fetchAllPaged, withRateLimitRetry } from './surveyPaging';
import { type SurveyFormStatus, type VisitOutcome } from './surveys';

// Reads that only the insights screens need: a campaign's visits, fresh
// stages of a set of leads, tasks on those leads, and per-campaign counts.
// Every list follows cursors — the record API silently returns fewer rows
// than `first` asks for, so a single oversized page would undercount.

const PAGE = 100;
// Keeps each `in: [...]` filter, and so each request body, small.
const ID_CHUNK = 100;

const chunk = <TItem>(items: TItem[], size: number): TItem[][] => {
  const chunks: TItem[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const fetchAllPages = async <TNode>(
  fetchPage: (after: string | null) => Promise<{ nodes: TNode[]; pageInfo: PageInfo }>,
): Promise<TNode[]> => (await fetchAllPaged(fetchPage)).items;

// ---- visits ---------------------------------------------------------------

type RawVisit = {
  id: string;
  status: string | null;
  visitOutcome: VisitOutcome | null;
  assignee: VisitRecord['assignee'];
  taskTargets: { edges: { node: { targetOpportunityId: string | null } }[] } | null;
};

export const fetchCampaignVisits = async (
  campaignId: string,
): Promise<{ visits: VisitRecord[]; truncated: boolean }> => {
  const { items: nodes, truncated } = await fetchAllPaged<RawVisit>(async (after) => {
    const data = await coreQuery<{
      tasks: { pageInfo: PageInfo; edges: { node: RawVisit }[] };
    }>(
      `query SurveyCampaignVisits($campaignId: UUID!, $first: Int, $after: String) {
        tasks(
          filter: { surveyCampaignId: { eq: $campaignId }, taskType: { eq: VISIT } }
          first: $first
          after: $after
          orderBy: [{ createdAt: DescNullsLast }]
        ) {
          pageInfo { endCursor hasNextPage }
          edges { node {
            id status visitOutcome
            assignee { id name { firstName lastName } }
            taskTargets { edges { node { targetOpportunityId } } }
          } }
        }
      }`,
      { campaignId, first: PAGE, after },
    );

    return {
      nodes: data.tasks.edges.map((edge) => edge.node),
      pageInfo: data.tasks.pageInfo,
    };
  });

  const visits = nodes.map((node) => ({
    id: node.id,
    status: node.status,
    visitOutcome: node.visitOutcome,
    assignee: node.assignee,
    opportunityIds: (node.taskTargets?.edges ?? []).flatMap((edge) =>
      edge.node.targetOpportunityId === null ? [] : [edge.node.targetOpportunityId],
    ),
  }));

  return { visits, truncated };
};

// ---- leads ----------------------------------------------------------------

// Current stage of each lead (id → stage). Leads the user cannot read, or
// that were deleted, are simply absent.
export const fetchOpportunityStages = async (
  opportunityIds: string[],
): Promise<Map<string, string | null>> => {
  const stages = new Map<string, string | null>();

  for (const ids of chunk([...new Set(opportunityIds)], ID_CHUNK)) {
    const nodes = await fetchAllPages<{ id: string; stage: string | null }>(async (after) => {
      const data = await coreQuery<{
        opportunities: { pageInfo: PageInfo; edges: { node: { id: string; stage: string | null } }[] };
      }>(
        `query SurveyLeadStages($ids: [UUID!], $first: Int, $after: String) {
          opportunities(filter: { id: { in: $ids } }, first: $first, after: $after) {
            pageInfo { endCursor hasNextPage }
            edges { node { id stage } }
          }
        }`,
        { ids, first: PAGE, after },
      );

      return {
        nodes: data.opportunities.edges.map((edge) => edge.node),
        pageInfo: data.opportunities.pageInfo,
      };
    });

    for (const node of nodes) stages.set(node.id, node.stage);
  }

  return stages;
};

type RawTaskTarget = {
  task: { id: string; status: string | null; taskType: string | null; deletedAt: string | null } | null;
};

// Every task attached to any of these leads (follow-ups; visits are
// filtered out by the caller's aggregation).
export const fetchLeadTasks = async (opportunityIds: string[]): Promise<FollowUpTask[]> => {
  const tasks: FollowUpTask[] = [];

  for (const ids of chunk([...new Set(opportunityIds)], ID_CHUNK)) {
    const nodes = await fetchAllPages<RawTaskTarget>(async (after) => {
      const data = await coreQuery<{
        taskTargets: { pageInfo: PageInfo; edges: { node: RawTaskTarget }[] };
      }>(
        `query SurveyLeadTasks($ids: [UUID!], $first: Int, $after: String) {
          taskTargets(filter: { targetOpportunityId: { in: $ids } }, first: $first, after: $after) {
            pageInfo { endCursor hasNextPage }
            edges { node { task { id status taskType deletedAt } } }
          }
        }`,
        { ids, first: PAGE, after },
      );

      return {
        nodes: data.taskTargets.edges.map((edge) => edge.node),
        pageInfo: data.taskTargets.pageInfo,
      };
    });

    for (const node of nodes) {
      if (node.task === null || node.task.deletedAt !== null) continue;

      tasks.push({ id: node.task.id, status: node.task.status, taskType: node.task.taskType });
    }
  }

  return tasks;
};

// ---- campaign list --------------------------------------------------------

// Completed, non-spam responses per campaign: one groupBy on campaignId (a
// request per campaign would trip the API rate limit on a long list).
// groupBy caps groups at 50 by default, so the limit is sized to the list;
// long lists are split to keep each `in: [...]` small.
export const countCompletedByCampaign = async (
  campaignIds: string[],
): Promise<Record<string, number>> => {
  const counts: Record<string, number> = Object.fromEntries(campaignIds.map((campaignId) => [campaignId, 0]));

  for (const ids of chunk([...new Set(campaignIds)], ID_CHUNK)) {
    const data = await withRateLimitRetry(() =>
      coreQuery<{
        surveyResponsesGroupBy: { groupByDimensionValues: (string | null)[]; totalCount: number }[];
      }>(
        // A null review status is not spam, hence the explicit OR.
        `query SurveyCampaignCompleted($ids: [UUID!], $limit: Int) {
          surveyResponsesGroupBy(
            groupBy: [{ campaignId: true }]
            filter: {
              campaignId: { in: $ids }
              completionStatus: { eq: COMPLETED }
              or: [{ reviewStatus: { neq: SPAM } }, { reviewStatus: { is: NULL } }]
            }
            limit: $limit
          ) { groupByDimensionValues totalCount }
        }`,
        { ids, limit: ids.length },
      ),
    );

    for (const group of data.surveyResponsesGroupBy) {
      const campaignId = group.groupByDimensionValues[0];

      if (typeof campaignId === 'string' && campaignId in counts) counts[campaignId] = group.totalCount;
    }
  }

  return counts;
};

// ---- forms picker ---------------------------------------------------------

export type CampaignFormOption = {
  id: string;
  name: string;
  formStatus: SurveyFormStatus;
  publicSlug: string;
};

// Just what the campaign page needs to attach forms and build links.
export const listFormOptions = async (): Promise<CampaignFormOption[]> => {
  const nodes = await fetchAllPages<CampaignFormOption>(async (after) => {
    const data = await coreQuery<{
      surveyForms: { pageInfo: PageInfo; edges: { node: CampaignFormOption }[] };
    }>(
      `query SurveyFormOptions($first: Int, $after: String) {
        surveyForms(first: $first, after: $after, orderBy: [{ updatedAt: DescNullsLast }]) {
          pageInfo { endCursor hasNextPage }
          edges { node { id name formStatus publicSlug } }
        }
      }`,
      { first: PAGE, after },
    );

    return {
      nodes: data.surveyForms.edges.map((edge) => edge.node),
      pageInfo: data.surveyForms.pageInfo,
    };
  });

  return nodes.map((node) => ({ ...node, formStatus: node.formStatus ?? 'DRAFT' }));
};
