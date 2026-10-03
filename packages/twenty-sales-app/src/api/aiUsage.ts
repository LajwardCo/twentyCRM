import { loadTokens, renewSession } from './client';

// /rest/sales/ai-usage: the per-user AI token ledger kept by twenty-server
// (modules/sales-crm/ai-usage). The whole-team report is admin-only; `/me`
// is every member's own usage.

export type AiUsageTotals = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  chatTokens: number;
  otherTokens: number;
  costUsd: number;
};

export type AiUsageUserRow = AiUsageTotals & {
  // Null for spend no person triggered (workflow agents).
  userWorkspaceId: string | null;
  name: string;
  email: string;
  share: number;
  lastUsedAt: string | null;
};

export type AiUsageReport = {
  from: string;
  to: string;
  trackedSince: string | null;
  totals: AiUsageTotals & { users: number };
  users: AiUsageUserRow[];
  daily: { date: string; totalTokens: number }[];
};

export type AiUsageResult =
  | { status: 'ok'; report: AiUsageReport }
  | { status: 'forbidden' }
  // Server not deployed with the endpoint yet: the UI ships ahead of it.
  | { status: 'unsupported' }
  | { status: 'error'; message: string };

const request = (url: string): Promise<Response> =>
  fetch(url, {
    headers: { Authorization: `Bearer ${loadTokens()?.accessToken ?? ''}` },
  });

export const fetchAiUsage = async (
  scope: 'team' | 'me',
  period: { from: string; to: string },
): Promise<AiUsageResult> => {
  const query = new URLSearchParams(period).toString();
  const url = `/rest/sales/ai-usage${scope === 'me' ? '/me' : ''}?${query}`;

  try {
    let response = await request(url);
    if (response.status === 401 && (await renewSession())) {
      response = await request(url);
    }

    if (response.status === 403) return { status: 'forbidden' };
    if (response.status === 404) return { status: 'unsupported' };
    if (!response.ok) {
      return { status: 'error', message: `HTTP ${response.status}` };
    }

    return { status: 'ok', report: (await response.json()) as AiUsageReport };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
};
