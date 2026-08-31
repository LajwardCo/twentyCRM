# Call Companion (P1) — design

Date: 2026-08-31
Branch: `feat/call-companion`

Sales agents are required to record their client calls and upload the audio to
the CRM by hand, and to log each call as a Task on the lead. Both steps are
manual, so both drift: recordings go missing, and the CRM's picture of what an
agent actually did on a given day is whatever that agent remembered to type.

This spec covers **P1 — Call Companion**: an automatic, trustworthy record of
every *work* call an agent makes or takes — who, which lead, when, how long,
and, where the device permits, the audio — with no manual upload step.

## Scope and decomposition

The original request spans four subsystems. Specced as one thing it would be
unexecutable, so it is split into three sub-projects, each shippable alone:

- **P1 — Call Companion** (this spec). Capture and activity truth.
- **P2 — Post-call task capture.** The prompt after each call, one-tap
  "log as done + result" onto the lead, reminders and notifications. Consumes
  the call-ended event P1 emits.
- **P3 — AI call intelligence.** Transcription, summary, drafted task text fed
  into P2's prompt. Deliberately last: it is the riskiest piece and nothing
  else may depend on it.

Build order is P1 → P2 → P3. P1 delivers value standing alone: real activity
tracking, and the manual upload chore removed.

## Platform reality

These constraints are not implementation details; they define what the product
can promise. They were established before the design and the design is shaped
around them.

| Channel | Automatic capture | Recording |
| --- | --- | --- |
| Direct call, Android | Yes — system call log | Where the OEM's built-in recorder writes files to disk |
| Direct call, iOS | No — no call-log access exists | **Impossible.** iOS exposes no call audio to any app |
| WhatsApp / Telegram | Best-effort — see below | **Impossible.** VoIP audio is not capturable |

Three consequences carried through the whole design:

1. **Recording is a capability tier, not a promise.** Agents are on their own
   devices with no fleet mandate, so the app must light up per device and
   degrade without blocking. A call that cannot be recorded is still logged.
2. **WhatsApp and Telegram calls never appear in the system call log** — they
   are not telephony. The only legitimate detection is a
   `NotificationListenerService` reading the ongoing-call notification, which
   yields the app, the contact's *display name*, and start/end times, but **no
   phone number**. Those calls therefore match to a lead by name, weakly, and
   are a best-effort tier rather than a guarantee.
3. **Google Play will very likely reject this app.** `READ_CALL_LOG` is a
   restricted permission granted only to apps whose core function is dialer or
   caller-ID; a CRM app requesting it is rejected. Distribution is a sideloaded
   APK or a Managed Google Play private channel. This is a rollout constraint
   to plan for, not a bug to fix later.

## Capture scope: whose calls, and which

Agents use personal phones, so personal calls sit in the same call log.

**Only calls to or from a number already known to the CRM are captured.** The
match is performed **on the device** against a synced phone index; unmatched
calls are never transmitted. This is what makes the rule technically
enforceable rather than a policy promise — the server never receives an
agent's personal call log, because it never receives their call log at all.

An unmatched number raises a local prompt with three choices: *add as a new
contact*, *add as another number on an existing contact* (linked to its lead),
or *not a work call*. The choice is remembered per number and never asked
again. First-contact calls therefore become CRM data instead of being lost,
without widening what the app collects.

## Components

### Mobile — `usystems_sales_mobile`

A new Expo app on React Native 0.81, matching the house stack already used by
`usystems_connect_mobile` and `usystems_support_mobile`.

The existing sales UI is **not** rebuilt. A `WebView` renders
`https://crm.hamagan.com/sales/` — the app is served under `/sales/` on the
same origin as the Twenty API (see `packages/twenty-sales-app/vite.config.ts`),
so authentication and API calls work inside the WebView with no CORS layer and
no second session. It is already mobile-first (`MobileNav`, `Dock`,
`MobileMenu`) and already PWA-installable.

Native code covers only what a browser cannot do:

- **CallLogObserver** (Android) — `READ_PHONE_STATE` + `READ_CALL_LOG`.
  Detects call end, reads the resulting log entry: number, direction,
  duration, timestamp.
- **RecordingWatcher** (Android) — the agent grants the OEM recorder's folder
  **once** via `ACTION_OPEN_DOCUMENT_TREE` (Storage Access Framework). New
  files appearing in that tree are matched to the just-ended call by timestamp
  and duration.
- **VoipCallObserver** (Android) — `NotificationListenerService` for
  WhatsApp/Telegram. Yields display name and start/end times only.
- **UploadQueue** — a persistent, resumable queue that survives reboot,
  app kill and offline periods.
- **Bridge** — `postMessage` in both directions between the WebView and native,
  so the web UI can request a sync, show capture state, and (in P2) receive
  the call-ended event.
- **iOS** — no call log, no recording. The in-app Call button opens a `tel:`
  link, measures away-time as an **estimated** duration, and confirms on
  return. Audio capture is not offered, because it does not exist.

### Server — `packages/twenty-server/src/modules/sales-crm/`

Extends the module already established in Phase 3/4, following the same
pattern (provisioning script for metadata, real server code only where no
no-code path exists).

- `CallActivity` custom object, provisioned by
  `tools/sales-crm/provision-call-activity.mjs`.
- `POST /rest/sales/call-activities` — ingest: validate, resolve, dedupe.
- Audio reuses the existing upload path
  (`uploadFilesFieldFile` → `createAttachment`, see
  `packages/twenty-sales-app/src/api/attachments.ts`) against the
  `CallActivity` record.
- An aggregation resolver for per-agent, per-day activity reporting.

