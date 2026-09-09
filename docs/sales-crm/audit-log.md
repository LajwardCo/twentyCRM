# Sales app audit log

Records what every user does in the sales app (`packages/twenty-sales-app`) —
which screens they open, which customer records they read, what they change,
what they copy or print, and the screen-capture signals the browser lets us
see. Admins read it at `#/audit`.

This document is mostly about **what this log cannot see**, because a security
control whose limits are not written down gets trusted for things it does not
do.

---

## What is guaranteed, and what is not

| Property | Status |
|---|---|
| The actor on a row is who the token says they are | **Guaranteed** — stamped server-side, the client's claim is discarded |
| The IP address on a row | **Guaranteed** — read from the proxy header, client never supplies it |
| Row timestamp (`createdAt`) | **Guaranteed** — server clock |
| `occurredAt` | Client's claim. Kept for ordering; more than 24h out is replaced by the server's clock, and a smaller gap is shown as "clock skew" in the UI |
| Non-admins cannot read the log | **Guaranteed** — explicit per-role deny beats `canReadAllObjectRecords` |
| Nobody can delete rows through the API | **Guaranteed** — no role holds soft-delete or destroy on the object |
| A user cannot file events as someone else | **Guaranteed** |
| Every action a user takes is recorded | **NO.** See below |
| A screenshot is recorded | **NO — not on phones, and unreliably on desktop.** See below |

## The honest limits

**1. A determined user can suppress their own events.**
The log is produced by JavaScript running on the user's device. Someone with
developer tools open can block the network request, clear the buffer, or run
the app with the audit disabled. Nothing a browser app does can prevent this.
What it can do is make the gap visible: session start/end events, a per-tab
session id, `audit.buffer_overflow` rows, and the clock-skew flag all mean a
suppressed stretch tends to leave a shape behind. Treat the log as *strong
evidence of what happened*, not as *proof of everything that happened*.

If tamper-proof coverage of record reads is required, it has to be built in the
server's query pipeline, not here.

**2. Phone screenshots are invisible. Completely.**
iOS and Android give a web page no signal at all when the user screenshots.
There is no API, no event, and no reliable heuristic. Since the sales team
works on phones, this is the normal case, not the edge case.

What we do instead is make captures *attributable*: every screen that shows
customer contact details, money, or the log itself is covered by a tiled
watermark carrying the viewer's name, email, and the time
(`components/AuditWatermark.tsx`). It re-stamps every minute. A leaked
screenshot therefore names who took it and roughly when — which is the outcome
detection was wanted for.

**The watermark is invisible to the viewer.** It shifts each pixel it covers
by 2 of 255 steps (0.8%, roughly 0.7 of a CIELAB L\* step on white — under the
just-noticeable difference for a flat field), which no one sees on a phone but
which is an exact, recoverable difference in the captured file. The glyphs are
large and heavy on purpose: fat strokes are low-frequency, and low frequencies
are what a lossy re-encode keeps. `mix-blend-mode: difference` makes
that shift unconditional — it is present over a white card, a black bar and a
coloured button alike, in either theme — and the overlay is portalled into
`<body>` because blending only works against the backdrop of its own stacking
context: measured in Chromium, the same markup under an ancestor with `opacity`
paints the text at 253/255 instead, i.e. fully visible.

To read a mark back off a leaked image, open `tools/sales-crm/reveal-watermark.html`
(a local, offline page — nothing is uploaded, and it is deliberately not
deployed with the app) and drop the image in; it subtracts a blurred copy to
strip the interface and amplifies what is left. In an ordinary image editor the
equivalent is a Levels adjustment with the input range pulled to about 246–255
over a flat area.

`tools/sales-crm/verify-watermark.mjs` measures this — run it from the repo root
after any change to the overlay. It renders the shipped CSS over white, black,
light and dark card, accent-blue and ink-coloured backgrounds and diffs against
the same page without the overlay: max shift 2/255 on every one, ~8% of pixels
carrying it. It also renders the trapped-ancestor case, which shows 253/255.

Recovery was checked end to end: a 390×844 capture reveals cleanly as a PNG,
and still reads after a JPEG q80 re-encode (what a messaging app does to a
forwarded screenshot) with photo mode on and the gain around 60.

Trade-off, stated plainly: at 0.8% the mark survives every *digital* copy of
the pixels, but not a photo of the screen taken with another camera, where
sensor noise is larger than the mark. The old, visible-at-5% overlay was the
reverse trade.

**3. Desktop screenshot detection is partial.**

| Path | Detected? |
|---|---|
| Windows `PrintScreen` key | Yes, high confidence |
| Windows `Win+Shift+S` (Snipping Tool) | Yes, high confidence |
| macOS `Cmd+Shift+3/4/5` | Sometimes — macOS usually swallows the keypress before the page sees it. Recorded at medium confidence when it does arrive |
| macOS Screenshot.app from Launchpad, any external capture tool, OBS, a phone camera | No |
| Browser print / print-to-PDF | Yes — `beforeprint` fires |

Absence of a `screenshot.suspected` row proves nothing. Presence of one is
real.

**4. An event recorded before sign-in is attributed to whoever signs in next.**
A failed login happens when there is no token, so the event is buffered and
delivered later under the credentials of whoever does sign in on that device.
The server stamps *that* person's name on the row. Such rows carry
`recordedBeforeSignIn: true` in their detail and the attempted address in the
target column, so a reviewer can read them correctly — but do not read the
actor column of one as "this person tried that password".

Twenty's own auth layer logs failed authentication server-side, independently
of this. For brute-force questions, that is the authoritative record; this
one adds the device and route context around it.

