# Record-Level Lead Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A scoped role (e.g. "Salesperson") can read and write only the lead records (People) it owns; managers/admins see everything — enforced once at the AGPL twenty-orm data layer so it covers UI, GraphQL, REST, and search with no bypass.

**Architecture:** Add an original `canOnlyAccessOwnedRecords` flag to `RoleEntity`. Propagate it (per scoped object) into the existing per-object `ObjectPermissions` cache the query builders already carry. In each AGPL query builder (select/update/delete/soft-delete) inject our own `andWhere("alias"."ownerId" = :currentWorkspaceMember)` when that flag is set; auto-assign owner on create in `WorkspaceRepository`. Add a standard `owner` relation to `Person`. The enterprise RLS engine and its 4 utils are never touched, imported, or copied.

**Tech Stack:** TypeScript, NestJS, TypeORM (custom twenty-orm wrapper), PostgreSQL, GraphQL, Nx monorepo, Jest (unit + integration).

---

## License guardrail (applies to EVERY task)

- Do **not** import from, copy, or edit any file whose first line is `/* @license Enterprise */`.
- Forbidden paths: `metadata-modules/row-level-permission-predicate/**`, `metadata-modules/flat-row-level-permission-predicate/**`, `twenty-orm/utils/apply-row-level-permission-predicates.util.ts`, `twenty-orm/utils/build-row-level-permission-record-filter.util.ts`, `twenty-orm/utils/validate-rls-predicates-for-records.util.ts`, `twenty-orm/utils/is-record-matching-rls-row-level-permission-predicate.util.ts`.
- Every file we create/modify must return zero from `grep -n "@license Enterprise" <file>`.
- We add our **own** `applyOwnerScopeFilter` next to (never replacing) the existing `applyRowLevelPermissionPredicates` call.

All paths below are relative to `packages/twenty-server/` unless noted.

---

## File Structure (created / modified)

**Created:**
- `src/engine/twenty-orm/owner-scope/owner-scoped-objects.constant.ts` — single source of truth: which objects are owner-scopable + their owner column.
- `src/engine/twenty-orm/owner-scope/apply-owner-scope-filter.util.ts` — the original AGPL filter applier.
- `src/engine/twenty-orm/owner-scope/__tests__/apply-owner-scope-filter.util.spec.ts` — unit tests.
- `src/database/commands/upgrade-version-command/2-15/2-15-instance-command-fast-1782000000000-add-can-only-access-owned-records-to-role.ts` — schema migration.
- `test/integration/graphql/suites/object-records-permissions/owner-scoped-records.integration-spec.ts` — end-to-end + bypass tests.

**Modified:**
- `packages/twenty-shared/src/types/ObjectPermissions.ts` — add optional `canOnlyAccessOwnedRecords`.
- `src/engine/metadata-modules/role/role.entity.ts` — add `canOnlyAccessOwnedRecords` column.
- `src/engine/metadata-modules/role/dtos/role.dto.ts` — expose the flag.
- `src/engine/metadata-modules/role/dtos/*` update/create role input — accept the flag.
- `src/engine/metadata-modules/role/utils/fromRoleEntityToRoleDto.util.ts` — map the flag.
- `src/engine/metadata-modules/role/services/*` (role create/update service) — persist the flag.
- `src/engine/metadata-modules/role/services/workspace-roles-permissions-cache.service.ts` — compute the per-object flag (and add `nameSingular` to the metadata select).
- `src/engine/twenty-orm/repository/workspace-select-query-builder.ts` — call our filter in `validatePermissions()`.
- `src/engine/twenty-orm/repository/workspace-update-query-builder.ts` — call our filter in `execute()`/`executeMany()`.
- `src/engine/twenty-orm/repository/workspace-delete-query-builder.ts` — call our filter in `execute()`.
- `src/engine/twenty-orm/repository/workspace-soft-delete-query-builder.ts` — call our filter in `execute()`.
- `src/engine/twenty-orm/repository/workspace.repository.ts` — auto-assign owner on `insert`/`save`.
- `src/modules/person/standard-objects/person.workspace-entity.ts` — add `owner`/`ownerId`.
- `src/modules/workspace-member/standard-objects/workspace-member.workspace-entity.ts` — add `ownedPeople`.
- `src/engine/workspace-manager/twenty-standard-application/utils/field-metadata/compute-person-standard-flat-field-metadata.util.ts` — add `owner` field metadata.
- `src/engine/workspace-manager/twenty-standard-application/utils/field-metadata/compute-workspace-member-standard-flat-field-metadata.util.ts` — add `ownedPeople` reverse metadata.

---

## Task 1: Stand up the local dev environment

**Files:** none (environment only).

- [ ] **Step 1: Enable Yarn 4 and install**

```bash
cd /Users/rashid/Development/twentyCRM
corepack enable
yarn install
```
Expected: Yarn 4.x resolves; install completes without fatal errors.

- [ ] **Step 2: Provision Postgres + Redis for Twenty (avoid the existing containers on 5432/5435)**

