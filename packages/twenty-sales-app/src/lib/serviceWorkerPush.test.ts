import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Runs public/sw.js in a sandbox with a stubbed ServiceWorkerGlobalScope and
// fires synthetic push / notificationclick events at it, so the handlers the
// browser will run are the ones tested -- not a copy of them.

type Handler = (event: unknown) => void;

const loadWorker = ({ clients }: { clients: Array<Record<string, unknown>> }) => {
  const listeners = new Map<string, Handler>();
  const showNotification = vi.fn(async () => undefined);
  const openWindow = vi.fn(async () => null);
  const self = {
    addEventListener: (name: string, handler: Handler) => listeners.set(name, handler),
    skipWaiting: vi.fn(async () => undefined),
    location: { origin: 'https://crm.example.com' },
    registration: { showNotification },
    clients: {
      matchAll: vi.fn(async () => clients),
      claim: vi.fn(async () => undefined),
      openWindow,
    },
  };
  const context = vm.createContext({
    self,
    caches: { open: vi.fn(), keys: vi.fn(async () => []), match: vi.fn() },
    fetch: vi.fn(),
    Intl,
    URL,
    Date,
    console,
  });
  vm.runInContext(readFileSync(join(__dirname, '../../public/sw.js'), 'utf8'), context);

  const fire = async (name: string, event: Record<string, unknown>) => {
    let pending: Promise<unknown> = Promise.resolve();
    listeners.get(name)?.({
      ...event,
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise;
      },
    });
    await pending;
  };

  return { fire, showNotification, openWindow, clients };
};

const payload = {
  kind: 'reminder',
  taskId: 't1',
  title: 'تماس با داکتر نجیب',
  leadId: 'l1',
  leadName: 'شفاخانه نور',
  remindAt: '2026-09-12T04:30:00.000Z',
  url: '/sales/#/lead/l1',
};

describe('service worker push handlers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a system notification for a reminder payload with the lead and time in the body', async () => {
    const worker = loadWorker({ clients: [] });
    await worker.fire('push', { data: { json: () => payload } });

    expect(worker.showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = worker.showNotification.mock.calls[0] as unknown as [
      string,
      { body: string; tag: string; data: { url: string } },
    ];
    expect(title).toBe(payload.title);
    expect(options.tag).toBe('t1');
    expect(options.data.url).toBe('/sales/#/lead/l1');
    expect(options.body.startsWith('شفاخانه نور · ')).toBe(true);
    expect(options.body.length).toBeGreaterThan('شفاخانه نور · '.length);
  });

  it('stays quiet when the app is open and focused (the in-app bell already rang)', async () => {
    const worker = loadWorker({
      clients: [{ focused: true, visibilityState: 'visible', url: 'https://crm.example.com/sales/' }],
    });
    await worker.fire('push', { data: { json: () => payload } });
    expect(worker.showNotification).not.toHaveBeenCalled();
  });

  it('ignores payloads that are not reminders or not JSON', async () => {
    const worker = loadWorker({ clients: [] });
    await worker.fire('push', { data: { json: () => ({ kind: 'other' }) } });
    await worker.fire('push', {
      data: {
        json: () => {
          throw new Error('not json');
        },
      },
    });
    expect(worker.showNotification).not.toHaveBeenCalled();
  });

  it('on click, focuses an open app tab and routes it to the lead', async () => {
    const navigate = vi.fn(async () => null);
    const focus = vi.fn(async () => null);
    const worker = loadWorker({
      clients: [{ url: 'https://crm.example.com/sales/#/today', focus, navigate }],
    });
    await worker.fire('notificationclick', {
      notification: { close: vi.fn(), data: { url: '/sales/#/lead/l1' } },
    });
    expect(focus).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('https://crm.example.com/sales/#/lead/l1');
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it('on click with no open tab, opens the app at the lead', async () => {
    const worker = loadWorker({ clients: [] });
    const close = vi.fn();
    await worker.fire('notificationclick', {
      notification: { close, data: { url: '/sales/#/lead/l1' } },
    });
    expect(close).toHaveBeenCalled();
    expect(worker.openWindow).toHaveBeenCalledWith('https://crm.example.com/sales/#/lead/l1');
  });
});
