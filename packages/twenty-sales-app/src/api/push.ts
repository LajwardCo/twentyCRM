import { loadTokens } from './client';

// Web Push registration against the fork's /rest/sales/push endpoints.
// Every call is best-effort: an older server without the endpoints (404) or
// one without VAPID keys (`enabled: false`) simply means in-app-only, which
// is exactly what the app did before push existed -- never an error.

export type PushConfig = {
  enabled: boolean;
  vapidPublicKey: string | null;
};

const CONFIG_URL = '/rest/sales/push/config';
const SUBSCRIPTIONS_URL = '/rest/sales/push/subscriptions';

const authHeaders = (): Record<string, string> | null => {
  const token = loadTokens()?.accessToken;
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
};

export const fetchPushConfig = async (): Promise<PushConfig> => {
  const headers = authHeaders();
  if (headers === null) return { enabled: false, vapidPublicKey: null };
  const response = await fetch(CONFIG_URL, { headers });
  if (!response.ok) return { enabled: false, vapidPublicKey: null };
  const body = (await response.json().catch(() => null)) as PushConfig | null;
  return body?.enabled && body.vapidPublicKey
    ? { enabled: true, vapidPublicKey: body.vapidPublicKey }
    : { enabled: false, vapidPublicKey: null };
};

export const registerPushSubscription = async (subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<boolean> => {
  const headers = authHeaders();
  if (headers === null) return false;
  const response = await fetch(SUBSCRIPTIONS_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...subscription, userAgent: navigator.userAgent }),
  });
  return response.ok;
};

export const unregisterPushSubscription = async (endpoint: string): Promise<boolean> => {
  const headers = authHeaders();
  if (headers === null) return false;
  const response = await fetch(SUBSCRIPTIONS_URL, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ endpoint }),
  });
  return response.ok;
};