```bash
docker run -d --name twenty_db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=default -p 5436:5432 postgres:16
docker run -d --name twenty_redis -p 6380:6379 redis:7
docker ps | grep -E 'twenty_db|twenty_redis'
```
Expected: both containers `Up`. (We use 5436/6380 to avoid your existing 5432/5435 and any local redis.)

- [ ] **Step 3: Create env files**

```bash
npx nx run twenty-server:reset:env
npx nx run twenty-front:reset:env
```
Then set in `packages/twenty-server/.env`:
```env
PG_DATABASE_URL=postgres://postgres:postgres@localhost:5436/default
REDIS_URL=redis://localhost:6380
APP_SECRET=local_dev_secret_change_me
FRONTEND_URL=http://localhost:3001
```
And in `packages/twenty-front/.env`: `REACT_APP_SERVER_BASE_URL=http://localhost:3000`.

- [ ] **Step 4: Reset + seed the DB**

```bash
npx nx run twenty-server:database:reset --configuration=seed
```
Expected: completes; seeds Apple/YCombinator workspaces (Tim/Jane/Jony/Phil).

- [ ] **Step 5: Start the stack and confirm login**

```bash
npm run start
```
Open http://localhost:3001, log in as `tim@apple.dev` / `tim@apple.dev` (seeded dev password). Confirm the CRM loads.

- [ ] **Step 6: Commit nothing (env files are gitignored). Sanity-check git is clean of secrets**

```bash
git status --porcelain | grep -E '\.env$' && echo "WARN: .env tracked" || echo "OK: .env not tracked"
```
Expected: `OK`.

---

## Task 2: Add `canOnlyAccessOwnedRecords` to the Role model + migration

**Files:**
- Modify: `src/engine/metadata-modules/role/role.entity.ts`
- Create: `src/database/commands/upgrade-version-command/2-15/2-15-instance-command-fast-1782000000000-add-can-only-access-owned-records-to-role.ts`

- [ ] **Step 1: Add the column to the entity**

In `role.entity.ts`, after the `canDestroyAllObjectRecords` column block, add:
```typescript
  @Column({ nullable: false, default: false })
  canOnlyAccessOwnedRecords: boolean;
```

- [ ] **Step 2: Create the schema migration (fast instance command)**

Create the new file with:
```typescript
import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.15.0', 1782000000000)
export class AddCanOnlyAccessOwnedRecordsToRoleFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "core"."role" ADD COLUMN IF NOT EXISTS "canOnlyAccessOwnedRecords" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "core"."role" DROP COLUMN IF EXISTS "canOnlyAccessOwnedRecords"`,
    );
  }
}
```

- [ ] **Step 3: Verify the column reaches the DB**

Re-run the reset (dev applies instance commands during `database:init`):
```bash
npx nx run twenty-server:database:reset --configuration=no-seed
docker exec twenty_db psql -U postgres -d default -c '\d core.role' | grep canOnlyAccessOwnedRecords
```
Expected: a row showing `canOnlyAccessOwnedRecords | boolean | not null`.

- [ ] **Step 4: Commit**

```bash
git add packages/twenty-server/src/engine/metadata-modules/role/role.entity.ts packages/twenty-server/src/database/commands/upgrade-version-command/2-15/2-15-instance-command-fast-1782000000000-add-can-only-access-owned-records-to-role.ts
git commit -m "feat(role): add canOnlyAccessOwnedRecords flag + migration"
```

---

## Task 3: Expose the flag through Role DTO / input / service

**Files:**
- Modify: `src/engine/metadata-modules/role/dtos/role.dto.ts`
- Modify: the update/create role input DTO(s) — locate first (Step 1)
- Modify: `src/engine/metadata-modules/role/utils/fromRoleEntityToRoleDto.util.ts`
- Modify: role create/update service — locate first (Step 1)

- [ ] **Step 1: Locate the exact input DTO and service write path**

```bash
cd packages/twenty-server
grep -rln "canUpdateAllObjectRecords" src/engine/metadata-modules/role/dtos
grep -rln "canUpdateAllObjectRecords" src/engine/metadata-modules/role/services src/engine/metadata-modules/role/utils
```
Note the input DTO file(s) (e.g. `update-role.input.ts` / `create-role.input.ts`) and the service method that assigns these flags. Add `canOnlyAccessOwnedRecords` everywhere `canUpdateAllObjectRecords` appears in those files, mirroring its decorators/type (`@Field`, `boolean`, optional on inputs).

- [ ] **Step 2: Add to the output DTO**

In `role.dto.ts`, next to `canUpdateAllObjectRecords`:
```typescript
  @IsBoolean()
  @Field(() => Boolean)
  canOnlyAccessOwnedRecords: boolean;
