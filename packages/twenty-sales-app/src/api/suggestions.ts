import {
  buildFocusPrompt,
  focusCacheKey,
  type DoneTaskWithTarget,
  type Suggestion,
} from '../lib/suggestions';
import { generateText } from './ai';
import { coreQuery } from './client';
import { fetchAllPages, PAGE_SIZE, type Connection } from './records';

// The done-task query in records.ts drops targets because reports only count
// tasks. Suggestions need "which lead was this on" to know when a lead was
// last touched, so this variant selects the target and nothing else.
const DONE_TASKS_WITH_TARGETS_QUERY = `query DoneTasksWithTargets($filter: TaskFilterInput, $limit: Int, $after: String) {
  tasks(
    filter: $filter
    first: $limit
    after: $after
    orderBy: [{ updatedAt: DescNullsLast }]
  ) {
    edges {
      node {
        id
        updatedAt
        taskTargets { edges { node { opportunity { id } } } }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

export const fetchMyDoneTasksWithTargets = async (
  assigneeId: string,
  sinceIso: string,
): Promise<DoneTaskWithTarget[]> => {
  const result = await fetchAllPages<DoneTaskWithTarget>(async (after) => {
    const data = await coreQuery<{ tasks: Connection<DoneTaskWithTarget> }>(
      DONE_TASKS_WITH_TARGETS_QUERY,
      {
        filter: {
          and: [
            { status: { eq: 'DONE' } },
            { updatedAt: { gte: sinceIso } },
            { assigneeId: { eq: assigneeId } },
          ],
        },
        limit: PAGE_SIZE,
        after,
      },
    );
    return data.tasks;
  });
  return result.items;
};

// ---------- focus note ----------

// One AI call per seller per day. localStorage may be missing or throw
// (private mode, quota); either way it is just a cache miss.
const readCache = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeCache = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // nothing to do: next visit regenerates
  }
};

export const fetchFocusNote = async (
  memberId: string,
  suggestions: Suggestion[],
  options: { now?: Date; force?: boolean } = {},
): Promise<string | null> => {
  if (suggestions.length === 0) return null;

  const key = focusCacheKey(memberId, options.now ?? new Date());
  if (!options.force) {
    const cached = readCache(key);
    if (cached !== null && cached !== '') return cached;
  }

  const { systemPrompt, userPrompt } = buildFocusPrompt(suggestions);
  const note = (await generateText(systemPrompt, userPrompt)).trim();
  writeCache(key, note);
  return note;
};
