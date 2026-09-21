# Web Push for lead reminders — design

**Date:** 2026-09-12
**Packages:** `twenty-server` (new module), `twenty-sales-app`
**Branch:** `feat/sales-app-push-reminders`
**Builds on:** `2026-09-12-lead-reminders-design.md` (option A, live on prod)

## Goal

A reminder rings on the seller's phone or desktop at `remindAt` even when the
sales app is closed; tapping it opens the lead. Nothing about the in-app
behaviour changes, and a seller who never grants notification permission keeps
exactly today's experience.

## Server — `packages/twenty-server/src/modules/sales-crm/push-reminders/`

Same shape as `sales-crm/audit-log/`: a REST controller under `/rest/sales`,
a cron job on `cronQueue` fanning out one job per active workspace on
`workspaceQueue`, a service doing the work under a system auth context via
`GlobalWorkspaceOrmManager`.

### Storage (core schema, one fast instance command `2-15`)

`core."salesPushSubscription"`

| column | notes |
|---|---|
| `id` uuid pk | |
| `workspaceId` uuid | index |
| `workspaceMemberId` uuid | index; whose device this is |
| `endpoint` text unique | the push service URL; the natural identity of a subscription |
| `p256dh` text, `auth` text | client keys |
| `userAgent` text null | for support ("which phone is this?") |
| `createdAt`, `lastSeenAt` timestamptz | `lastSeenAt` bumped on every re-register |

`core."salesReminderDispatch"`

| column | notes |
|---|---|
| `workspaceId` uuid | |
| `taskId` uuid | |
| `remindAt` timestamptz | |
| `sentAt` timestamptz | |
| pk `(taskId, remindAt)` | a snooze/reschedule produces a new `remindAt`, so it re-arms without touching the task |

Both are server-owned: no metadata provisioning, no new task fields, no
SPA-side "pushed" bookkeeping.

### Endpoints (JWT + workspace guards, `NoPermissionGuard` — self-service)

- `GET /rest/sales/push/config` → `{ enabled: boolean, vapidPublicKey: string | null }`
- `POST /rest/sales/push/subscriptions` body `{ endpoint, keys: { p256dh, auth }, userAgent? }` → upsert by endpoint for the calling member; `{ id }`
- `DELETE /rest/sales/push/subscriptions` body `{ endpoint }` → removes it if it belongs to the caller; `{ deleted: boolean }`

### Sweep

`PushReminderSweepCronJob` — pattern `* * * * *`, registered by
`PushReminderSweepCronCommand` (`cron:sales:push-reminder-sweep`) which is
added to `cron:register:all` so the prod entrypoint picks it up. Skips
entirely when VAPID keys are not configured.

`PushReminderSweepJob` per workspace → `PushReminderSweepService.sweepWorkspace(workspaceId)`:

1. Repository `task` (bypass permissions): `status IN (TODO, IN_PROGRESS)`,
   `remindAt BETWEEN now − 24 h AND now`, `deletedAt IS NULL`, with
   `assigneeId`, `title`, `remindAt`, `reminderDismissedAt`, and
   `taskTargets.opportunity { id, name }`.
2. Drop tasks whose `reminderDismissedAt >= remindAt` (same rule as the SPA).
3. Drop `(taskId, remindAt)` pairs already in `salesReminderDispatch`.
4. For each remaining task, send to every subscription of `assigneeId` in
   that workspace; payload `{ title, body: "<lead name> · <time>", tag: taskId,
   url: "/sales/#/lead/<id>" | "/sales/#/task/<id>" }`.
5. Record the dispatch row **before** sending (a crash mid-send must not
   produce a storm of repeats next minute; a lost notification is the lesser
   evil). A push-service `404`/`410` deletes that subscription.
6. A workspace without `task.remindAt` (unprovisioned) throws a
   column/field error → logged at debug, treated as "nothing to do".

Window is 24 h so a server outage catches up on missed reminders but never
replays last week's.

### Configuration

`SALES_PUSH_VAPID_PUBLIC_KEY`, `SALES_PUSH_VAPID_PRIVATE_KEY`,
`SALES_PUSH_VAPID_SUBJECT` (`mailto:` or https URL). Read via
`TwentyConfigService`-free `process.env` like the audit retention config
(fork convention). All three present ⇒ enabled.

Dependency: `web-push` (+ `@types/web-push`) added to `twenty-server`.

## SPA

- `public/sw.js`: `push` handler → `self.registration.showNotification(title,
  { body, tag, data: { url }, icon, badge })`; skipped when a visible, focused
  client exists (the in-app store already rang). `notificationclick` →
  focus a client on `/sales/` and `navigate(url)`, else `openWindow(url)`.
  Cache `VERSION` bumped so the new worker installs.
- `src/api/push.ts`: `fetchPushConfig()`, `registerPushSubscription()`,
  `unregisterPushSubscription()` over `/rest/sales/push/*` with the app's
  bearer token (same helper the audit trail uses).
- `src/lib/push.ts`: `ensurePushSubscription()` — no-op unless
  `Notification.permission === 'granted'` and `PushManager` exists; loads
  config, subscribes (or reuses `getSubscription()`), POSTs; remembers the
  endpoint in `localStorage` to avoid re-POSTing each launch (re-POST when it
  changes or once a day to bump `lastSeenAt`). `disablePushSubscription()`
  for logout. `pushStatus()` → `'unsupported' | 'blocked' | 'off' | 'on'`.
- Hooks: `ReminderModal` calls `ensurePushSubscription()` right after
  `requestNotificationPermission()`; `App.tsx` calls it once after login;
  logout calls `disablePushSubscription()`; `RemindersSheet` shows a status
  row with an enable button when status is `'off'`.

## Failure handling

- Keys missing / endpoint 404 (old server) → SPA sees `enabled:false` or a
  4xx and stays in-app-only; no error surfaced.
- `web-push` send error other than 404/410 → logged, dispatch row kept (no
  retry storm), next reminder unaffected.
- Subscription belongs to another member on DELETE → `deleted:false`.

## Testing

- jest: `push-reminder-sweep.service.spec.ts` (window, dismissal rule,
  dispatch dedupe, unprovisioned skip, dead-subscription pruning) with
  repositories and `web-push` mocked; `push-subscription.service.spec.ts`
  (upsert by endpoint, ownership on delete).
- vitest: `lib/push.test.ts` (status matrix, no-op paths, endpoint caching).
- Browser: harness drives the SW `push` handler with a synthetic event and
  checks `showNotification` was called with the expected payload.

## Out of scope

Per-seller opt-out UI beyond the browser permission; reminders to anyone
other than the assignee; email fallback.
