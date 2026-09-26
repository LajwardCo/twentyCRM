import { ApiError } from './client';

// Cursor paging for the survey screens that aggregate on the device. The
// record API silently returns fewer rows than `first` asks for, so every list
// follows cursors; a hard cap keeps a runaway list from freezing a phone, and
// hitting it is reported (never silent) so the screen can say its numbers are
// partial. Twenty's per-workspace throttle answers a burst of page requests
// with "Limit reached"; a short backoff rides that out instead of failing the
// whole screen.

export type PageInfo = { endCursor: string | null; hasNextPage: boolean };

export type Paged<TNode> = { items: TNode[]; truncated: boolean };

export const isRateLimitError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;

  const status = (error as { status?: unknown }).status;

  if (status === 429) return true;

  if (error instanceof ApiError) {
    return (
      error.code === 'LIMIT_REACHED' ||
      /\(429\)|limit reached|rate limit|too many requests/i.test(error.message)
    );
  }

  return false;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const RATE_LIMIT_DELAYS_MS = [1000, 2000, 4000];

export const withRateLimitRetry = async <TResult>(
  run: () => Promise<TResult>,
  { delays = RATE_LIMIT_DELAYS_MS, wait = sleep }: { delays?: number[]; wait?: (ms: number) => Promise<void> } = {},
): Promise<TResult> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!isRateLimitError(error) || attempt >= delays.length) throw error;

      await wait(delays[attempt]);
    }
  }
};

export const fetchAllPaged = async <TNode>(
  fetchPage: (after: string | null) => Promise<{ nodes: TNode[]; pageInfo: PageInfo }>,
  { limit = 5000, retry }: { limit?: number; retry?: Parameters<typeof withRateLimitRetry>[1] } = {},
): Promise<Paged<TNode>> => {
  const items: TNode[] = [];
  let after: string | null = null;

  for (;;) {
    const cursor: string | null = after;
    const page: { nodes: TNode[]; pageInfo: PageInfo } = await withRateLimitRetry(
      () => fetchPage(cursor),
      retry,
    );

    items.push(...page.nodes);

    const more = page.pageInfo.hasNextPage && page.pageInfo.endCursor !== null;

    if (!more) return { items, truncated: false };
    if (items.length >= limit) return { items: items.slice(0, limit), truncated: true };

    after = page.pageInfo.endCursor;
  }
};
