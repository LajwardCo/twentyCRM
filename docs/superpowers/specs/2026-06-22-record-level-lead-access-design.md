# Record-Level Lead Access — Design Spec

**Date:** 2026-06-22
**Branch:** `feature/record-level-lead-access`
**Status:** Awaiting review (Phase 2 gate)

## 1. Goal

Each salesperson can see and edit only the leads assigned to them. Managers/admins
see everything. The scoped-vs-see-all behaviour is **role-configurable**, never
hardcoded to specific users.

"Lead" = the **Person (People)** object (decision confirmed — Twenty has no native
Lead object).

## 2. Hard licensing constraint

Twenty already ships a full row-level-permission (RLS) system, but **every file of
it is `/* @license Enterprise */`** and gated behind `BillingEntitlementKey.RLS`.
We must **not** use, copy, port, enable, or import any of it. Specifically avoid:

- `metadata-modules/row-level-permission-predicate/**`
- `metadata-modules/flat-row-level-permission-predicate/**`
- `twenty-orm/utils/apply-row-level-permission-predicates.util.ts`
- `twenty-orm/utils/build-row-level-permission-record-filter.util.ts`
- `twenty-orm/utils/validate-rls-predicates-for-records.util.ts`
- `twenty-orm/utils/is-record-matching-rls-row-level-permission-predicate.util.ts`
- the billing / SSO / enterprise modules

Our implementation is **original AGPL code**. It is deliberately *much simpler* than
the enterprise predicate engine: no arbitrary predicates, no AND/OR groups, no
predicate-builder UI — just "owner == current user," toggled by one role flag.

**Boundary verification convention:** Twenty marks commercial files with a
`/* @license Enterprise */` header (no `twenty-ee` package in this version). Our
acceptance check: `grep -rn "@license Enterprise"` over every file we add/modify
must return zero, and none of our imports may resolve into the avoided paths above.

## 3. Confirmed decisions

| Decision | Choice |
| --- | --- |
| What is a "lead" | **People** — add an `owner` relation to Person |
| Manager scope | **See all** (no team model this version) |
| Unassigned records | **Hidden** from scoped users; visible to see-all roles |
| Toggle granularity | **One per-role switch** + a configurable list of scoped objects |

## 4. Architecture

### 4.1 The choke point (AGPL, verified)

All workspace record access — both **GraphQL** (resolver factories) and **REST**
(rest-api handlers), and **search** (`search.service.ts` uses
`WorkspaceRepository.createQueryBuilder()`) — funnels through the generic ORM layer,
which is AGPL (no enterprise marker):

- `engine/twenty-orm/repository/workspace.repository.ts`
- `engine/twenty-orm/repository/workspace-select-query-builder.ts` (reads)
- `engine/twenty-orm/repository/workspace-update-query-builder.ts` (updates)
- `engine/twenty-orm/repository/workspace-delete-query-builder.ts` (hard delete)
- `engine/twenty-orm/repository/workspace-soft-delete-query-builder.ts` (soft delete)

Injecting a WHERE filter here covers list, detail, search, update, delete, and
soft-delete across both APIs in one place — no bypass surface above it.

### 4.2 Current-user identity at query time

`WorkspaceAuthContext` is request-scoped via `AsyncLocalStorage`
(`engine/core-modules/auth/storage/workspace-auth-context.storage.ts`). For a user
request it exposes `workspaceMember.id` and `userWorkspaceId`. The role for that
user-workspace is resolved via the cached `userWorkspaceRoleMap`. This is everything
needed to build `WHERE ownerId = :currentWorkspaceMemberId` and to look up the
current role's scoping config.

### 4.3 The scoping filter (our original code)

A new utility — `applyOwnerScopeFilter` (name TBD, **not** the enterprise util) —
that, given (object metadata, current role config, current workspaceMemberId),
returns either:

- **no filter** — role is see-all, or object is not in the scoped set, or no auth
  context (system/bypass), or the object has no owner field; **or**
- `WHERE "<ownerColumn>" = :currentWorkspaceMemberId` — role is scoped and the object
  is in the scoped set and has an owner column.

Unassigned (`ownerId IS NULL`) is **excluded** for scoped users (strict default).

Applied inside each of the four query builders listed in 4.1, as an
`andWhere(...)`, gated so it never runs for see-all roles or bypass contexts.

### 4.4 Create / assignment behaviour

- **Create:** for a scoped role, auto-set `ownerId = currentWorkspaceMemberId` if the
  caller did not set it (so a salesperson's new records belong to them and remain
  visible). A scoped role may not create a record owned by someone else.
