import { useSyncExternalStore } from 'react';

import { type Task } from '../api/records';
import {
  completeReminder,
  dismissReminder,
  fetchMyReminders,
  snoozeReminder,
} from '../api/reminders';
import { invalidateCache } from './cache';
import { formatJalaliDateTime } from './jalali';
import {
  classifyReminders,
  snoozeTarget,
  taskLeadRef,
  type SnoozeKind,
} from './reminders';
import { navigate } from './router';

// One list of my reminders for the whole app: the shell bell, the Today card
// and the browser notification all read it, so they can never disagree about
// what has fired. Module-level rather than React state because polling must
// continue across route changes and the shell is the only long-lived mount.
//
// Two clocks: a network poll (60 s, only while the tab is visible -- a phone
// in a pocket should not burn the seller's data plan) and a local re-classify
// tick (30 s) so a reminder fires on the minute without waiting for the poll.

const POLL_MS = 60_000;
const TICK_MS = 30_000;

export type ReminderState = {
  tasks: Task[];
  fired: Task[];
  upcomingToday: Task[];
  loaded: boolean;
  lastError: string | null;
};

const EMPTY: ReminderState = {
  tasks: [],
  fired: [],
  upcomingToday: [],
  loaded: false,
  lastError: null,
};

let state: ReminderState = EMPTY;
let tasks: Task[] = [];
let assigneeId: string | null = null;
let pollTimer: number | null = null;
let tickTimer: number | null = null;
let loaded = false;
let lastError: string | null = null;
// Keyed by id + remindAt: a snoozed reminder has a new remindAt and so may
// notify again; the same remindAt seen twice (re-render, refetch) may not.
const notified = new Set<string>();
const listeners = new Set<() => void>();

const isVisible = () =>
  typeof document === 'undefined' || document.visibilityState === 'visible';

const notificationsGranted = (): boolean =>
  typeof Notification !== 'undefined' && Notification.permission === 'granted';

const notify = (task: Task) => {
  const lead = taskLeadRef(task);
  const body = [lead?.name, formatJalaliDateTime(task.remindAt ?? null)]
    .filter(Boolean)
    .join(' · ');
  try {
    const notification = new Notification(task.title, { body, tag: task.id });
    notification.onclick = () => {
      window.focus();
      navigate(lead?.id ? `/lead/${lead.id}` : `/task/${task.id}`);
      notification.close();
    };
  } catch {
    // Some browsers (mobile Chrome) throw on `new Notification` from a page
    // and want ServiceWorkerRegistration.showNotification instead; the
    // in-app bell still shows it.
  }
};

const publish = () => {
  const { fired, upcomingToday } = classifyReminders(tasks, new Date());
  state = { tasks, fired, upcomingToday, loaded, lastError };
  listeners.forEach((listener) => listener());
};

// seed: reminders already fired when the app opens get the badge, not a
// notification -- the seller is looking at the screen already.
const reclassify = (options: { seed?: boolean } = {}) => {
  const { fired } = classifyReminders(tasks, new Date());
  for (const task of fired) {
    const key = `${task.id}:${task.remindAt}`;
    if (notified.has(key)) continue;
    notified.add(key);
    if (!options.seed && notificationsGranted()) notify(task);
  }
  publish();
};

export const refreshReminders = async (): Promise<void> => {
  if (assigneeId === null) return;
  const forWhom = assigneeId;
  try {
    const fresh = await fetchMyReminders(forWhom);
    // A logout/login during the request must not write the old user's list.
    if (assigneeId !== forWhom) return;
    const firstLoad = !loaded;
    tasks = fresh;
    loaded = true;
    lastError = null;
    reclassify({ seed: firstLoad });
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    publish();
  }
};

const onVisibilityOrFocus = () => {
  if (isVisible()) void refreshReminders();
};

export const startReminderStore = (forAssigneeId: string): void => {
  if (assigneeId === forAssigneeId && pollTimer !== null) return;
  stopReminderStore();
  assigneeId = forAssigneeId;
  void refreshReminders();
  pollTimer = window.setInterval(() => {
    if (isVisible()) void refreshReminders();
  }, POLL_MS);
  tickTimer = window.setInterval(() => reclassify(), TICK_MS);
  document.addEventListener('visibilitychange', onVisibilityOrFocus);
  window.addEventListener('focus', onVisibilityOrFocus);
};

export const stopReminderStore = (): void => {
  if (pollTimer !== null) window.clearInterval(pollTimer);
  if (tickTimer !== null) window.clearInterval(tickTimer);
  pollTimer = null;
  tickTimer = null;
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibilityOrFocus);
    window.removeEventListener('focus', onVisibilityOrFocus);
  }
  assigneeId = null;
  tasks = [];
  loaded = false;
  lastError = null;
  notified.clear();
  state = EMPTY;
  listeners.forEach((listener) => listener());
};

// Optimistic actions: the row leaves (or moves) immediately, the server write
// follows, and a failure puts the previous list back with the error shown.
const applyOptimistic = async (
  next: Task[],
  write: () => Promise<void>,
): Promise<void> => {
  const previous = tasks;
  tasks = next;
  lastError = null;
  publish();
  try {
    await write();
    invalidateCache('today:');
    invalidateCache('calendar:');
  } catch (err) {
    tasks = previous;
    lastError = err instanceof Error ? err.message : String(err);
    publish();
  }
};

export const dismissReminderOptimistic = (taskId: string): Promise<void> => {
  const now = new Date().toISOString();
  return applyOptimistic(
    tasks.map((task) => (task.id === taskId ? { ...task, reminderDismissedAt: now } : task)),
    () => dismissReminder(taskId),
  );
};

export const snoozeReminderOptimistic = (taskId: string, kind: SnoozeKind): Promise<void> => {
  const remindAt = snoozeTarget(kind, new Date());
  return applyOptimistic(
    tasks.map((task) =>
      task.id === taskId ? { ...task, remindAt, reminderDismissedAt: null } : task,
    ),
    () => snoozeReminder(taskId, remindAt),
  );
};

export const completeReminderOptimistic = (taskId: string): Promise<void> =>
  applyOptimistic(
    tasks.filter((task) => task.id !== taskId),
    () => completeReminder(taskId),
  );

// Tied to a tap (first "save reminder"), never to page load: browsers punish
// unprompted permission requests and sellers dismiss them reflexively.
export const requestNotificationPermission = async (): Promise<void> => {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'default') return;
  try {
    await Notification.requestPermission();
  } catch {
    // Safari's callback-style API can reject; permission stays 'default'.
  }
};

export const getReminderState = (): ReminderState => state;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useReminders = (): ReminderState =>
  useSyncExternalStore(subscribe, getReminderState, getReminderState);