```
(Match the exact decorator style used by the neighbouring flags in that file.)

- [ ] **Step 3: Map entity → DTO**

In `fromRoleEntityToRoleDto.util.ts`, add `canOnlyAccessOwnedRecords: roleEntity.canOnlyAccessOwnedRecords,` alongside the other flag mappings.

- [ ] **Step 4: Persist on create/update**

In the service write path found in Step 1, ensure `canOnlyAccessOwnedRecords` is written when present (mirror how `canUpdateAllObjectRecords` is handled — explicit assignment or spread).

- [ ] **Step 5: Type-check**

```bash
npx nx run twenty-server:typecheck
```
Expected: passes (no missing-property errors on RoleDto/inputs).

- [ ] **Step 6: Commit**

```bash
git add packages/twenty-server/src/engine/metadata-modules/role
git commit -m "feat(role): expose canOnlyAccessOwnedRecords via DTO, input and service"
```

---

## Task 4: Define the owner-scope config + extend ObjectPermissions

**Files:**
- Create: `src/engine/twenty-orm/owner-scope/owner-scoped-objects.constant.ts`
- Modify: `packages/twenty-shared/src/types/ObjectPermissions.ts`

- [ ] **Step 1: Create the scoped-objects constant**

```typescript
/**
 * Record-level "owner scoping" (original AGPL feature, not the enterprise RLS).
 *
 * Maps an object's `nameSingular` to the DB column that holds the owning
 * WorkspaceMember id. ONLY objects listed here can be owner-scoped. Add an
 * entry (e.g. opportunity -> 'ownerId', company -> 'accountOwnerId') to extend
 * scoping to more objects — no other code change is required.
 */
export const OWNER_SCOPED_OBJECTS: Record<string, string> = {
  person: 'ownerId',
};
```

- [ ] **Step 2: Extend the shared ObjectPermissions type**

In `packages/twenty-shared/src/types/ObjectPermissions.ts`, add inside the type:
```typescript
  /**
   * Original AGPL record-level scoping flag. When true for this object, the
   * twenty-orm query builders restrict reads/writes to records owned by the
   * current workspace member. Optional so existing constructors stay valid.
   */
  canOnlyAccessOwnedRecords?: boolean;
```

- [ ] **Step 3: Build twenty-shared so the server picks up the new type**

```bash
npx nx run twenty-shared:build
npx nx run twenty-server:typecheck
```
Expected: typecheck passes.

- [ ] **Step 4: Commit**

```bash
git add packages/twenty-shared/src/types/ObjectPermissions.ts packages/twenty-server/src/engine/twenty-orm/owner-scope/owner-scoped-objects.constant.ts
git commit -m "feat(perms): add owner-scope config and ObjectPermissions flag"
```

---

## Task 5: Compute the per-object flag in the permissions cache

**Files:**
- Modify: `src/engine/metadata-modules/role/services/workspace-roles-permissions-cache.service.ts`
- Test: `src/engine/metadata-modules/role/services/__tests__/workspace-roles-permissions-cache.service.spec.ts`

- [ ] **Step 1: Add `nameSingular` to the metadata select**

In `getWorkspaceObjectMetadataCollection()` (~line 256), add `'nameSingular'` to the `select` array.

- [ ] **Step 2: Write the failing test**

In the cache service spec, add a case: given a role with `canOnlyAccessOwnedRecords = true` and an object whose `nameSingular = 'person'`, the produced `objectRecordsPermissions[personId].canOnlyAccessOwnedRecords` is `true`; for a non-scoped object (`nameSingular = 'company'`) it is `false`; and for a role with the flag `false`, person is `false`. (Mirror the existing arrange/act/assert in this spec file; reuse its mock role/object setup.)

- [ ] **Step 3: Run it — verify it fails**

```bash
npx nx jest -- packages/twenty-server/src/engine/metadata-modules/role/services/__tests__/workspace-roles-permissions-cache.service.spec.ts
```
Expected: FAIL (property `canOnlyAccessOwnedRecords` undefined / false where true expected).

- [ ] **Step 4: Implement**

Add the import at the top:
```typescript
import { OWNER_SCOPED_OBJECTS } from 'src/engine/twenty-orm/owner-scope/owner-scoped-objects.constant';
```
Destructure `nameSingular` where the loop reads object fields (~line 131):
```typescript
        const {
          id: objectMetadataId,
          isSystem,
          universalIdentifier,
          nameSingular,
        } = objectMetadata;
```
In the object-permissions literal (~line 228), add:
```typescript
          canOnlyAccessOwnedRecords:
            role.canOnlyAccessOwnedRecords === true &&
            OWNER_SCOPED_OBJECTS[nameSingular] !== undefined,
