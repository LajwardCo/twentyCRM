// Every minute: a reminder set for 10:00 should ring at 10:00, not 10:04.
export const PUSH_REMINDER_SWEEP_CRON_PATTERN = '* * * * *';

// How far back a sweep looks. Long enough that a server outage catches up
// on what it missed, short enough that it never replays last week.
export const PUSH_REMINDER_LOOKBACK_MS = 24 * 60 * 60 * 1000;

// Push-service TTL: a reminder nobody's device could receive within an hour
// is stale; the in-app bell still shows it.
export const PUSH_REMINDER_TTL_SECONDS = 60 * 60;

export const PUSH_REMINDER_MAX_TASKS_PER_SWEEP = 500;