**5. Reads are sampled, not exhaustive.**
Logging every GraphQL call would bury the interesting rows. Only reads of
sensitive object types are recorded (`SENSITIVE_READ_TYPES` in
`lib/auditEvent.ts`), and identical reads of the same record within four
seconds fold into one row.

**6. No values, only names.**
A write records *which fields changed*, never what they changed to. Note
bodies, transcripts and message text are reduced to a character count. This is
deliberate: an audit table that mirrors the CRM's contents doubles the blast
radius of leaking it. Server-generated error strings are the one exception —
they are logged under `reason` so short ones stay readable ("Wrong password"),
while anything long enough to be carrying data still collapses to a length.

---

## Architecture

```
user action ─▶ lib/audit.ts ─▶ lib/auditQueue.ts ─▶ POST /rest/sales/audit-events
               (listeners)      (batch, dedupe,      (server stamps actor + IP,
                                 persist, retry)      inserts with permissions
                                                      bypassed)
                                                              │
admin at #/audit ◀── GraphQL auditEvents ◀────────────────────┘
```

| File | Role |
|---|---|
| `src/lib/auditEvent.ts` | Pure: event model, GraphQL-operation classification, redaction |
| `src/lib/auditQueue.ts` | Pure: batching, dedupe, localStorage durability, retry |
| `src/lib/screenCapture.ts` | Pure: capture-shortcut classification, copy volume, device string |
| `src/lib/audit.ts` | Wiring: browser listeners, API observer, lifecycle |
| `src/api/auditTrail.ts` | Transport: POST for writes, GraphQL for admin reads |
| `src/views/AuditLogView.tsx` | Admin screen |
| `src/components/AuditWatermark.tsx` | Attribution overlay (sub-visual, portalled into `<body>`) |
| `tools/sales-crm/reveal-watermark.html` | Offline reader that pulls the mark back out of a leaked image |
| `twenty-server/src/modules/sales-crm/audit-log/` | Ingest endpoint, sanitizer, service |
| `tools/sales-crm/provision-audit-log.mjs` | Object, fields, per-role deny |

### Why writes go through a REST endpoint

Twenty refuses a role that can write an object it cannot read — the metadata
API answers `Cannot give update permission to non-readable object`. So a log
the app wrote with the user's own credentials would have to be a log every
seller could read in full. Posting to the server instead lets `auditEvent` be
denied to every non-admin role outright, and lets the server rather than the
client decide whose name goes on the row.

### Why every request is observed in one place

`api/client.ts` exposes `setRequestObserver`, and `lib/audit.ts` subscribes.
Every read and write in the app already passes through `gqlRequest`, so this
covers new screens automatically — a feature added next month is audited
without anyone remembering to instrument it. `client.ts` keeps no import of
the audit code, and an audit failure cannot fail an API call.

---

## Provisioning

Run once per instance, before deploying the app. Idempotent.

```bash
TWENTY_META=https://crm.hamagan.com/metadata \
TWENTY_ORIGIN=https://crm.hamagan.com \
TWENTY_EMAIL=<admin email> TWENTY_PASSWORD=<password> \
node tools/sales-crm/provision-audit-log.mjs
```

It creates the `auditEvent` object and its fields, links `actor` to
`workspaceMember`, and sets an explicit four-way deny on every non-admin role.
Re-running it after adding a role is required — a new role does not inherit
the deny.

Until it has run, the server logs one warning and the app degrades quietly:
the admin screen shows "not provisioned" and no events are written.

## Retention

Rows are pruned nightly by severity, not by one flat age. The two ends of this
log have nothing in common: `info` is navigation noise, useful for a week and
worthless after a quarter, while `critical` is what an investigation is made
of. One number for both would mean either drowning in rows or throwing away
evidence.

| Severity | Default | Rationale |
|---|---|---|
| `info` | 90 days | Navigation noise; the bulk of the volume |
| `notice` | 180 days | Ordinary writes and low-risk reads |
| `sensitive` | 400 days | Over a year, so an annual review sees a full cycle |
| `critical` | 1095 days | Screenshots, deletions, exports, denials |

Configure with `SALES_AUDIT_RETENTION_DAYS` (sets every severity) and/or
`SALES_AUDIT_RETENTION_DAYS_INFO` / `_NOTICE` / `_SENSITIVE` / `_CRITICAL`
(override one). `0` means keep forever. Values below the 30-day floor are
clamped and logged — pruning is the only thing here that destroys evidence,
so a typo cannot make it target anything recent.

**Deleting audit rows is itself audited.** Every run that removes anything
writes an `audit.retention_pruned` row — counts per severity, the cutoff
dates, the policy in force, and whether the run hit its cap. Without it,
"wait for the nightly cleaner" would be a way to erase a trail and leave no
trace of the erasure.

The job is capped at 50,000 deletions per workspace per night and spends that
budget on the lowest severity first, so a first prune of a log that has never
been cleaned works through over several nights and never sacrifices evidence
to clear noise. Workspaces that never provisioned the object are skipped
silently — the cron visits every active workspace, and on a shared instance
most of them are not sales-app workspaces.

```bash
# Registered automatically by `cron:register:all`. To run it now:
npx nx run twenty-server:command --args="sales:audit-log:prune"
# Preview the resolved policy without deleting anything:
npx nx run twenty-server:command --args="sales:audit-log:prune --dry-run"
```

## Finding an actor

The actor filter resolves against the server on each keystroke rather than
filtering a list held in the browser. A workspace can hold thousands of
members and any one of them may be the person being looked for, so a picker
backed by "the first hundred we happened to fetch" would quietly fail to find
most people — which on a security screen reads as "this person did nothing".

Words are matched independently and all must hit (`lib/actorSearch.ts`), so a
full name works even though a first name and a surname live in different
columns, in either order, and an email substring works too.