- **Update/Delete:** the WHERE filter means a scoped user can only mutate rows they
  already own — they cannot reach another user's rows. (A scoped user reassigning
  their *own* record away is allowed; noted as acceptable.)
- **Reassignment by managers** works normally (see-all, no filter).

### 4.5 Role configuration

Extend the existing AGPL `RoleEntity`
(`metadata-modules/role/role.entity.ts`) with one new boolean column, e.g.
`canOnlyAccessOwnedRecords` (default `false` → no behaviour change for existing
roles). Plus a config of **which objects** the scope applies to.

- Object set: start as a small, explicit, code-level constant (the "scoped objects"
  list — initially `person`). Keep it a single source of truth so it is easy to
  extend to company/opportunity later. (A per-role/per-object UI is **out of scope**;
  see §8.)
- Managers/Admins: leave `canOnlyAccessOwnedRecords = false` → unchanged, see all.

### 4.6 Data-model change — `Person.owner`

Person has no owner field today. Add one, mirroring `Opportunity.owner`:

- `owner: EntityRelation<WorkspaceMemberWorkspaceEntity> | null` + `ownerId: string | null`
  in `modules/person/standard-objects/person.workspace-entity.ts`.
- Field metadata (MANY_TO_ONE → workspaceMember, `onDelete: SET_NULL`, join column
  `ownerId`, nullable, label "Owner") in the Person standard flat-field-metadata
  util, mirroring `compute-opportunity-standard-flat-field-metadata.util.ts`.
- A reverse field on WorkspaceMember (e.g. `ownedPeople`) consistent with the
  existing `ownedOpportunities` pattern.

## 5. Migrations

1. **Metadata schema:** add the `canOnlyAccessOwnedRecords` column to the `role`
   table (NestJS/TypeORM core migration in the metadata datasource).
2. **Workspace schema:** the new `Person.owner` standard field is applied through
   Twenty's standard-object sync (`workspace-manager` / `database:reset` locally;
   `metadata sync`/upgrade on deploy). The `ownerId` column + FK is created by that
   sync. **Implementation risk to confirm in the plan:** the exact sync target that
   propagates a newly added standard field to existing workspaces on the server
   without a destructive reset.

## 6. Test plan

**Automated (where practical):**
- Unit test for `applyOwnerScopeFilter`: see-all → no filter; scoped + owned-only
  filter; object-not-in-set → no filter; null auth/bypass → no filter; unassigned
  excluded.
- Integration/e2e test against the GraphQL API: scoped user `findMany` returns only
  owned People; `update`/`delete` of another user's record fails/returns nothing;
  manager sees all.

**Manual multi-user (must pass before deploy):**
- Seed Salesperson A, Salesperson B (scoped role), Manager (see-all role). Assign
  People to A and B; leave some unassigned.
- Verify in **UI** and directly via **GraphQL and REST**:
  - A sees only A's People; cannot read/update/delete B's People.
  - Unassigned People are invisible to A and B; visible to Manager.
  - Manager sees and edits all.
  - Search returns only owned for scoped users.
  - Create as A → record owned by A.
- **Active bypass attempts via API** (the real security boundary): craft raw
  GraphQL/REST queries with explicit `filter`/`id` targeting another user's records,
  attempt update/delete by id, attempt to read via relations/search/export, attempt
  to create-with-foreign-owner. Confirm all are denied/empty.

## 7. Rollback / safety

- Feature is inert until a role has `canOnlyAccessOwnedRecords = true`; existing roles
  default to `false` (no regression).
- The added column and Person field are additive; rollback = revert image/compose to
  the previous tag and restore the DB backup (documented at deploy time).

## 8. Out of scope (YAGNI)

- Team-based scoping / a team data model (managers = see-all only).
- Generic predicate engine / AND-OR groups / predicate-builder UI (that is the
  enterprise feature; we are not rebuilding it).
- Per-object-per-role configuration UI (object set is a code constant for now).
- Scoping Companies/Opportunities (they already have owner fields; can be added to
  the scoped-object constant later with no new mechanism).

## 9. Open implementation risks (to resolve in the plan, not now)

1. Exact standard-field sync path so `Person.owner` lands on existing workspaces on
   the server without a destructive `database:reset`.
2. Confirm the update/delete/soft-delete query builders expose an `andWhere` seam
   equivalent to the select builder, and that REST mutation handlers route through
   them.
3. Confirm export paths reuse the same repository/query-builder (expected, but
   verify there is no separate bulk-export query).
4. Confirm the role config + `userWorkspaceRoleMap` is reachable synchronously inside
   the query builder (cache vs. async fetch).
