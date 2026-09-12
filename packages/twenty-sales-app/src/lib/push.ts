import {
  fetchPushConfig,
  registerPushSubscription,
  unregisterPushSubscription,
} from '../api/push';

// Background reminders: the browser's push subscription for this device,
// registered with the server so the every-minute sweep can ring it when the
// app is closed. The in-app store keeps working regardless; this only adds
// the closed-app case.
//
//   unsupported  no service worker / PushManager, or the server has no keys
//   blocked      the seller denied notification permission
//   off          permission not asked yet (the "enable" button case)
//   on           subscribed and registered
export type PushStatus = 'unsupported' | 'blocked' | 'off' | 'on';

const ENDPOINT_KEY = 'salesAppPushEndpoint';
const REGISTERED_AT_KEY = 'salesAppPushRegisteredAt';
// Re-register at least daily so the server's lastSeenAt stays meaningful and
// a rotated key never goes unnoticed for long.
const REREGISTER_MS = 24 * 60 * 60 * 1000;

// Returns a view over a plain ArrayBuffer: PushManager.subscribe wants a
// BufferSource, and TypeScript's Uint8Array<ArrayBufferLike> is not one.
export const urlBase64ToUint8Array = (base64String: string): Uint8Array<ArrayBuffer> => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
};

const hasPushApi = (): boolean =>
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  typeof PushManager !== 'undefined' &&
  typeof Notification !== 'undefined';

const readStored = (): { endpoint: string | null; registeredAt: number } => {
  try {
    return {
      endpoint: localStorage.getItem(ENDPOINT_KEY),
      registeredAt: Number(localStorage.getItem(REGISTERED_AT_KEY) ?? 0),
    };
  } catch {
    return { endpoint: null, registeredAt: 0 };
  }
};

const writeStored = (endpoint: string | null) => {
  try {
    if (endpoint === null) {
      localStorage.removeItem(ENDPOINT_KEY);
      localStorage.removeItem(REGISTERED_AT_KEY);
    } else {
      localStorage.setItem(ENDPOINT_KEY, endpoint);
      localStorage.setItem(REGISTERED_AT_KEY, String(Date.now()));
    }
  } catch {
    // private mode: we just re-register next launch
  }
};

export const pushPermissionStatus = (): PushStatus => {
  if (!hasPushApi()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission === 'default') return 'off';
  return 'on';
};

// Idempotent and cheap to call on every launch: with permission granted it
// reuses the existing subscription and only talks to the server when the
// endpoint is new or a day old.
export const ensurePushSubscription = async (): Promise<PushStatus> => {
  const permissionStatus = pushPermissionStatus();
  if (permissionStatus !== 'on') return permissionStatus;

  try {
    const config = await fetchPushConfig();
    if (!config.enabled || config.vapidPublicKey === null) return 'unsupported';

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey),
      }));

    const json = subscription.toJSON();
    const endpoint = json.endpoint ?? subscription.endpoint;
    const keys = json.keys;
    if (!endpoint || !keys?.p256dh || !keys.auth) return 'unsupported';

    const stored = readStored();
    const fresh =
      stored.endpoint === endpoint && Date.now() - stored.registeredAt < REREGISTER_MS;
    if (!fresh) {
      const ok = await registerPushSubscription({
        endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
      });
      if (!ok) return 'unsupported';
      writeStored(endpoint);
    }
    return 'on';
  } catch {
    // A push service that refuses (some corporate networks, Brave's shields)
    // is not worth an error the seller cannot act on.
    return 'unsupported';
  }
};

// Logout: this device must stop receiving the previous user's reminders.
export const disablePushSubscription = async (): Promise<void> => {
  writeStored(null);
  if (!hasPushApi()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription === null) return;
    await unregisterPushSubscription(subscription.endpoint);
    await subscription.unsubscribe();
  } catch {
    // best effort; the server also drops the endpoint once the push service
    // reports it gone
  }
};