```

- [ ] **Step 5: Run the test — verify it passes**

```bash
npx nx jest -- packages/twenty-server/src/engine/metadata-modules/role/services/__tests__/workspace-roles-permissions-cache.service.spec.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/twenty-server/src/engine/metadata-modules/role/services
git commit -m "feat(perms): compute per-object canOnlyAccessOwnedRecords in cache"
```

---

## Task 6: The owner-scope filter utility (unit-tested)

**Files:**
- Create: `src/engine/twenty-orm/owner-scope/apply-owner-scope-filter.util.ts`
- Test: `src/engine/twenty-orm/owner-scope/__tests__/apply-owner-scope-filter.util.spec.ts`

- [ ] **Step 1: Confirm the user-context type-guard import**

```bash
cd packages/twenty-server
grep -rn "export const isUserAuthContext\|export function isUserAuthContext" src/engine/core-modules/auth
```
Use the path it reports in the util import below.

- [ ] **Step 2: Write the failing test**

```typescript
import { applyOwnerScopeFilter } from 'src/engine/twenty-orm/owner-scope/apply-owner-scope-filter.util';

const makeQb = () => {
  const calls: { sql: string; params?: object }[] = [];
  return {
    calls,
    andWhere(sql: string, params?: object) {
      calls.push({ sql, params });
      return this;
    },
  };
};

const userCtx = {
  type: 'user',
  workspaceMemberId: 'wm-1',
} as any;

