# Sales CRM Project — Status

**Last updated:** 2026-07-03
**Status: Phases 1-3 complete, verified end-to-end, live on production. Phase 4
(Package/Pricing Version model) complete and verified locally, not yet
deployed to production.**

This document is a handoff/reference for continuing this work in a new
session — what exists, where it lives, how to verify it, and what's
genuinely still open.

---

## What this project is

Turning the Twenty CRM fork into a full sales-management tool for a
subscription-software sales team, replacing Excel: lead intake from multiple
channels → follow-ups → demo → negotiation → contract → deposit/payment →
training → active subscriber, with per-seller reporting, quotation/contract/
subscription lifecycles, dynamic pricing with discount limits, referral/
commission tracking, and permissions.

Full original design: [`docs/superpowers/specs/2026-07-01-twenty-sales-crm-design.md`](../superpowers/specs/2026-07-01-twenty-sales-crm-design.md)

## Where it's deployed

- **Production**: `https://crm.hamagan.com`, running on the `hamagan-management`
  DigitalOcean droplet. Deployed via `.github/workflows/deploy-hamagan-crm.yaml`
  (builds the image, pushes to GHCR, SSHes in, pulls + restarts). Triggers
  automatically on push to `main` touching `packages/twenty-server/**`,
  `packages/twenty-front/**`, `packages/twenty-docker/**`, etc.
- **Local dev fork**: `/Users/rashid/Development/twentyCRM`, Node 24
  (`export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` first), Docker
  containers `twenty_db` (port 5436) / `twenty_redis` (port 6380), server on
  `:3010`, front-end on `:3011`. Start with `npx nx start twenty-server` /
  `npx nx start twenty-front`. Login: `tim@apple.dev` / `tim@apple.dev`.

## GitHub history

