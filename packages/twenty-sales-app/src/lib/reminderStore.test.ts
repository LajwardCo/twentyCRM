// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type Task } from '../api/records';

const api = {
  fetchMyReminders: vi.fn(),
  dismissReminder: vi.fn(),
  snoozeReminder: vi.fn(),
  completeReminder: vi.fn(),
};
vi.mock('../api/reminders', () => ({
  fetchMyReminders: (...args: unknown[]) => api.fetchMyReminders(...args),
  dismissReminder: (...args: unknown[]) => api.dismissReminder(...args),
  snoozeReminder: (...args: unknown[]) => api.snoozeReminder(...args),
  completeReminder: (...args: unknown[]) => api.completeReminder(...args),
}));
const navigate = vi.fn();
vi.mock('./router', () => ({ navigate: (...args: unknown[]) => navigate(...args) }));
vi.mock('./cache', () => ({ invalidateCache: vi.fn() }));

const task = (id: string, remindAt: string, over: Partial<Task> = {}): Task => ({
  id,
  title: `task ${id}`,
  status: 'TODO',
  taskType: 'REMINDER',
  dueAt: remindAt,
  remindAt,
  reminderDismissedAt: null,
  createdAt: '2026-09-12T00:00:00.000Z',
  bodyV2: null,
  taskTargets: {
    edges: [{ node: { opportunity: { id: 'lead-1', name: 'Lead One' }, company: null } }],
  },
  ...over,
});

// A minimal Notification stand-in: the constructor records instances, and
// `permission` is whatever the test sets.
class FakeNotification {
  static permission: NotificationPermission = 'granted';
  static instances: FakeNotification[] = [];
  static requestPermission = vi.fn(async () => FakeNotification.permission);
  onclick: (() => void) | null = null;
  constructor(
    public title: string,
    public options?: NotificationOptions,
  ) {
    FakeNotification.instances.push(this);
  }
  close() {}
}

describe('reminderStore', () => {
  const NOW = new Date(2026, 8, 12, 9, 0, 0);
  let store: typeof import('./reminderStore');

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    Object.values(api).forEach((fn) => fn.mockReset());
    api.dismissReminder.mockResolvedValue(undefined);
    api.snoozeReminder.mockResolvedValue(undefined);
    api.completeReminder.mockResolvedValue(undefined);
    FakeNotification.instances = [];
    FakeNotification.permission = 'granted';
    vi.stubGlobal('Notification', FakeNotification);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    vi.resetModules();
    store = await import('./reminderStore');
  });

  afterEach(() => {
    store.stopReminderStore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('fetches at start and again after the poll interval', async () => {
    api.fetchMyReminders.mockResolvedValue([]);
    store.startReminderStore('me');
    await vi.advanceTimersByTimeAsync(0);
    expect(api.fetchMyReminders).toHaveBeenCalledTimes(1);
    expect(api.fetchMyReminders).toHaveBeenCalledWith('me');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.fetchMyReminders).toHaveBeenCalledTimes(2);
  });

  it('moves a reminder from upcoming to fired on the clock without a refetch', async () => {
    const soon = new Date(NOW.getTime() + 20_000).toISOString();
    api.fetchMyReminders.mockResolvedValue([task('a', soon)]);
    store.startReminderStore('me');
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getReminderState().upcomingToday.map((t) => t.id)).toEqual(['a']);
    expect(store.getReminderState().fired).toEqual([]);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(store.getReminderState().fired.map((t) => t.id)).toEqual(['a']);
    expect(api.fetchMyReminders).toHaveBeenCalledTimes(1);
  });

  it('shows exactly one browser notification per reminder and opens the lead on click', async () => {
    const soon = new Date(NOW.getTime() + 20_000).toISOString();
    api.fetchMyReminders.mockResolvedValue([task('a', soon)]);
    store.startReminderStore('me');
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeNotification.instances).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0].options?.tag).toBe('a');

    // further ticks and a refetch must not repeat it
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeNotification.instances).toHaveLength(1);

    FakeNotification.instances[0].onclick?.();
    expect(navigate).toHaveBeenCalledWith('/lead/lead-1');
  });

  it('does not notify when permission is not granted or a reminder was already fired at load', async () => {
    FakeNotification.permission = 'default';
    const past = new Date(NOW.getTime() - 20_000).toISOString();
    api.fetchMyReminders.mockResolvedValue([task('old', past)]);
    store.startReminderStore('me');
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getReminderState().fired.map((t) => t.id)).toEqual(['old']);
    expect(FakeNotification.instances).toHaveLength(0);
  });

  it('dismiss removes the row at once and restores it when the server refuses', async () => {
    const past = new Date(NOW.getTime() - 20_000).toISOString();
    api.fetchMyReminders.mockResolvedValue([task('a', past)]);
    api.dismissReminder.mockRejectedValueOnce(new Error('nope'));
    store.startReminderStore('me');
    await vi.advanceTimersByTimeAsync(0);

    const pending = store.dismissReminderOptimistic('a');
    expect(store.getReminderState().fired).toEqual([]);
    await pending;
    expect(store.getReminderState().fired.map((t) => t.id)).toEqual(['a']);
    expect(store.getReminderState().lastError).toBe('nope');
  });

  it('snooze moves the reminder to the new time locally and on the server', async () => {
    const past = new Date(NOW.getTime() - 20_000).toISOString();
    api.fetchMyReminders.mockResolvedValue([task('a', past)]);
    store.startReminderStore('me');
    await vi.advanceTimersByTimeAsync(0);

    await store.snoozeReminderOptimistic('a', 'hour');
    const expected = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
    expect(api.snoozeReminder).toHaveBeenCalledWith('a', expected);
    expect(store.getReminderState().fired).toEqual([]);
    expect(store.getReminderState().upcomingToday.map((t) => t.remindAt)).toEqual([expected]);
  });

  it('complete drops the task and calls the API', async () => {
    const past = new Date(NOW.getTime() - 20_000).toISOString();
    api.fetchMyReminders.mockResolvedValue([task('a', past)]);
    store.startReminderStore('me');
    await vi.advanceTimersByTimeAsync(0);

    await store.completeReminderOptimistic('a');
    expect(api.completeReminder).toHaveBeenCalledWith('a');
    expect(store.getReminderState().fired).toEqual([]);
  });

  it('stops polling after stopReminderStore', async () => {
    api.fetchMyReminders.mockResolvedValue([]);
    store.startReminderStore('me');
    await vi.advanceTimersByTimeAsync(0);
    store.stopReminderStore();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(api.fetchMyReminders).toHaveBeenCalledTimes(1);
  });
});