describe('applyOwnerScopeFilter', () => {
  it('adds owner filter for a scoped object + user context', () => {
    const qb = makeQb();
    applyOwnerScopeFilter({
      queryBuilder: qb as any,
      alias: 'person',
      objectMetadataNameSingular: 'person',
      objectMetadataId: 'obj-person',
      objectRecordsPermissions: { 'obj-person': { canOnlyAccessOwnedRecords: true } } as any,
      authContext: userCtx,
      shouldBypassPermissionChecks: false,
    });
    expect(qb.calls).toHaveLength(1);
    expect(qb.calls[0].sql).toContain('"ownerId"');
    expect(qb.calls[0].params).toEqual({ ownerScopeWorkspaceMemberId: 'wm-1' });
  });

  it('does nothing when the flag is off', () => {
    const qb = makeQb();
    applyOwnerScopeFilter({
      queryBuilder: qb as any,
      alias: 'person',
      objectMetadataNameSingular: 'person',
      objectMetadataId: 'obj-person',
      objectRecordsPermissions: { 'obj-person': { canOnlyAccessOwnedRecords: false } } as any,
      authContext: userCtx,
      shouldBypassPermissionChecks: false,
    });
    expect(qb.calls).toHaveLength(0);
  });

  it('does nothing when bypassing permission checks', () => {
    const qb = makeQb();
    applyOwnerScopeFilter({
      queryBuilder: qb as any,
      alias: 'person',
      objectMetadataNameSingular: 'person',
      objectMetadataId: 'obj-person',
      objectRecordsPermissions: { 'obj-person': { canOnlyAccessOwnedRecords: true } } as any,
      authContext: userCtx,
      shouldBypassPermissionChecks: true,
    });
    expect(qb.calls).toHaveLength(0);
  });

  it('denies all when scoped role has no workspace member (e.g. api key)', () => {
    const qb = makeQb();
    applyOwnerScopeFilter({
      queryBuilder: qb as any,
      alias: 'person',
      objectMetadataNameSingular: 'person',
      objectMetadataId: 'obj-person',
      objectRecordsPermissions: { 'obj-person': { canOnlyAccessOwnedRecords: true } } as any,
      authContext: { type: 'apiKey' } as any,
      shouldBypassPermissionChecks: false,
    });
    expect(qb.calls).toHaveLength(1);
    expect(qb.calls[0].sql).toBe('1 = 0');
  });

  it('does nothing for an object not in OWNER_SCOPED_OBJECTS', () => {
    const qb = makeQb();
    applyOwnerScopeFilter({
      queryBuilder: qb as any,
      alias: 'company',
      objectMetadataNameSingular: 'company',
      objectMetadataId: 'obj-company',
      objectRecordsPermissions: { 'obj-company': { canOnlyAccessOwnedRecords: true } } as any,
      authContext: userCtx,
      shouldBypassPermissionChecks: false,
    });
    expect(qb.calls).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run it — verify it fails**

```bash
npx nx jest -- packages/twenty-server/src/engine/twenty-orm/owner-scope/__tests__/apply-owner-scope-filter.util.spec.ts
```
Expected: FAIL ("Cannot find module apply-owner-scope-filter").

- [ ] **Step 4: Implement the util**

```typescript
import { type ObjectsPermissions } from 'twenty-shared/types';
import { type WhereExpressionBuilder } from 'typeorm';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { isUserAuthContext } from 'src/engine/core-modules/auth/utils/is-user-auth-context.util'; // adjust to path from Step 1
import { OWNER_SCOPED_OBJECTS } from 'src/engine/twenty-orm/owner-scope/owner-scoped-objects.constant';

type ApplyOwnerScopeFilterArgs = {
  queryBuilder: WhereExpressionBuilder;
  alias: string;
  objectMetadataNameSingular: string;
  objectMetadataId: string;
  objectRecordsPermissions: ObjectsPermissions | undefined;
  authContext: WorkspaceAuthContext | undefined;
  shouldBypassPermissionChecks: boolean;
};

/**
 * Original AGPL record-level scoping. When the current role is owner-scoped for
 * this object, restrict the query to records owned by the current workspace
 * member. Deliberately simple (owner == me); NOT the enterprise predicate RLS.
 */
export const applyOwnerScopeFilter = ({
  queryBuilder,
  alias,
  objectMetadataNameSingular,
  objectMetadataId,
  objectRecordsPermissions,
  authContext,
  shouldBypassPermissionChecks,
}: ApplyOwnerScopeFilterArgs): void => {
  if (shouldBypassPermissionChecks) {
    return;
  }

  const objectPermission = objectRecordsPermissions?.[objectMetadataId];

  if (objectPermission?.canOnlyAccessOwnedRecords !== true) {
    return;
  }

  const ownerColumn = OWNER_SCOPED_OBJECTS[objectMetadataNameSingular];

  if (ownerColumn === undefined) {
    return;
  }

  const workspaceMemberId =
    authContext !== undefined && isUserAuthContext(authContext)
      ? authContext.workspaceMemberId
      : null;

  // Scoped role but no workspace member identity (e.g. API key): deny all,
  // never silently widen access.
  if (workspaceMemberId === null) {
    queryBuilder.andWhere('1 = 0');

    return;
  }

  queryBuilder.andWhere(
    `${alias}."${ownerColumn}" = :ownerScopeWorkspaceMemberId`,
    { ownerScopeWorkspaceMemberId: workspaceMemberId },
  );
};
```

- [ ] **Step 5: Run the test — verify it passes**

```bash
npx nx jest -- packages/twenty-server/src/engine/twenty-orm/owner-scope/__tests__/apply-owner-scope-filter.util.spec.ts
```
Expected: PASS (5 tests).

- [ ] **Step 6: License check + commit**

```bash
grep -rn "@license Enterprise" packages/twenty-server/src/engine/twenty-orm/owner-scope && echo "VIOLATION" || echo "clean"
git add packages/twenty-server/src/engine/twenty-orm/owner-scope
git commit -m "feat(twenty-orm): owner-scope filter utility (AGPL)"
```
Expected: `clean`.

---

## Task 7: Wire the filter into the SELECT query builder

**Files:**
- Modify: `src/engine/twenty-orm/repository/workspace-select-query-builder.ts`

- [ ] **Step 1: Add imports**

```typescript
import { applyOwnerScopeFilter } from 'src/engine/twenty-orm/owner-scope/apply-owner-scope-filter.util';
```

- [ ] **Step 2: Add our method (next to the existing `applyRowLevelPermissionPredicates`)**

```typescript
  private applyOwnerScopeFilter(): void {
    if (this.shouldBypassPermissionChecks) {
      return;
    }

    if (this.expressionMap.mainAlias?.subQuery) {
      return;
    }

    const mainAliasTarget = this.getMainAliasTarget();

    const objectMetadata = getObjectMetadataFromEntityTarget(
      mainAliasTarget,
      this.internalContext,
    );

    applyOwnerScopeFilter({
      queryBuilder: this,
      alias: this.expressionMap.mainAlias.name,
      objectMetadataNameSingular: objectMetadata.nameSingular,
      objectMetadataId: objectMetadata.id,
      objectRecordsPermissions: this.objectRecordsPermissions,
      authContext: this.authContext,
      shouldBypassPermissionChecks: this.shouldBypassPermissionChecks,
    });
  }
```
(`getObjectMetadataFromEntityTarget` is already imported and used by this file.)

- [ ] **Step 3: Call it from `validatePermissions()`**

In `validatePermissions()`, immediately after the existing `this.applyRowLevelPermissionPredicates();` line, add:
```typescript
    this.applyOwnerScopeFilter();
```

- [ ] **Step 4: Confirm `nameSingular` exists on the resolved metadata**

```bash
cd packages/twenty-server
grep -rn "nameSingular" $(grep -rl "getObjectMetadataFromEntityTarget" src/engine/twenty-orm/utils | head -1)
npx nx run twenty-server:typecheck
```
Expected: typecheck passes (property `nameSingular` resolves on the metadata type). If it does not, resolve the singular name via `this.internalContext` object-name map and adjust the call.

- [ ] **Step 5: Commit**

```bash
git add packages/twenty-server/src/engine/twenty-orm/repository/workspace-select-query-builder.ts
git commit -m "feat(twenty-orm): apply owner-scope filter on reads"
```

---

## Task 8: Wire the filter into UPDATE / DELETE / SOFT-DELETE builders

**Files:**
- Modify: `src/engine/twenty-orm/repository/workspace-update-query-builder.ts`
- Modify: `src/engine/twenty-orm/repository/workspace-delete-query-builder.ts`
- Modify: `src/engine/twenty-orm/repository/workspace-soft-delete-query-builder.ts`

- [ ] **Step 1: Add the same method + import to each of the three builders**

Add the import:
```typescript
import { applyOwnerScopeFilter } from 'src/engine/twenty-orm/owner-scope/apply-owner-scope-filter.util';
```
Add this method to each class (these builders have no `subQuery`/`mainAlias.subQuery` concern):
```typescript
  private applyOwnerScopeFilter(): void {
    if (this.shouldBypassPermissionChecks) {
      return;
    }

    const mainAliasTarget = this.getMainAliasTarget();

    const objectMetadata = getObjectMetadataFromEntityTarget(
      mainAliasTarget,
      this.internalContext,
    );

    applyOwnerScopeFilter({
      queryBuilder: this,
      alias: this.expressionMap.mainAlias.name,
      objectMetadataNameSingular: objectMetadata.nameSingular,
      objectMetadataId: objectMetadata.id,
      objectRecordsPermissions: this.objectRecordsPermissions,
      authContext: this.authContext,
      shouldBypassPermissionChecks: this.shouldBypassPermissionChecks,
    });
  }
```
(`getObjectMetadataFromEntityTarget` is already imported in each file.)

- [ ] **Step 2: Call it right after the existing predicate call in each `execute()`**

- update builder `execute()` (after the `this.applyRowLevelPermissionPredicates();` at ~line 215) and `executeMany()` (after ~line 428): add `this.applyOwnerScopeFilter();`
- delete builder `execute()` (after ~line 76): add `this.applyOwnerScopeFilter();`
- soft-delete builder `execute()` (after ~line 75): add `this.applyOwnerScopeFilter();`

- [ ] **Step 3: Typecheck**

```bash
npx nx run twenty-server:typecheck
```
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add packages/twenty-server/src/engine/twenty-orm/repository/workspace-update-query-builder.ts packages/twenty-server/src/engine/twenty-orm/repository/workspace-delete-query-builder.ts packages/twenty-server/src/engine/twenty-orm/repository/workspace-soft-delete-query-builder.ts
git commit -m "feat(twenty-orm): apply owner-scope filter on update/delete/soft-delete"
```

---

## Task 9: Auto-assign owner on create

**Files:**
- Modify: `src/engine/twenty-orm/repository/workspace.repository.ts`

- [ ] **Step 1: Add imports**

```typescript
import { isUserAuthContext } from 'src/engine/core-modules/auth/utils/is-user-auth-context.util'; // path from Task 6 Step 1
import { OWNER_SCOPED_OBJECTS } from 'src/engine/twenty-orm/owner-scope/owner-scoped-objects.constant';
import { getObjectMetadataFromEntityTarget } from 'src/engine/twenty-orm/utils/get-object-metadata-from-entity-target.util'; // confirm exact path
```

- [ ] **Step 2: Add a private helper**

```typescript
  /**
   * For an owner-scoped role, force the owner column of new records to the
   * current workspace member so (a) the salesperson can see what they create
   * and (b) they cannot create records owned by someone else.
   */
  private applyOwnerOnCreate(entityOrEntities: unknown): void {
    if (this.shouldBypassPermissionChecks || !this.objectRecordsPermissions) {
      return;
    }

    const objectMetadata = getObjectMetadataFromEntityTarget(
      this.target,
      this.internalContext,
    );

    const objectPermission =
      this.objectRecordsPermissions[objectMetadata.id];

    if (objectPermission?.canOnlyAccessOwnedRecords !== true) {
      return;
    }

    const ownerColumn = OWNER_SCOPED_OBJECTS[objectMetadata.nameSingular];

    if (ownerColumn === undefined) {
      return;
    }

    const workspaceMemberId =
      this.authContext !== undefined && isUserAuthContext(this.authContext)
        ? this.authContext.workspaceMemberId
        : null;

    if (workspaceMemberId === null) {
      return;
    }

    const assign = (entity: unknown) => {
      if (entity !== null && typeof entity === 'object') {
        (entity as Record<string, unknown>)[ownerColumn] = workspaceMemberId;
      }
    };

    if (Array.isArray(entityOrEntities)) {
      entityOrEntities.forEach(assign);
    } else {
      assign(entityOrEntities);
    }
  }
```

- [ ] **Step 3: Call it at the start of `insert` and `save`**

In `override async insert(...)` and `override async save(...)`, as the first statement of the method body:
```typescript
    this.applyOwnerOnCreate(entityOrEntities); // in save: the param is `entityOrEntities`
```
For `insert`, the first parameter is named `entity` — call `this.applyOwnerOnCreate(entity);`.

- [ ] **Step 4: Typecheck + commit**

```bash
npx nx run twenty-server:typecheck
git add packages/twenty-server/src/engine/twenty-orm/repository/workspace.repository.ts
git commit -m "feat(twenty-orm): auto-assign owner on create for scoped roles"
```

---

## Task 10: Add the `Person.owner` standard field + reverse relation

**Files:**
- Modify: `src/modules/person/standard-objects/person.workspace-entity.ts`
- Modify: `src/engine/workspace-manager/twenty-standard-application/utils/field-metadata/compute-person-standard-flat-field-metadata.util.ts`
- Modify: `src/modules/workspace-member/standard-objects/workspace-member.workspace-entity.ts`
- Modify: `src/engine/workspace-manager/twenty-standard-application/utils/field-metadata/compute-workspace-member-standard-flat-field-metadata.util.ts`

- [ ] **Step 1: Add `owner`/`ownerId` to the Person entity**

Add the import (if missing) and, before `searchVector`, the two props:
```typescript
import { type WorkspaceMemberWorkspaceEntity } from 'src/modules/workspace-member/standard-objects/workspace-member.workspace-entity';
```
```typescript
  owner: EntityRelation<WorkspaceMemberWorkspaceEntity> | null;
  ownerId: string | null;
```

- [ ] **Step 2: Add Person `owner` flat field metadata**

In `compute-person-standard-flat-field-metadata.util.ts`, before the `searchVector` block, add (mirroring opportunity's owner):
```typescript
  owner: createStandardRelationFieldFlatMetadata({
    objectName,
    workspaceId,
    context: {
      type: FieldMetadataType.RELATION,
      morphId: null,
      fieldName: 'owner',
      label: i18nLabel(msg`Owner`),
      description: i18nLabel(msg`Person owner`),
      icon: 'IconUserCircle',
      isNullable: true,
      targetObjectName: 'workspaceMember',
      targetFieldName: 'ownedPeople',
      settings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: RelationOnDeleteAction.SET_NULL,
        joinColumnName: 'ownerId',
      },
    },
    standardObjectMetadataRelatedEntityIds,
    dependencyFlatEntityMaps,
    twentyStandardApplicationId,
    now,
  }),
```

- [ ] **Step 3: Add `ownedPeople` to WorkspaceMember entity**

After `ownedOpportunities`, add (and import `PersonWorkspaceEntity` if needed):
```typescript
  ownedPeople: Relation<PersonWorkspaceEntity[]>;
```

- [ ] **Step 4: Add `ownedPeople` reverse flat metadata**

In `compute-workspace-member-standard-flat-field-metadata.util.ts`, after the `ownedOpportunities` block:
```typescript
  ownedPeople: createStandardRelationFieldFlatMetadata({
    objectName,
    workspaceId,
    context: {
      type: FieldMetadataType.RELATION,
      morphId: null,
      fieldName: 'ownedPeople',
      label: i18nLabel(msg`Owned people`),
      description: i18nLabel(msg`People owned by the workspace member`),
      icon: 'IconUser',
      isNullable: false,
      isUIEditable: false,
      targetObjectName: 'person',
      targetFieldName: 'owner',
      settings: {
        relationType: RelationType.ONE_TO_MANY,
      },
    },
    standardObjectMetadataRelatedEntityIds,
    dependencyFlatEntityMaps,
    twentyStandardApplicationId,
    now,
  }),
```

- [ ] **Step 5: Apply to the DB and verify the column + FK exist**

```bash
npx nx run twenty-server:database:reset --configuration=seed
# the workspace schema name is dynamic; list person columns across workspace schemas:
docker exec twenty_db psql -U postgres -d default -c "select table_schema, column_name from information_schema.columns where column_name='ownerId' and table_name='person';"
```
Expected: at least one row showing `ownerId` on a `person` table in a `workspace_*` schema.

- [ ] **Step 6: Typecheck + commit**

```bash
npx nx run twenty-server:typecheck
git add packages/twenty-server/src/modules/person packages/twenty-server/src/modules/workspace-member packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/field-metadata/compute-person-standard-flat-field-metadata.util.ts packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/field-metadata/compute-workspace-member-standard-flat-field-metadata.util.ts
git commit -m "feat(person): add owner relation to WorkspaceMember (lead assignment)"
```

---

## Task 11: Integration tests — scoping + active bypass attempts

**Files:**
- Create: `test/integration/graphql/suites/object-records-permissions/owner-scoped-records.integration-spec.ts`

- [ ] **Step 1: Study the existing harness**

Read `test/integration/graphql/suites/object-records-permissions/create-many-object-records-permissions.integration-spec.ts` and the utils in `test/integration/graphql/utils/` (`make-graphql-api-request*.util.ts`, `create-custom-role-with-object-permissions.util.ts`, `update-workspace-member-role.util.ts`). Note how to create a role, set object permissions, switch a member's role, and issue requests as a given member.

- [ ] **Step 2: Write the test (it will fail until the harness wiring is correct)**

Cover, against the GraphQL API:
1. Setup: create a "Salesperson" role with `canOnlyAccessOwnedRecords: true` and read/update/delete object permission on `person`; assign it to member A and member B. Create People owned by A, by B, and one unassigned (admin token sets `ownerId`).
2. `findMany people` as A returns only A's People (not B's, not unassigned).
3. `findOne person(id: <B's id>)` as A returns null/empty.
4. `updateOne person(id: <B's id>)` as A does not modify B's record (returns null / affects 0).
5. `deleteOne person(id: <B's id>)` as A does not delete B's record.
6. `createOne person` as A → returned record has `ownerId === A`; passing `ownerId: <B>` is overridden to A.
7. `search(... person ...)` as A surfaces only A's People.
8. Admin (`canOnlyAccessOwnedRecords` false) sees A's, B's, and unassigned.

Use `randomUUID()` ids and an `afterEach` cleanup that deletes created People with an admin token (as the existing suite does).

- [ ] **Step 3: Run the suite**

```bash
npx nx run twenty-server:test:integration -- --testPathPattern=owner-scoped-records
```
Expected: all assertions PASS. If a write path (e.g. an `updateMany`/`save`-based mutation) is **not** filtered, that is a real bypass — fix it by ensuring that path routes through the update/delete query builders (or extend `applyOwnerOnCreate`/filter coverage), then re-run until green. Document any path discovered.

- [ ] **Step 4: Commit**

```bash
git add packages/twenty-server/test/integration/graphql/suites/object-records-permissions/owner-scoped-records.integration-spec.ts
git commit -m "test(perms): integration coverage for owner-scoped records + bypass attempts"
```

---

## Task 12: Seed roles/users for manual multi-user testing

**Files:**
- Create (throwaway, not committed): `/tmp/seed-owner-scope.md` — a runbook of GraphQL mutations, OR a small script.

- [ ] **Step 1: Create roles + assignments via the API**

With the stack running and logged in as admin (`tim@apple.dev`), in the GraphQL playground (`http://localhost:3000/graphql`) or via curl with the admin token:
1. `createRole(name: "Salesperson", canOnlyAccessOwnedRecords: true)` and grant it `person` read/update/delete object permissions.
2. `createRole(name: "Manager")` (flag false), grant broad object permissions.
3. Assign Jony and Phil to "Salesperson"; assign Jane to "Manager".
4. Create / update several People setting `owner` to Jony, to Phil, and leave some unassigned.

- [ ] **Step 2: Manual verification matrix (UI + API)**

Log in as each user (seeded password = the email) and confirm:
- Jony sees only Jony's People (UI list, record detail, search). Cannot open Phil's by direct URL.
- Phil likewise.
- Unassigned People invisible to Jony/Phil; visible to Jane and Tim.
- Jane/Tim see all; can reassign owners.
- Create as Jony → owned by Jony.
- Export (if available in the UI) as Jony → only Jony's rows.

- [ ] **Step 3: API bypass attempts (the real boundary)**

As Jony (his access token), via raw GraphQL and REST:
- `query { person(filter:{id:{eq:"<PHIL_PERSON_ID>"}}) { id } }` → empty.
- `mutation { updatePerson(id:"<PHIL_PERSON_ID>", data:{jobTitle:"x"}) ... }` → no change.
- `mutation { deletePerson(id:"<PHIL_PERSON_ID>") ... }` → no delete.
- REST `GET /rest/people/<PHIL_PERSON_ID>` and `PATCH`/`DELETE` → denied/empty.
- `createPerson(data:{ownerId:"<PHIL_WM_ID>"})` → stored with Jony as owner.
Record results. Any leak is a blocker.

---

## Task 13: Full verification + license audit

- [ ] **Step 1: Run unit + integration suites**

```bash
npx nx jest -- packages/twenty-server/src/engine/twenty-orm/owner-scope
npx nx jest -- packages/twenty-server/src/engine/metadata-modules/role
npx nx run twenty-server:test:integration -- --testPathPattern=owner-scoped-records
npx nx run twenty-server:typecheck
```
Expected: all green.

- [ ] **Step 2: License audit on the whole diff**

```bash
cd /Users/rashid/Development/twentyCRM
git diff main --name-only | while read f; do
  [ -f "$f" ] && grep -lq "@license Enterprise" "$f" && echo "ENTERPRISE TOUCHED: $f"
done; echo "audit done"
git diff main | grep -nE "row-level-permission-predicate|apply-row-level-permission|build-row-level-permission|validate-rls-predicates|is-record-matching-rls" && echo "ENTERPRISE DEP" || echo "no enterprise deps"
```
Expected: `audit done` with no `ENTERPRISE TOUCHED` lines, and `no enterprise deps`.

- [ ] **Step 3: Final commit / branch is ready for PR**

```bash
git log --oneline main..HEAD
```
Expected: the feature commits listed; branch `feature/record-level-lead-access` ready.

---

## Out of scope (per spec §8)
- Team-based scoping / team model (managers = see-all).
- Generic predicate engine / predicate UI (the enterprise feature).
- Front-end toggle UI for the role flag (set via API/seed; can be added later).
- Scoping Companies/Opportunities (add to `OWNER_SCOPED_OBJECTS` later with no new mechanism).

## Deploy (Phase 5) — NOT in this plan
Deployment to `root@zulip.lajward.dev` is a separate, review-gated phase (it shares a box with Zulip). After local verification passes, STOP and check in before deploying. Deploy steps (box inspection, DB+env backup, build image from fork, compose update, `SERVER_URL`, migration run, live multi-user + bypass re-test, documented rollback) will be handled then.
```
