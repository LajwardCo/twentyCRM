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
  (bar), Total Open Opportunities (KPI number)). Schema reverse-engineered
  from `page-layout*`/`page-layout-widget*` resolvers and cross-checked against
  Twenty's own internal AI-tool (`create-complete-dashboard.tool.ts`). **Verified
  end-to-end on production** (crm.hamagan.com) — ran clean, all widgets created.
- `provision-permissions.mjs` — creates a **"Seller"** role: read/write on the
  sales objects, read-only on the Product/Partner catalog, and hides
  `Product.maxDiscountPercent` from Sellers. Verified locally. Does **not**
  include row-level "sellers only see their own deals" — Twenty gates that
  behind an Enterprise license (`ROW_LEVEL_PERMISSION_FEATURE_DISABLED`, no
  config-variable override exists); see the file header.
- `provision-pricing-fields.mjs` — adds `Product.pricingFactors` (rate table)
  and `DealProduct.factorQuantities` (this line's quantities). Paired with a
  server-side PRE query hook (see below) that auto-calculates `installPrice`.
  Verified end-to-end locally (create and update paths, correct math, correct
  CURRENCY composite format).
- `provision-product-brand-category.mjs` — adds `Product.brand` (vendor /
  product line) and `Product.category` (catalog grouping), both TEXT.
  Deliberately not SELECTs: the taxonomy differs per workspace and grows, and a
  SELECT would need re-provisioning for every new brand. The Sales UI keeps
  values consistent by suggesting the ones already in use (a `<datalist>` built
  from the catalog), filters the products list by category, and groups the
  seller's deal-line product picker into category `<optgroup>`s. Creating a
  field also creates its view fields, so both columns appear in the Twenty CRM
  Products table with no extra step. Idempotent.
- `provision-external-sync-workflow.mjs` — creates a workflow that POSTs a
  Subscription's state to `Subscription.externalSystemUrl` whenever it's
  updated. Verified the trigger fires and variables resolve correctly; full
  network round-trip not verified against a real external system (only
  against a safe local target, which Twenty's own SSRF protection correctly
  refused — see the file header for what that means for you).
- `provision-contact-request-object.mjs` — creates the **Contact Request**
  custom object (inbound website questions/demo requests: fullName, email,
  phone, category, message, preferredContactMethod, status, sourceUrl) with
  relations to Person and Opportunity. Idempotent.
- `provision-contact-request-autolink-workflow.mjs` — creates the **"Contact
  Request Auto-Link Person"** workflow (trigger: Contact Request created ->
  find Person by email (substring match on `emails.primaryEmail` — the only
  operand Twenty exposes for that subfield) -> link if found, else create a
  new Person and link it). Idempotent. Requires the twenty-server WORKER
  process running (same DATABASE_EVENT requirement as round-robin).
- `provision-contact-request-reply-workflow.mjs` — creates the **"Send
  Contact Request Reply"** workflow: a manual "Send Message" action on a
  Contact Request record that pops a one-field form, emails the typed message
  to the requester via Twenty's native SEND_EMAIL action, and sets status to
  Replied. Idempotent. **Requires a connected email account** in the
  workspace (Settings > Accounts) — the script fails loudly if none exists.

- `provision-competitor-intel.mjs` — creates the **Competitor Intelligence**
  objects: **Competitor** (tier, threatLevel, status, overall strengths/
  weaknesses, website), **Competitor Product** (category, demoUrl, pricingModel,
  startingPrice, pricingSummary, per-product strengths/weaknesses), **Competitor
  Update** (a dated news/change feed — `updateType`, date, body, source; `type`
  is a reserved field name in Twenty so `updateType` is used), and **Competitor
  Usage** (links one of our leads — Person and/or Opportunity — to a competitor
  product with status, satisfaction, switchingSignal, renewalDate). Idempotent.
  See the design in
  [`docs/superpowers/specs/2026-07-06-competitor-intelligence-design.md`](../../docs/superpowers/specs/2026-07-06-competitor-intelligence-design.md).
- `provision-competitor-views.mjs` — creates 5 saved Views for the above:
  **Competitors by Threat** (sorted by threatLevel), **Competitors by Status**
  (Kanban grouped by status), **Competitor Products**, **Competitor Updates —
  Recent** (sorted by date desc), and **Switching Signals** (Competitor Usage
  filtered to `switchingSignal ≠ None` — the actionable list for sellers).
  Idempotent; run after `provision-competitor-intel.mjs`. An AI pitch/battlecard
  generator that reads this data is deferred to a later phase.

### Server-side code (not just config) — `packages/twenty-server/src/modules/sales-crm/`

Twenty has no metadata-only way to (a) synchronously block an invalid save or
(b) compute a derived field before save — both need a real NestJS PRE query
hook, which means a code change + rebuild + deploy, not just running a script.

- **Discount-ceiling enforcement**: a Deal Product's `discountPercent` cannot
  exceed its linked Product's `maxDiscountPercent`, enforced synchronously on
  both create and update (rejects the mutation outright — not a reactive
  workflow that fixes it after the fact). Verified end-to-end locally.
- **Per-factor pricing calculation**: `installPrice` is auto-computed from
  `Product.pricingFactors` × `DealProduct.factorQuantities` whenever either
  changes. No hardcoded business rates — the actual per-factor prices are
  entered by whoever manages the Product catalog.
- This code is already deployed to production (merged via PR, built and
  shipped by `deploy-hamagan-crm.yaml` same as everything else in
  `packages/twenty-server/`).

## Not built (deferred)

- **Quotation-expiry / subscription-renewal CRON automation** — no bulk-update
  primitive exists in the workflow engine for this; would need a nested loop
  step, materially more complex than the round-robin workflow. The saved Views
  above cover the same day-to-day need without it.
- **Row-level "sellers only see their own records"** — Enterprise-licensed
  feature, not enabled in this build (see `provision-permissions.mjs`).

## Prerequisites

- The `twenty-server` API reachable (default `http://localhost:3010`).
- A login for the target workspace.
- A connected email account in the workspace (Settings > Accounts), for the
  Contact Request reply workflow only.

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

## Website integration (Contact Request intake)

Once `provision-contact-request-object.mjs` has run, the standard
`createOneContactRequest` mutation is available on `/graphql` like any other
object — no extra provisioning needed for intake itself. Generate a scoped
API key for the workspace via Settings > APIs (Twenty's own UI, not a
script) and have the website POST to `/graphql` with it as a Bearer token.
Filtering by `category`/`status` works through Twenty's standard view
filters once Contact Requests exist.
