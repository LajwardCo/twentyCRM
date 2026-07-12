# Sales App RBAC — 5-Role Design

Date: 2026-07-13
Status: Clarified via brainstorming round, ready for implementation plan

## Goal

Replace today's flat access model (every workspace member sees every section
of `packages/twenty-sales-app`) with five real roles, enforced by Twenty's
native permission engine — not a client-side-only gate — so unauthorized API
calls are actually rejected, not just hidden in the UI.

## Roles

| Role | Objects | Record scope |
|---|---|---|
| **competitor-research** | Competitor (full CRUD), Task, DailyReport | own Task/DailyReport only; all Competitor records (shared pool, not owned) |
| **sales-agent** | Lead/Person, Company, Task, DailyReport | **own records only** (`canOnlyAccessOwnedRecords`) — their book of business |
| **sales-head** | Lead/Person, Company, Task, DailyReport, Competitor, Product, Package, PricingVersion, DiscountRule, WorkspaceMember/Roles | **all records** — company-wide oversight, full user management (invite/deactivate/assign roles), full pricing/discount CRUD |
| **referrer** | Lead/Person (create + read own), Company/Person (read-only, to link instead of duplicating), Task, DailyReport | **own submissions only** — can create leads/companies/people and track their own submitted records after the fact, but not edit/see others' |
| **admin** | everything | all records, all settings, including Role management itself |

**Every role** gets full access to their own Task and DailyReport records
regardless of the table above — that's the baseline, not an addition per role.

## Key scope decisions (from clarification round)

- **Referrer is not create-and-forget.** They keep read access to what they
  personally submitted, so they can track status — same owner-scoping
  mechanism as sales-agent, just also gated to create-only on everything else.
- **Sales-agent is owner-scoped**, not company-wide. This extends the
  existing `canOnlyAccessOwnedRecords` flag (built for the merged
  `record-level-lead-access` feature, see below) from Person-only to also
  cover Company and Task for this role.
- **Competitors are walled off from sales-agent entirely** — no tab, no
  direct CRUD, no read access via the object-permission system. The one
  exception is a **backend-only path**: AI/analytics features (e.g. lead
  analysis) may read Competitor data server-side to enrich their output for
  any role, without ever exposing raw competitor records to an agent who
  lacks read access. This is an application-level bypass (a service call,
  not a user-scoped query) — it does **not** need Enterprise row-level
  predicates.
- **Competitor-research gets full CRUD** on Competitor, including delete.
- **Sales-head manages users directly** (invite, deactivate, assign roles) —
  same power as admin for team management, not just a read-only roster.
  "refres" in the original ask = sales-head can see/manage the referrer
  role's people and, by virtue of company-wide record access, their
  submitted leads.
- **Sales-head has full CRUD on pricing** (Product, Package, PricingVersion,
  DiscountRule) — they set pricing strategy, not just view it.
- **Reports/Task visibility**: own-only for everyone, except sales-head and
  admin who see everyone's — not tied to each role's record-ownership scope
  (simpler, matches how Reports already has a `me`/`team` toggle).

## Licensing constraint (critical)

Twenty's row-level permission **predicate** engine
(`row-level-permission-predicate/**`, `flat-row-level-permission-predicate/**`,
and the `*rls*util.ts` files in `twenty-orm/utils/`) is Enterprise-licensed
and billing-gated — confirmed already avoided by the merged
`record-level-lead-access` feature. This design does not need it: object-level
`ObjectPermission` (per-object CRUD) plus the existing AGPL
`canOnlyAccessOwnedRecords` owner-scoping mechanism cover every requirement
above. The "agent gets competitor data only through analytics" nuance is
solved at the application layer (a backend service call), not through
row-level predicates.

## What already exists (from RBAC research pass)

- `RoleEntity`, `ObjectPermissionEntity`, `FieldPermissionEntity`,
  `RoleTargetEntity`, `RolePermissionFlagEntity` — full CRUD via
  `role.resolver.ts` (`createOneRole`, `upsertObjectPermissions`,
  `upsertFieldPermissions`, `updateWorkspaceMemberRole`, etc).
- `packages/twenty-sales-app/src/views/AdminView.tsx` already fetches roles
  and members and assigns a role to a member — the assignment UI is done.
  Role *creation* today happens in Settings → Roles in the main Twenty app,
  not the sales-app.
- Owner-scoping (`canOnlyAccessOwnedRecords`, `OWNER_SCOPED_OBJECTS` starting
  at `{ person: 'ownerId' }`) is merged to `main` — needs extending to
  `company` and `task` for this design.

## What's missing (the actual implementation work)

1. **Create the 5 roles** with their `ObjectPermission` rows (per the table
   above) and `canOnlyAccessOwnedRecords` set for sales-agent and referrer.
   Likely a provisioning script following this codebase's existing pattern
   (`tools/sales-crm/provision-*.mjs`) rather than manual Settings clicks, so
   it's repeatable across local/prod.
2. **Extend `OWNER_SCOPED_OBJECTS`** to include `company` and `task` (today
   only `person` is scoped).
3. **`fetchCurrentUser` doesn't return role/permission info today** — add a
   role (or a permission summary) to that query so the sales-app knows who's
   asking.
4. **`Shell.tsx`'s `NAV` array is hardcoded** — 9 items render unconditionally
   for every member. Needs a `useMyAccess()`-style hook driven by the fetched
   role, gating nav items and in-view actions (e.g. hide the delete button a
   referrer shouldn't see even for their own records where relevant).
5. **The backend "competitor via analytics only" path** — identify the
   specific AI/analytics call sites (e.g. lead analysis generation) and make
   sure they read Competitor data through a system-level/service call, not a
   user-permission-scoped query, so sales-agents keep getting enriched
   analysis without gaining direct Competitor access.
6. **DailyReport object dependency**: this design assumes the `dailyReport`
   custom object from `2026-07-09-sales-app-reports-design.md` exists.
   Confirm it's provisioned (locally and on prod) before wiring
   `ObjectPermission` rows for it — if it isn't yet, this becomes a
   prerequisite step.

## Open technical question for the implementation plan

"Leads, companies, people" in the original ask may collapse to fewer objects
than it sounds: per the merged `record-level-lead-access` feature, **Lead is
the Person object** in this fork (no native Lead entity), scoped by an
`owner` field already present on Person/Company/Opportunity. Whether
sales-app's "people" (contacts) and "leads" need genuinely different
`ObjectPermission` rows, or are the same underlying Person object filtered
differently by the UI, needs to be nailed down against the actual sales-app
views (`LeadsView.tsx` vs any contacts-specific view) before writing the
provisioning script.

## Testing

Same practice as the rest of this package: no test runner in
`twenty-sales-app` (outside the yarn workspace, no jest/vitest config) — this
is backend-permission-enforced, so the meaningful tests are
`twenty-server` integration tests hitting the GraphQL API directly as each
role (confirm a sales-agent's direct query for another agent's Person is
rejected, confirm a referrer's read of an un-owned Company is rejected, etc),
plus manual E2E per role in the sales-app for the UI-gating layer.

## Deploy

Same two-step, approval-gated pattern as all other sales-app work: verify
locally (with all 5 roles + a test member per role) before touching
`crm.hamagan.com`. Role provisioning must run against prod explicitly, not
assumed to propagate — same as the existing `provision-*.mjs` scripts.
