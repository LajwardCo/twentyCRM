import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./client')>()),
  coreQuery: vi.fn(),
}));

import { ApiError, coreQuery } from './client';
import { fetchAllPaged, isRateLimitError, withRateLimitRetry } from './surveyPaging';
import {
  AmbiguousPrintCodeError,
  SurveyRequestError,
  countResponsesByForm,
  fetchVersionByPrintCode,
  linkVisitTaskTargets,
} from './surveys';
import { countCompletedByCampaign } from './surveyInsights';

const mockedCoreQuery = vi.mocked(coreQuery);
const noWait = { delays: [1, 1, 1], wait: async () => undefined };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('rate-limit retry', () => {
  it('should recognise the throttle in its different shapes', () => {
    expect(isRateLimitError(new ApiError('Server error (429)', 'HTTP_ERROR'))).toBe(true);
    expect(isRateLimitError(new ApiError('Limit reached (100 tokens per 60000 ms)', 'BAD_USER_INPUT'))).toBe(true);
    expect(isRateLimitError(new SurveyRequestError('x', 429, 'RATE_LIMITED', null))).toBe(true);
    expect(isRateLimitError(new ApiError('Forbidden', 'FORBIDDEN'))).toBe(false);
    expect(isRateLimitError(new Error('Limit reached'))).toBe(false);
  });

  it('should back off and retry a throttled request', async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ApiError('Server error (429)', 'HTTP_ERROR'))
      .mockResolvedValueOnce('ok');

    await expect(withRateLimitRetry(run, noWait)).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('should give up after the last delay and never retry other errors', async () => {
    const throttled = vi.fn(() => Promise.reject(new ApiError('Server error (429)', 'HTTP_ERROR')));

    await expect(withRateLimitRetry(throttled, noWait)).rejects.toThrow('429');
    expect(throttled).toHaveBeenCalledTimes(4);

    const broken = vi.fn(() => Promise.reject(new ApiError('Forbidden', 'FORBIDDEN')));

    await expect(withRateLimitRetry(broken, noWait)).rejects.toThrow('Forbidden');
    expect(broken).toHaveBeenCalledTimes(1);
  });
});

describe('paging', () => {
  const pages = (count: number, size: number) => (after: string | null) => {
    const index = after === null ? 0 : Number(after);

    return Promise.resolve({
      nodes: Array.from({ length: size }, (_, offset) => index * size + offset),
      pageInfo: { endCursor: String(index + 1), hasNextPage: index + 1 < count },
    });
  };

  it('should follow cursors to the end', async () => {
    await expect(fetchAllPaged(pages(3, 2))).resolves.toEqual({ items: [0, 1, 2, 3, 4, 5], truncated: false });
  });

  it('should say so when the cap cuts the list', async () => {
    const result = await fetchAllPaged(pages(10, 3), { limit: 5 });

    expect(result.items).toEqual([0, 1, 2, 3, 4]);
    expect(result.truncated).toBe(true);
  });

  it('should not report truncation when the last page lands exactly on the cap', async () => {
    await expect(fetchAllPaged(pages(2, 3), { limit: 6 })).resolves.toEqual({
      items: [0, 1, 2, 3, 4, 5],
      truncated: false,
    });
  });
});

describe('survey counts', () => {
  it('should size the groupBy limit to the forms and leave spam out', async () => {
    mockedCoreQuery.mockResolvedValueOnce({
      surveyResponsesGroupBy: [{ groupByDimensionValues: ['f60'], totalCount: 7 }],
    });

    const formIds = Array.from({ length: 60 }, (_, index) => `f${index + 1}`);
    const counts = await countResponsesByForm(formIds);
    const [query, variables] = mockedCoreQuery.mock.calls[0];

    expect(variables).toEqual({ formIds, limit: 60 });
    expect(query).toContain('limit: $limit');
    expect(query).toContain('reviewStatus: { in: [NEW, NEEDS_REVIEW, REVIEWED, ACTIONED] }');
    expect(counts.f60).toBe(7);
    expect(counts.f1).toBe(0);
  });

  it('should count campaigns with one groupBy instead of a request each', async () => {
    mockedCoreQuery.mockResolvedValueOnce({
      surveyResponsesGroupBy: [
        { groupByDimensionValues: ['c1'], totalCount: 3 },
        { groupByDimensionValues: ['c2'], totalCount: 5 },
      ],
    });

    await expect(countCompletedByCampaign(['c1', 'c2', 'c3'])).resolves.toEqual({ c1: 3, c2: 5, c3: 0 });
    expect(mockedCoreQuery).toHaveBeenCalledTimes(1);
    expect(mockedCoreQuery.mock.calls[0][1]).toEqual({ ids: ['c1', 'c2', 'c3'], limit: 3 });
  });
});

describe('print code lookup', () => {
  const version = (id: string, formId: string) => ({
    id,
    formId,
    versionNumber: 1,
    definition: {},
    publishedAt: '2026-09-01T00:00:00.000Z',
    changeNote: null,
    printCode: 'F1-v1',
    publishedBy: null,
  });

  it('should match the typed code literally', async () => {
    mockedCoreQuery.mockResolvedValueOnce({ surveyFormVersions: { edges: [{ node: version('v1', 'f1') }] } });

    const found = await fetchVersionByPrintCode(' F1_v1% ');

    expect(mockedCoreQuery.mock.calls[0][1]).toEqual({ code: 'F1\\_v1\\%' });
    expect(found?.id).toBe('v1');
  });

  it('should refuse a code that matches more than one form', async () => {
    mockedCoreQuery.mockResolvedValueOnce({
      surveyFormVersions: { edges: [{ node: version('v1', 'f1') }, { node: version('v9', 'f2') }] },
    });

    await expect(fetchVersionByPrintCode('F1-v1')).rejects.toBeInstanceOf(AmbiguousPrintCodeError);
  });
});

describe('visit task targets', () => {
  it('should only create the targets a retried task is missing', async () => {
    mockedCoreQuery
      .mockResolvedValueOnce({
        taskTargets: { edges: [{ node: { targetCompanyId: 'c1', targetOpportunityId: null } }] },
      })
      .mockResolvedValueOnce({ createTaskTarget: { id: 't2' } });

    await linkVisitTaskTargets('task-1', { companyId: 'c1', opportunityId: 'o1' });

    expect(mockedCoreQuery).toHaveBeenCalledTimes(2);
    expect(mockedCoreQuery.mock.calls[1][1]).toEqual({ data: { taskId: 'task-1', targetOpportunityId: 'o1' } });
  });

  it('should do nothing when every target is already there', async () => {
    mockedCoreQuery.mockResolvedValueOnce({
      taskTargets: { edges: [{ node: { targetCompanyId: 'c1', targetOpportunityId: null } }] },
    });

    await linkVisitTaskTargets('task-1', { companyId: 'c1', opportunityId: null });

    expect(mockedCoreQuery).toHaveBeenCalledTimes(1);
  });
});