### Storage

The deployment currently runs Twenty's **local** storage driver — attachments
land on the droplet disk, on the same volume as the database
(`packages/twenty-docker/docker-compose.hamagan.yml` sets no S3 variables).
Call audio at roughly 20 agents × 15 calls/day × 4 minutes is on the order of
0.5 GB/day, ~15 GB/month, and would fill that volume within months.

P1 therefore switches the storage driver to **S3 against DigitalOcean Spaces**,
with a bucket lifecycle rule expiring audio objects after **180 days**. That
window is a starting default, chosen to comfortably outlast a sales cycle while
capping storage at roughly 90 GB; it is a single configurable value, not a
number baked into code.
The `CallActivity` record and (later) its transcript stay in the database
permanently; only the audio expires.

## Data model — `CallActivity`

| Field | Type | Notes |
| --- | --- | --- |
| `direction` | SELECT | `INBOUND` / `OUTBOUND` / `MISSED` |
| `channel` | SELECT | `PHONE` / `WHATSAPP` / `TELEGRAM` |
| `phoneNumber` | TEXT | normalized E.164; empty for VoIP calls |
| `contactName` | TEXT | display name, the only identifier VoIP calls carry |
| `startedAt` | DATE_TIME | |
| `durationSeconds` | NUMBER | |
| `durationSource` | SELECT | `CALL_LOG` / `ESTIMATED` / `MANUAL` |
| `agent` | RELATION → WorkspaceMember | the logged-in seller |
| `person` | RELATION → Person | resolved contact |
| `opportunity` | RELATION → Opportunity | the lead |
| `recordingStatus` | SELECT | `NONE` / `PENDING` / `UPLOADED` / `UNAVAILABLE` |
| `deviceCallId` | TEXT | idempotency key |
| `task` | RELATION → Task | left null by P1; populated by P2 |

`durationSource` exists so an iOS away-time estimate is never displayed as a
measured duration. Reporting must either exclude estimates or label them; it
must not silently mix them with call-log durations.

Deduplication is on `(agent, deviceCallId)`. A reinstall, a re-sync, or a
retried upload cannot double-count a call — which matters, because these
numbers are used to evaluate people.

## Number → lead resolution

The device holds a synced **phone index**: every `Person.phones` value plus any
additional numbers, normalized to a single canonical form. Matching runs
locally; only matched calls are transmitted.

Normalization must produce identical output on device, in the PWA, and on the
server, across Afghan number formats (`0790…`, `+93790…`, `93790…`).
`packages/twenty-sales-app/src/api/records.ts:721` already contains a
`normalizePhone` doing a version of this. It is **extracted into
`twenty-shared`** and consumed by all three, rather than reimplemented — a
second implementation would drift, and a drifted phone normalizer silently
stops matching calls to leads, which is the failure mode hardest to notice.

The index syncs incrementally and lives in app-private storage, which the OS
sandboxes from other apps. It is deliberately not described as encrypted at
rest: it contains only contacts the signed-in agent can already read in the
CRM, so encrypting it would buy nothing while implying a protection the design
does not actually provide.

WhatsApp/Telegram calls have no number and match on `contactName` against
person names. Ambiguous or missing matches are left unresolved for the agent to
confirm; they are never guessed.

## Reporting

Per agent, per day: calls made and received, total talk minutes, unique leads
touched. Aggregation is a server-side resolver feeding the existing
`ReportsView` and `DailyReportView` in the sales app — computed server-side, not
summed in the client, so the numbers are consistent for every viewer and cheap
on mobile data.

## Error handling

The governing rule is **degrade, never block**. A call that cannot be recorded
is still a call that happened, and losing the log because the audio failed
would be worse than having no audio.

- No recorder folder granted, folder empty, or iOS → `recordingStatus:
  UNAVAILABLE`; the call is logged regardless.
- Offline → the queue persists across restarts and drains when connectivity
  returns. Nothing is dropped.
- Duplicate submission → idempotent on `deviceCallId`; the server returns the
  existing record rather than creating a second one.
- Permission revoked (call log, notification access, folder grant) → a visible
  banner in the app and capture pauses. It never fails silently, because
  silent failure here means an agent's day looks empty and nobody knows why.
- Recording-to-call match ambiguous (two calls close together, unexpected
  filename) → mark `PENDING` and ask the agent. Never guess which call an audio
  file belongs to.
- Unknown number → local prompt only; nothing leaves the device until the
  agent classifies it.

## Testing

Pure logic is unit tested on both sides:

- Phone normalization — Afghan formats, leading zero, country code with and
  without `+`, spaces and Persian/Arabic digits. Shared implementation, so one
  test suite covers device, PWA and server.
- Recording-to-call matching — a fixture set of **real** OEM recording filename
  patterns (Xiaomi, Samsung, Realme), plus the ambiguous cases: back-to-back
  calls, clock skew, a file written after a delay.
- Upload queue state machine — offline, retry, reboot, duplicate.

Server: ingest endpoint tests covering a matched number, an unknown number, a
duplicate `deviceCallId`, and a VoIP call with no number.

The device matrix — which OEMs record, where they write, and what happens when
Android revokes a permission — **cannot be automated** and requires real
handsets. This is stated explicitly so it is planned for rather than
discovered.

## Out of scope for P1

- AI, transcription and summarization (P3).
- The post-call task prompt, reminders and notifications (P2). P1 emits the
  call-ended event; P2 consumes it.
- Automatic recording of WhatsApp/Telegram calls — not possible on either
  platform.
- Any native rewrite of the sales UI. The WebView renders the existing app.
