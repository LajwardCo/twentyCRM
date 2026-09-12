import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  coreQuery: vi.fn(),
  metadataQuery: vi.fn(),
}));
vi.mock('./ai', () => ({
  generateText: vi.fn(),
}));

import { generateText } from './ai';
import { coreQuery } from './client';
import { fetchFocusNote, fetchMyDoneTasksWithTargets } from './suggestions';
import { type Suggestion } from '../lib/suggestions';

const mockedCoreQuery = vi.mocked(coreQuery);
const mockedGenerateText = vi.mocked(generateText);

const NOW = new Date(2026, 8, 12, 12, 0, 0);

const suggestion = (leadId: string): Suggestion => ({
  leadId,
  leadName: `Lead ${leadId}`,
  stage: 'FOLLOWING_UP',
  temperature: 'HOT',
  kind: 'call',
  score: 40,
  why: 'لید داغ بدون قدم بعدی',
  href: `/lead/${leadId}`,
  amountMicros: null,
  currencyCode: null,
  stageDays: 2,
  contactDays: null,
});

// vitest runs in node: give the module the same storage surface the browser has.
const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.clearAllMocks();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    },
  });
});
afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('fetchMyDoneTasksWithTargets', () => {
  it('asks for done tasks of one assignee since the window start, with their lead', async () => {
    mockedCoreQuery.mockResolvedValueOnce({
      tasks: {
        edges: [
          {
            node: {
              id: 't1',
              updatedAt: '2026-09-10T00:00:00.000Z',
              taskTargets: { edges: [{ node: { opportunity: { id: 'lead-1' } } }] },
            },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    const tasks = await fetchMyDoneTasksWithTargets('member-1', '2026-08-13T00:00:00.000Z');

    expect(tasks).toHaveLength(1);
    expect(tasks[0].taskTargets?.edges[0].node.opportunity?.id).toBe('lead-1');
    const [query, variables] = mockedCoreQuery.mock.calls[0];
    expect(query).toContain('taskTargets');
    expect(variables).toMatchObject({
      filter: {
        and: [
          { status: { eq: 'DONE' } },
          { updatedAt: { gte: '2026-08-13T00:00:00.000Z' } },
          { assigneeId: { eq: 'member-1' } },
        ],
      },
    });
  });
});

describe('fetchFocusNote', () => {
  it('returns nothing and never calls the AI when there is nothing to suggest', async () => {
    expect(await fetchFocusNote('member-1', [], { now: NOW })).toBeNull();
    expect(mockedGenerateText).not.toHaveBeenCalled();
  });

  it('generates once and serves the same day from cache', async () => {
    mockedGenerateText.mockResolvedValueOnce('اول با Lead a تماس بگیر.');

    const first = await fetchFocusNote('member-1', [suggestion('a')], { now: NOW });
    const second = await fetchFocusNote('member-1', [suggestion('a')], { now: NOW });

    expect(first).toBe('اول با Lead a تماس بگیر.');
    expect(second).toBe(first);
    expect(mockedGenerateText).toHaveBeenCalledTimes(1);
  });

  it('regenerates when forced and replaces the cached note', async () => {
    mockedGenerateText
      .mockResolvedValueOnce('نسخه اول')
      .mockResolvedValueOnce('نسخه دوم');

    await fetchFocusNote('member-1', [suggestion('a')], { now: NOW });
    const forced = await fetchFocusNote('member-1', [suggestion('a')], { now: NOW, force: true });
    const again = await fetchFocusNote('member-1', [suggestion('a')], { now: NOW });

    expect(forced).toBe('نسخه دوم');
    expect(again).toBe('نسخه دوم');
    expect(mockedGenerateText).toHaveBeenCalledTimes(2);
  });

  it('does not cache across members or days', async () => {
    mockedGenerateText.mockResolvedValue('note');
    await fetchFocusNote('member-1', [suggestion('a')], { now: NOW });
    await fetchFocusNote('member-2', [suggestion('a')], { now: NOW });
    await fetchFocusNote('member-1', [suggestion('a')], {
      now: new Date(NOW.getTime() + 86_400_000),
    });
    expect(mockedGenerateText).toHaveBeenCalledTimes(3);
  });

  it('lets AI failures propagate without poisoning the cache', async () => {
    mockedGenerateText
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce('later');

    await expect(
      fetchFocusNote('member-1', [suggestion('a')], { now: NOW }),
    ).rejects.toThrow('rate limited');
    expect(await fetchFocusNote('member-1', [suggestion('a')], { now: NOW })).toBe('later');
  });
});
