// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = {
  fetchPushConfig: vi.fn(),
  registerPushSubscription: vi.fn(),
  unregisterPushSubscription: vi.fn(),
};
vi.mock('../api/push', () => ({
  fetchPushConfig: (...args: unknown[]) => api.fetchPushConfig(...args),
  registerPushSubscription: (...args: unknown[]) => api.registerPushSubscription(...args),
  unregisterPushSubscription: (...args: unknown[]) => api.unregisterPushSubscription(...args),
}));

const subscriptionJson = {
  endpoint: 'https://push.example/abc',
  keys: { p256dh: 'p', auth: 'a' },
};

const makeRegistration = (existing: object | null) => {
  const subscription = {
    toJSON: () => subscriptionJson,
    endpoint: subscriptionJson.endpoint,
    unsubscribe: vi.fn(async () => true),
  };
  const pushManager = {
    getSubscription: vi.fn(async () => (existing ? subscription : null)),
    subscribe: vi.fn(async () => subscription),
  };
  return { registration: { pushManager }, pushManager, subscription };
};

describe('push', () => {
  let push: typeof import('./push');
  let reg: ReturnType<typeof makeRegistration>;

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    Object.values(api).forEach((fn) => fn.mockReset());
    api.fetchPushConfig.mockResolvedValue({ enabled: true, vapidPublicKey: 'BAAA' });
    api.registerPushSubscription.mockResolvedValue(true);
    api.unregisterPushSubscription.mockResolvedValue(true);
    reg = makeRegistration(null);
    vi.stubGlobal('Notification', { permission: 'granted' });
    vi.stubGlobal('PushManager', function PushManager() {});
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve(reg.registration) },
    });
    push = await import('./push');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('subscribes and registers when permission is granted and the server has keys', async () => {
    expect(await push.ensurePushSubscription()).toBe('on');
    expect(reg.pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(api.registerPushSubscription).toHaveBeenCalledWith(subscriptionJson);
  });

  it('does not re-register the same endpoint on the next launch', async () => {
    await push.ensurePushSubscription();
    reg = makeRegistration(subscriptionJson);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve(reg.registration) },
    });
    expect(await push.ensurePushSubscription()).toBe('on');
    expect(api.registerPushSubscription).toHaveBeenCalledTimes(1);
    expect(reg.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('stays off without permission, and blocked when denied', async () => {
    vi.stubGlobal('Notification', { permission: 'default' });
    expect(await push.ensurePushSubscription()).toBe('off');
    vi.stubGlobal('Notification', { permission: 'denied' });
    expect(await push.ensurePushSubscription()).toBe('blocked');
    expect(api.fetchPushConfig).not.toHaveBeenCalled();
  });

  it('reports unsupported when the server has no keys, without touching the push manager', async () => {
    api.fetchPushConfig.mockResolvedValue({ enabled: false, vapidPublicKey: null });
    expect(await push.ensurePushSubscription()).toBe('unsupported');
    expect(reg.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('disablePushSubscription unsubscribes and tells the server', async () => {
    await push.ensurePushSubscription();
    reg = makeRegistration(subscriptionJson);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve(reg.registration) },
    });
    await push.disablePushSubscription();
    expect(reg.subscription.unsubscribe).toHaveBeenCalled();
    expect(api.unregisterPushSubscription).toHaveBeenCalledWith(subscriptionJson.endpoint);
    expect(localStorage.getItem('salesAppPushEndpoint')).toBeNull();
  });

  it('urlBase64ToUint8Array decodes a VAPID key', () => {
    const bytes = push.urlBase64ToUint8Array('AQID');
    expect([...bytes]).toEqual([1, 2, 3]);
  });
});
