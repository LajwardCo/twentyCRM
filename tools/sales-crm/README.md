# Sales-CRM provisioning (Phase 1)

Scripts that build the sales-management data model on a Twenty workspace via the
metadata GraphQL API. See the design in
[`docs/superpowers/specs/2026-07-01-twenty-sales-crm-design.md`](../../docs/superpowers/specs/2026-07-01-twenty-sales-crm-design.md).

## What they do

- `provision-phase1.mjs` — creates custom objects (**Product**, **Partner**,
  **Deal Product**), all their fields, sales fields on **Opportunity** / **Person**,
  and the relations between them. **Idempotent** — skips anything that already exists.
- `update-stages.mjs` — renames the Opportunity pipeline `stage` options to the sales
  process (New Lead → … → Active Customer, plus Lost / Missed).
- `provision-phase2-objects.mjs` — creates **Quotation** and **Subscription** custom
  objects, their fields, and relations to Opportunity/Company. Idempotent.
- `provision-round-robin-workflow.mjs` — creates and activates the **"Lead
  Round-Robin Assignment"** workflow (trigger: Opportunity created → find active
  workspace members → pick one → set owner). Idempotent (skips if the workflow
  already exists). **End-to-end verified**: creating a real Opportunity gets an
  owner assigned within ~1s. Distribution is random-among-active-members, not a
  strict rotating counter — see the file header for why, and the gotchas
  discovered building it (worker process requirement, `{{trigger.properties.after}}`
  vs `{{trigger.object}}`, `nextStepIds` wiring, `fieldsToUpdate` join-column naming).
  **Requires the twenty-server WORKER process running** (`npx nx run
  twenty-server:worker`) — the API server alone registers the trigger but never
  fires it; DATABASE_EVENT triggers are consumed off a BullMQ queue by the worker.
- `provision-views.mjs` — creates 4 saved Views: **My Tasks — Today** (assignee =
  Me via the `{"isCurrentWorkspaceMemberSelected":true}` convention, due = today),
  **Pipeline by Owner** (Opportunities grouped by owner), **Quotations Nearing
  Expiry** and **Subscriptions — Renewal Due Soon** (filtered + sorted by date).
  Idempotent. Views are a metadata-layer object, a simpler API than Workflows —
  used here instead of a CRON+iterator automation for the expiry/renewal
  "alarms" (no bulk-update primitive exists for that; would need a nested loop
  step, materially more complex than the round-robin workflow for uncertain payoff).

- `provision-dashboard.mjs` — creates a **"Sales Overview"** dashboard (4
  widgets: Pipeline by Owner (bar), Leads by Source (pie), Pipeline by Stage
  (bar), Total Open Opportunities (KPI number)). Schema fully reverse-engineered
  from `page-layout*`/`page-layout-widget*` resolvers and cross-checked against
  Twenty's own internal AI-tool (`create-complete-dashboard.tool.ts`), which
  documents the exact widget-configuration shapes with worked examples.
  **⚠️ NOT verified end-to-end** — a tool-access restriction appeared mid-session
  (after a conversation about production infra) and blocked every attempt to
  execute *any* script against the API, even localhost. Run this once, confirm
  the dashboard actually renders with real numbers in the UI, and check the
  file's header comment for the one genuinely uncertain piece (the
  `createDashboard` mutation name — assumed by analogy with `createWorkflow`,
  not confirmed by introspection the way every other mutation name in this
  directory was).

## Not built (deferred)

- **Quotation-expiry / subscription-renewal CRON automation** — no bulk-update
  primitive exists in the workflow engine for this; would need a nested loop
  step, materially more complex than the round-robin workflow. The saved Views
  above cover the same day-to-day need without it.
- **Phase 3**: dynamic per-factor pricing engine, discount-floor enforcement,
  external API sync, field-level permissions — not started.

## Prerequisites

- The `twenty-server` API reachable (default `http://localhost:3010`).
- A login for the target workspace.

## Run

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"   # local fork uses Node 24
node tools/sales-crm/provision-phase1.mjs
node tools/sales-crm/update-stages.mjs
```

## Config (env vars, with local-fork defaults)

| Var | Default | Notes |
|---|---|---|
| `TWENTY_META` | `http://localhost:3010/metadata` | metadata endpoint |
| `TWENTY_ORIGIN` | `http://localhost:3011` | must match the workspace front-end URL |
| `TWENTY_EMAIL` | `tim@apple.dev` | workspace login |
| `TWENTY_PASSWORD` | `tim@apple.dev` | seeded dev password = the email |

When deploying to a real server later, override these env vars for that workspace.