- [PR #15](https://github.com/LajwardCo/twentyCRM/pull/15) — Phase 1 + Phase 2
  (data model, round-robin workflow, saved views, dashboard). Merged 2026-07-01.
- [PR #16](https://github.com/LajwardCo/twentyCRM/pull/16) — Phase 3
  (permissions, dynamic pricing, discount enforcement, external sync). Merged
  2026-07-01.
- Both merged from branch `feature/sales-crm-config` into `main`. That branch
  still exists (not deleted) in case of follow-up work.

---

## Phase 1 — Data model (config only, via metadata API)

**Objects**: Product, Partner, Deal Product (custom) + sales fields added to
the standard Opportunity and Person objects.

**Pipeline** (Opportunity `stage`): New Lead → Following Up → Demo Scheduled
→ Demo & Negotiation → Contract Sent → Signed (Awaiting Payment) → Paid
(Awaiting Training) → In Training → Active Customer, plus a terminal
Lost / Missed.

**Key modeling decisions**:
- Two independent axes: **Stage** (pipeline position) vs **Temperature**
  (Hot/Warm/Cold engagement) — never conflated into one field.
- **Deposit is a field** (`depositAmount`, `priceLockedUntil`), not a rigid
  pipeline stage, since it can happen at different points.
- **Multi-product deals** = one Deal Product line per product on a single
  Opportunity (order/line-item pattern), not separate leads per product.
- **B2B**: deals anchor to Company, not just Person.
- **Commission %** lives on the Partner (referrer), not per-deal.

**Scripts**: `tools/sales-crm/provision-phase1.mjs`, `update-stages.mjs`

## Phase 2 — Automation, reporting, dashboards

- **Quotation + Subscription objects** — `tools/sales-crm/provision-phase2-objects.mjs`
- **"Lead Round-Robin Assignment" workflow** — `tools/sales-crm/provision-round-robin-workflow.mjs`.
  Trigger: Opportunity created → finds active workspace members → a CODE
  step picks one at random → sets the new Opportunity's owner. **Verified
  live on production multiple times**: a real Opportunity gets a real owner
  assigned within seconds.
- **4 saved Views** — `tools/sales-crm/provision-views.mjs`: My Tasks — Today,
  Pipeline by Owner, Quotations Nearing Expiry, Subscriptions — Renewal Due
  Soon. (Built instead of a CRON+iterator "alarm" automation — Twenty's
  workflow engine has no bulk-update primitive for that, would need a nested
  loop step for materially more complexity/risk than the payoff justified.)
- **"Sales Overview" dashboard** — `tools/sales-crm/provision-dashboard.mjs`:
  4 widgets (Pipeline by Owner, Leads by Source, Pipeline by Stage, Total Open
  Opportunities). **Verified end-to-end on production.**
- **Printable team handbook** — [`docs/sales-crm/Sales-Team-Handbook.docx`](Sales-Team-Handbook.docx)
  (Word doc for the sales team, not a technical doc).

## Phase 3 — Business logic, permissions, integration

Two things here needed **real server code** (not just metadata config),
because Twenty has no no-code way to (a) synchronously block an invalid save
or (b) compute a derived field before save. Both live in
`packages/twenty-server/src/modules/sales-crm/`:

- `services/deal-product-discount-validation.service.ts` +
  `query-hooks/deal-product-create-one.pre-query.hook.ts` +
  `query-hooks/deal-product-update-one.pre-query.hook.ts` — **discount
  ceiling enforcement**. A Deal Product's `discountPercent` cannot exceed its
  linked Product's `maxDiscountPercent` — rejected synchronously on both
  create and update (not a reactive workflow that fixes it after the fact).
  **Verified on real production data**: an over-limit discount is rejected
  with a clear error, a valid one is accepted.
- `services/deal-product-price-calculation.service.ts` — **dynamic per-factor
  pricing**. `Product.pricingFactors` (a rate table, e.g.
  `[{"name":"doctor","unitPrice":50},{"name":"employee","unitPrice":20}]`) ×
  `DealProduct.factorQuantities` (this line's quantities) auto-computes
  `installPrice`. No hardcoded business numbers — rates are entered by
  whoever manages the Product catalog. **Verified on production**: 5 doctors
  × $50 + 20 employees × $20 = $650.00 exactly, correct currency format.
  Fields added via `tools/sales-crm/provision-pricing-fields.mjs`.
- `query-hooks/sales-crm-query-hook.module.ts` — registers both hooks;
  imported into Twenty's central `WorkspaceQueryHookModule`. Confirmed
  booting cleanly on production (`SalesCrmQueryHookModule dependencies
  initialized`, zero DI errors).
- **"Seller" role** — `tools/sales-crm/provision-permissions.mjs`: read/write
  on the sales objects (Opportunity, Person, Company, Task, Note, Deal
  Product, Quotation, Subscription), read-only on the catalog (Product,
  Partner), and `Product.maxDiscountPercent` hidden from Sellers (they can't
  see the internal ceiling — it's still enforced server-side regardless).
  **Not included**: row-level "a seller only sees their own deals" —
  confirmed via live testing that this is gated behind a Twenty **Enterprise
  license** (`ROW_LEVEL_PERMISSION_FEATURE_DISABLED`, no config-variable
  override exists). This is a real licensing boundary, not a bug — if it
  becomes a hard requirement, it needs either an Enterprise license or a
  custom PRE-hook-based record filter (same mechanism as the discount hook).
- **External system sync workflow** — `tools/sales-crm/provision-external-sync-workflow.mjs`:
  POSTs a Subscription's state to `Subscription.externalSystemUrl` whenever
  it's updated, using Twenty's native `HTTP_REQUEST` workflow action.
  Trigger firing and variable interpolation verified correct. **The actual
  network round-trip to a real external system is not verified** — Twenty's
  HTTP_REQUEST action has built-in SSRF protection that correctly refuses
  requests to internal/private IPs, which is all that was available to test
  against safely. It will work the moment `externalSystemUrl` is set to a
  real public endpoint.

**Production infra fix that Phase 3 required**:
`packages/twenty-docker/docker-compose.hamagan.yml` now sets
`LOGIC_FUNCTION_TYPE: ${LOGIC_FUNCTION_TYPE:-LOCAL}` on both `server` and
`worker`. Twenty defaults this to DISABLED outside `NODE_ENV=development`,
which silently blocks workflow CODE-step activation — this was needed for
the round-robin workflow (Phase 2) to actually run on production. First-ever
CODE-step execution on a box triggers a one-time dependency install for the
local execution sandbox (a `yarn workspaces focus` child process) — expect a
short delay the very first time, not a bug.

## Phase 4 — Package & Pricing Version model

Full design: [`docs/superpowers/specs/2026-07-03-pricing-package-model-design.md`](../superpowers/specs/2026-07-03-pricing-package-model-design.md)
Full plan: [`docs/superpowers/plans/2026-07-03-pricing-package-model.md`](../superpowers/plans/2026-07-03-pricing-package-model.md)

Replaces the flat, non-versioned `Product.pricingFactors` rate table (Phase 3)
with a proper **Package** (a named, sellable pricing plan scoped to one
Product) and **Pricing Version** (a versioned, volume-banded rate table under
that Package) model, for cases needing tiered/volume pricing instead of one
flat unit rate per factor. The legacy `pricingFactors`/`PER_FACTOR` path from
Phase 3 is completely unchanged and still works — a Deal Product either
prices off a `pricingVersion` (new path) or off `product.pricingFactors`
(old path), never both.

**Two new custom objects** (via `tools/sales-crm/provision-pricing-package-model.mjs`):
- `Package` — `name`, `status` (`ACTIVE`/`ARCHIVED`), `allowsCustomPricing`,
  `notes`, relation `product` (many Packages per Product).
- `Pricing Version` — `versionNumber` (auto-incrementing per package, set by
  a create hook), `isActive`, `effectiveFrom`, `deactivatedAt`,
  `currencyCode`, `tierSchedule` (RAW_JSON — array of
  `{factor, billingFrequency, bands: [{minQty, maxQty, mode, amount}]}`),
  relation `package`.

**Two new fields on the existing Deal Product object**: `pricingVersion`
(relation, nullable — null means the legacy `pricingFactors` path) and
`priceSnapshot` (RAW_JSON — a frozen breakdown of exactly which bands were
matched and what they computed, so historical prices stay reconstructible
even if the Package/Pricing Version is edited later).

Note: `annualPrice` is only auto-computed on the Pricing Version path — the
legacy `PER_FACTOR` path never populated it either (this is inherited Phase 3
scope, not a Phase 4 regression), so a Deal Product on the old path still
needs `annualPrice` set manually if it's used.

**Real server code** (all in `packages/twenty-server/src/modules/sales-crm/`),
same PRE-hook pattern as Phase 3's discount ceiling:
- `utils/pricing-tier-schedule.util.ts` — pure band-matching/aggregation
  logic (`matchTierBand`, `computePriceFromTierSchedule`). Volume/threshold
  tiering, not graduated: the matched band's rate applies to the entire
  quantity. `FLAT` bands charge a fixed amount regardless of quantity within
  the band; `PER_UNIT` bands charge `amount × quantity`. Multi-factor results
  are grouped into `totalMonthly`/`totalAnnual` by each factor's
  `billingFrequency`. Unit tested (8 tests covering band boundaries, both
  modes, mixed frequencies, missing/unmatched factor quantities).
- `services/deal-product-price-calculation.service.ts` — extended with
  `calculateFromPricingVersion`, which loads the Pricing Version → Package →
  Product chain, delegates band-matching to the utility above, and writes
  `installPrice`/`annualPrice` (as `{amountMicros, currencyCode}` composites)
  plus `priceSnapshot`. The pre-existing `calculateInstallPrice`
  (`PER_FACTOR` path) is untouched.
- `services/deal-product-pricing-version-validation.service.ts` — enforces
  that a Deal Product's `pricingVersion`, if set, is `isActive` at write time
  and belongs to a Package on the *same* Product as the Deal Product line.
  Rejects with a clear GraphQL error otherwise.
- `query-hooks/pricing-version-create-one.pre-query.hook.ts` — the entire
  "deactivate, never delete" mechanism: auto-assigns `versionNumber` (max
  existing + 1 per package), and when a new version is created
  `isActive: true`, flips any other active version under the same package to
  `isActive: false` + stamps `deactivatedAt`.
- `query-hooks/deal-product-create-one.pre-query.hook.ts` and
  `deal-product-update-one.pre-query.hook.ts` — extended to branch on
  whether `pricingVersionId` is set: if so, validate + calculate via the
  Pricing Version path; if not, fall through to the unchanged legacy
  `PER_FACTOR` path. The existing discount-ceiling check still applies
  regardless of which pricing path is used.
- `query-hooks/sales-crm-query-hook.module.ts` — registers the two new
  services and the new hook alongside the existing Phase 3 providers.
  **Confirmed booting cleanly in local dev**: `SalesCrmQueryHookModule
  dependencies initialized`, zero DI errors.

**Verified live in local dev** (`/Users/rashid/Development/twentyCRM`, server
`:3010`, front-end `:3011`, `tim@apple.dev` / `tim@apple.dev`) via a
throwaway Node script driving `getLoginTokenFromCredentials` →
`getAuthTokensFromLoginToken` → `createProduct`/`createPackage`/
`createPricingVersion`/`createDealProduct` mutations against `/graphql`
(the same pattern as the provisioning scripts, but hitting the regular
GraphQL API instead of `/metadata`):

1. Created a Product (`OPD Verification Product`, `isSellable: true`).
2. Created a Package on that Product, `status: ACTIVE`.
3. Created a Pricing Version on that Package, `isActive: true`,
   `effectiveFrom: now`, `tierSchedule` set to the OPD example from the spec
   (doctor MONTHLY bands + employee ANNUAL bands). Got back
   `versionNumber: 1`, `isActive: true`, and the full `tierSchedule` echoed
   back byte-for-byte.
4. Created a second Pricing Version on the same Package, also
   `isActive: true`. Got back `versionNumber: 2`, `isActive: true`.
   Re-fetching the first version confirmed the deactivate-not-delete hook
   fired correctly: `isActive: false`, `deactivatedAt:
   "2026-07-03T05:40:24.777Z"` — stamped automatically, no manual
   bookkeeping.
5. Created a Deal Product on that Product, referencing the Package's
   now-active second Pricing Version, `factorQuantities: {"doctor": 5}`.
   Result: `installPrice.amountMicros: 2000000000` (**$2000.00 USD** — 5
   doctors lands in the 5-9 `PER_UNIT` band at 400/doctor, 400 × 5 = 2000,
   exactly as expected), `annualPrice.amountMicros: 0` (no `employee`
   quantity supplied, so that factor is correctly skipped, not charged),
   and `priceSnapshot.breakdown` contained exactly one entry — `factor:
   "doctor"`, `quantity: 5`, `matchedBand: {minQty:5,maxQty:9,mode:
   PER_UNIT,amount:400}`, `subtotal: 2000` — a byte-for-byte match to the
   spec's worked example.
6. Attempted a Deal Product on the same Product but referencing the *other*
   test Product's Package's Pricing Version. **Correctly rejected**:
   `"The linked pricing version belongs to a package for a different
   Product."` (GraphQL error, `BAD_USER_INPUT` / `INVALID_ARGS_DATA`, no
   record created).
7. Attempted a Deal Product referencing the now-deactivated first Pricing
   Version from step 3. **Correctly rejected**: `"The linked pricing
   version is not active. Select the current active version for this
   package."` (same error shape as above, no record created).
8. Cleaned up every test record (`delete*` then `destroy*` for the Deal
   Product, both Pricing Versions, both Packages, both Products) — all
   succeeded, no orphaned data left in the workspace.

All 8 sub-steps behaved exactly as designed; no bugs found in this pass.

**Environment issue hit and fixed along the way (documented for next time,
not a feature bug)**: `bash packages/twenty-utils/setup-dev-env.sh`'s
auto-detection picked up an unrelated local (non-Docker) Postgres on port
5432 that happened to be running on this machine for other projects,
instead of this project's `twenty_db` Docker container on port 5436 — and
its `npx nx reset:env` step overwrote the already-working, gitignored
`packages/twenty-server/.env` / `packages/twenty-front/.env` back to
`.env.example` placeholder defaults (wrong DB port, wrong Redis port, wrong
`APP_SECRET`). The placeholder `APP_SECRET` no longer matched the secret
that had originally encrypted `core."signingKey"`'s private key, so the
server logged `Failed to load or create current signing key ... No
encryption key matches keyId '...'` and every login attempt failed with `No
active signing key available to sign asymmetric token`. Fixed by pointing
`.env` back at the Docker containers (`localhost:5436` / `localhost:6380`)
and the documented ports (`NODE_PORT=3010` for the server — note: **not**
`PORT`, front-end `REACT_APP_PORT=3011`), then deleting the stale,
now-undecryptable `signingKey` row so `JwtKeyManagerService` regenerated a
fresh one under the current `APP_SECRET` on the next login (this specific
deletion was done with explicit operator authorization, against the local
dev DB only). Also found and killed roughly 15 stale/orphaned
`twenty-server`/`twenty-front`/`worker` processes left running from
previous, days-old sessions that were holding ports and confusing which
server was actually serving requests.

---

## How to re-verify any of this

All provisioning scripts in `tools/sales-crm/` are **idempotent** — safe to
re-run, they skip anything that already exists — and accept these env vars
(defaulting to local dev):

| Var | Local default | Production value |
|---|---|---|
| `TWENTY_META` | `http://localhost:3010/metadata` | `http://127.0.0.1:3000/metadata` (run **on** the box, not from outside — see below) |
| `TWENTY_GRAPHQL` | `http://localhost:3010/graphql` | `http://127.0.0.1:3000/graphql` |
| `TWENTY_ORIGIN` | `http://localhost:3011` | `https://crm.hamagan.com` |
| `TWENTY_EMAIL` / `TWENTY_PASSWORD` | `tim@apple.dev` / `tim@apple.dev` | real admin credentials |

**Running against production**: the session that built this could not reach
`https://crm.hamagan.com` directly (a tool-level network restriction, not a
Twenty issue) — every script was instead copied to the box (`ssh
hamagan-management`, files staged under `/tmp/sales-crm-provision/` — may
not persist across box reboots/cleanup) and run there against `127.0.0.1:3000`
directly. `tools/sales-crm/DEPLOY-TO-PRODUCTION.md` has the exact runbook.

**Functional re-verification** (what "does this actually work" looks like):
1. Create a real Opportunity → confirm it gets an owner within ~10s (round-robin).
2. Create a Product with `maxDiscountPercent: 10`, try a Deal Product with
   `discountPercent: 50` → expect a rejection error mentioning the ceiling.
3. Create a Product with `pricingModel: PER_FACTOR` and `pricingFactors`, a
   Deal Product with matching `factorQuantities` → confirm `installPrice`
   calculates correctly.
4. Create a Package (`status: ACTIVE`) on a Product, a Pricing Version on it
   with a `tierSchedule`, and a Deal Product referencing that Pricing
   Version with matching `factorQuantities` → confirm `installPrice`/
   `annualPrice`/`priceSnapshot` match the tier schedule's bands. Create a
   second `isActive: true` Pricing Version on the same Package → confirm the
   first flips to `isActive: false` with `deactivatedAt` set. Try a Deal
   Product against a deactivated version, and against a version belonging to
   a different Product's Package → expect both rejected.
5. Always clean up test records afterward (`delete*` then `destroy*`
   mutations — Twenty soft-deletes by default).

---

## What's genuinely NOT done (not silently skipped — deliberate scope calls)

- **Row-level permissions** ("sellers only see their own deals") —
  Enterprise-licensed, not enabled. See Phase 3 section above.
- **External sync's full network round-trip** — infrastructure is built and
  the trigger/payload path is verified; only the actual outbound POST to a
  real external system hasn't been exercised (nothing to point it at yet).
- **Phase 4 (Package/Pricing Version model) has not been deployed to
  production** — built and verified end-to-end on local dev only (see Phase
  4 section above). Deploying follows the same path as Phases 1-3: push to
  `main` triggers `.github/workflows/deploy-hamagan-crm.yaml`, then run
  `tools/sales-crm/provision-pricing-package-model.mjs` against production
  per the `DEPLOY-TO-PRODUCTION.md` runbook.
- Nothing else from the original request is outstanding. If new work comes
  up, it's new scope, not a continuation of something half-finished.

## Non-obvious Twenty internals worth knowing (learned the hard way)

- **Workflows** are workspace records on `/graphql` (`createWorkflow` etc,
  standard CRUD), NOT `/metadata`. Creating a `workflow` record
  auto-creates a DRAFT `workflowVersion` via a post-query hook.
- **Views, ViewFilter, ViewSort, LogicFunctions, Roles, Permissions,
  PageLayout/Dashboard** all live on `/metadata` — a simpler, more
  predictable API surface than workflows.
- **DATABASE_EVENT triggers need the worker process running** — the API
  server alone registers the trigger but never fires it. In Twenty's own
  Docker Compose, `worker` is a separate always-on service (`yarn
  worker:prod`), so this is automatic in production; in local dev you must
  run `npx nx run twenty-server:worker` yourself alongside the server.
- Runtime trigger data lives at `{{trigger.properties.after.<field>}}`, NOT
  `{{trigger.object.<field>}}` (the latter is only an AI-agent-facing
  descriptive path).
- A workflow step's `nextStepIds` gets set by its CHILD step's creation
  call — patching a step from a stale snapshot silently wipes that wiring.
- `UPDATE_RECORD` action's `fieldsToUpdate` must list the join-column name
  (`ownerId`), not the relation field name (`owner`).
- Currency fields are a composite `{amountMicros, currencyCode}`, not a
  plain number — writing a raw number is silently dropped.
- An ACTIVE/DEACTIVATED workflow version is immutable; there's no
  "create new draft from active" via plain record CRUD. Fastest safe
  iteration in dev: delete + destroy the whole workflow and rebuild fresh.
- "Assigned to me" in a View filter is the JSON-stringified value
  `{"isCurrentWorkspaceMemberSelected":true,"selectedRecordIds":[]}` on a
  relation filter, not a literal workspace-member id.
- Twenty's `HTTP_REQUEST` workflow action has built-in SSRF protection —
  refuses requests to internal/private IPs.
- `WorkspaceQueryHookType.PRE_HOOK` is the only synchronous, save-blocking
  mechanism in Twenty; it requires real NestJS code (a `.pre-query.hook.ts`
  file registered in a module), not metadata config.

## Full file map

```
docs/sales-crm/
  PROJECT-STATUS.md              <- this file
  Sales-Team-Handbook.docx       <- printable handbook for sellers

docs/superpowers/specs/
  2026-07-01-twenty-sales-crm-design.md         <- original design spec
  2026-07-03-pricing-package-model-design.md    <- Phase 4 design spec

docs/superpowers/plans/
  2026-07-03-pricing-package-model.md    <- Phase 4 implementation plan

tools/sales-crm/
  README.md                              <- technical script reference
  DEPLOY-TO-PRODUCTION.md                <- production runbook
  provision-phase1.mjs                   <- Phase 1: objects/fields/relations
  update-stages.mjs                      <- Phase 1: pipeline stage rename
  provision-phase2-objects.mjs           <- Phase 2: Quotation/Subscription
  provision-round-robin-workflow.mjs     <- Phase 2: auto-assignment workflow
  provision-views.mjs                    <- Phase 2: 4 saved views
  provision-dashboard.mjs                <- Phase 2: Sales Overview dashboard
  provision-permissions.mjs              <- Phase 3: Seller role
  provision-pricing-fields.mjs           <- Phase 3: pricing factor fields
  provision-external-sync-workflow.mjs   <- Phase 3: external sync workflow
  provision-pricing-package-model.mjs    <- Phase 4: Package/Pricing Version objects
  diag2.mjs                              <- diagnostic script (debugging aid)

packages/twenty-server/src/modules/sales-crm/
  utils/
    pricing-tier-schedule.util.ts              <- Phase 4: tier-band calculation (unit tested)
    pricing-tier-schedule.util.spec.ts
  services/
    deal-product-discount-validation.service.ts
    deal-product-price-calculation.service.ts  <- extended in Phase 4 (calculateFromPricingVersion)
    deal-product-pricing-version-validation.service.ts  <- Phase 4
  query-hooks/
    deal-product-create-one.pre-query.hook.ts  <- extended in Phase 4
    deal-product-update-one.pre-query.hook.ts  <- extended in Phase 4
    pricing-version-create-one.pre-query.hook.ts  <- Phase 4: auto-version + deactivate-not-delete
    sales-crm-query-hook.module.ts

packages/twenty-docker/
  docker-compose.hamagan.yml     <- production env config (LOGIC_FUNCTION_TYPE fix)
```
