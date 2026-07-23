# Sales App: Member Management + Competitor Researcher Role — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Sales-app admins add (invite), edit, and delete workspace members from the `#/admin` screen, and provision a "Competitor Researcher" role that reads everything but only writes competitor/catalog records.

**Architecture:** One additive `twenty-server` change exposes a ready-to-copy invite `link` on the workspace-invitation DTO (the token is plaintext but was omitted from the API). The Sales SPA (`twenty-sales-app`) gains member-management functions in `src/api/admin.ts` and UI in `src/views/AdminView.tsx`, using the existing hand-rolled `coreQuery`/`metadataQuery` client. The role is created by an idempotent provisioning script matching the existing `tools/sales-crm/provision-*.mjs` pattern.

**Tech Stack:** NestJS + TypeORM + GraphQL (server); React 19 + Vite + vitest, RTL/Farsi (sales app); Node `.mjs` scripts against the metadata GraphQL API.

**Spec:** `docs/superpowers/specs/2026-07-23-sales-app-member-management-and-competitor-role-design.md`

---

## File map

- `packages/twenty-server/.../workspace-invitation/utils/cast-app-token-to-workspace-invitation.util.ts` — add `link` to DTO cast (Task 1)
- `packages/twenty-server/.../workspace-invitation/dtos/workspace-invitation.dto.ts` — add `link` field (Task 2)
- `packages/twenty-server/.../workspace-invitation/services/workspace-invitation.service.ts` — `buildInvitationLink` helper; wire send + load (Task 2)
- `tools/sales-crm/provision-competitor-researcher-role.mjs` — create role + object write perms (Task 3)
- `packages/twenty-sales-app/src/api/admin.ts` — invite/list/resend/delete-invite/edit/delete-member functions (Task 4)
- `packages/twenty-sales-app/src/api/admin.test.ts` — vitest unit tests (Task 4)
- `packages/twenty-sales-app/src/views/AdminView.tsx` — member-management UI (Tasks 5–6)
- `packages/twenty-sales-app/src/App.tsx:214` — pass `user` prop to `AdminView` (Task 6)

---

## Task 1: Backend — cast invite token to DTO with a link

**Files:**
- Modify: `packages/twenty-server/src/engine/core-modules/workspace-invitation/utils/cast-app-token-to-workspace-invitation.util.ts`
- Test: `packages/twenty-server/src/engine/core-modules/workspace-invitation/utils/cast-app-token-to-workspace-invitation.util.spec.ts` (create)

- [ ] **Step 1: Write the failing test**

Create the spec file:

```ts
import { AppTokenType } from 'src/engine/core-modules/app-token/app-token.entity';

import { castAppTokenToWorkspaceInvitationUtil } from './cast-app-token-to-workspace-invitation.util';

describe('castAppTokenToWorkspaceInvitationUtil', () => {
  const baseToken = {
    id: 'token-id',
    type: AppTokenType.InvitationToken,
    expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    context: { email: 'new@member.dev', roleId: 'role-1' },
  } as any;

  it('includes the invite link when one is provided', () => {
    const result = castAppTokenToWorkspaceInvitationUtil(
      baseToken,
      'https://crm.example/invite?inviteToken=abc',
    );

    expect(result).toEqual({
      id: 'token-id',
      email: 'new@member.dev',
      roleId: 'role-1',
      expiresAt: baseToken.expiresAt,
      link: 'https://crm.example/invite?inviteToken=abc',
    });
  });

  it('defaults link to null when none is provided', () => {
    const result = castAppTokenToWorkspaceInvitationUtil(baseToken);

    expect(result.link).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest cast-app-token-to-workspace-invitation.util --config=packages/twenty-server/jest.config.mjs`
Expected: FAIL — `link` is not on the returned object / util takes only one arg.

- [ ] **Step 3: Add the `link` parameter to the util**

In `cast-app-token-to-workspace-invitation.util.ts`, change the signature and return:

```ts
export const castAppTokenToWorkspaceInvitationUtil = (
  appToken: AppTokenEntity,
  link?: string | null,
) => {
```

and add `link` to the returned object (keep the two existing guard `if` blocks unchanged):

```ts
  return {
    id: appToken.id,
    email: appToken.context.email,
    roleId: appToken.context.roleId ?? null,
    expiresAt: appToken.expiresAt,
    link: link ?? null,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest cast-app-token-to-workspace-invitation.util --config=packages/twenty-server/jest.config.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/twenty-server/src/engine/core-modules/workspace-invitation/utils/cast-app-token-to-workspace-invitation.util.ts \
        packages/twenty-server/src/engine/core-modules/workspace-invitation/utils/cast-app-token-to-workspace-invitation.util.spec.ts
git commit -m "feat(server): add optional invite link to workspace-invitation cast util"
```

---

## Task 2: Backend — expose `link` on the DTO and populate it

**Files:**
- Modify: `packages/twenty-server/src/engine/core-modules/workspace-invitation/dtos/workspace-invitation.dto.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/workspace-invitation/services/workspace-invitation.service.ts`

- [ ] **Step 1: Add the field to the GraphQL DTO**

In `workspace-invitation.dto.ts`, after the `expiresAt` field add:

```ts
  @Field({ nullable: true })
  link?: string | null;
```

- [ ] **Step 2: Add a `buildInvitationLink` helper to the service**

In `workspace-invitation.service.ts`, add this private method to the `WorkspaceInvitationService` class (imports `getAppPath`, `AppPath`, `AppTokenEntity` are already present in the file):

```ts
  private buildInvitationLink(
    workspace: WorkspaceEntity,
    appToken: AppTokenEntity,
  ): string {
    return this.workspaceDomainsService
      .buildWorkspaceURL({
        workspace,
        pathname: getAppPath(AppPath.Invite, {
          workspaceInviteHash: workspace.inviteHash,
        }),
        searchParams: {
          inviteToken: appToken.value,
          email: appToken.context?.email,
        },
      })
      .toString();
  }
```

- [ ] **Step 3: Use the helper in the email loop (DRY, replaces the inline URL build)**

In `sendInvitations`, inside the `for (const invitation of invitationResults)` loop, replace the existing inline `const link = this.workspaceDomainsService.buildWorkspaceURL({ ... });` block with:

```ts
        const link = this.buildInvitationLink(
          workspace,
          invitation.value.appToken,
        );
```

Then in the `emailData` object below it, change `link: link.toString(),` to `link,` (it is now already a string).

- [ ] **Step 4: Include the link in the result DTOs**

In the same method's final `reduce`, change the success branch push from
`acc.result.push(castAppTokenToWorkspaceInvitationUtil(invitation.value.appToken));`
to:

```ts
          acc.result.push(
            castAppTokenToWorkspaceInvitationUtil(
              invitation.value.appToken,
              this.buildInvitationLink(workspace, invitation.value.appToken),
            ),
          );
```

- [ ] **Step 5: Populate link when listing pending invitations**

In `loadWorkspaceInvitations`, remove the `select: { value: false }` option (so the token value loads) and map with the link:

```ts
  async loadWorkspaceInvitations(workspace: WorkspaceEntity) {
    const appTokens = await this.appTokenRepository.find({
      where: {
        workspaceId: workspace.id,
        type: AppTokenType.InvitationToken,
        deletedAt: IsNull(),
      },
    });

    return appTokens.map((appToken) =>
      castAppTokenToWorkspaceInvitationUtil(
        appToken,
        this.buildInvitationLink(workspace, appToken),
      ),
    );
  }
```

- [ ] **Step 6: Typecheck the server**

Run: `npx nx typecheck twenty-server`
Expected: PASS (no type errors from the new field/param).

- [ ] **Step 7: Run the existing invitation service spec**

Run: `npx jest workspace-invitation.service --config=packages/twenty-server/jest.config.mjs`
Expected: PASS. If an assertion compares a full invitation object and now fails because of the added `link` key, update that expectation to include `link: expect.any(String)` (or the built URL). Do not weaken unrelated assertions.

- [ ] **Step 8: Commit**

```bash
git add packages/twenty-server/src/engine/core-modules/workspace-invitation/dtos/workspace-invitation.dto.ts \
        packages/twenty-server/src/engine/core-modules/workspace-invitation/services/workspace-invitation.service.ts
git commit -m "feat(server): return copyable invite link on workspace invitations"
```

---

## Task 3: Provisioning script for the Competitor Researcher role

**Files:**
- Create: `tools/sales-crm/provision-competitor-researcher-role.mjs`

- [ ] **Step 1: Write the script**

Create `tools/sales-crm/provision-competitor-researcher-role.mjs` (boilerplate copied from `tools/sales-crm/provision-competitor-intel.mjs`):

```js
// tools/sales-crm/provision-competitor-researcher-role.mjs
// Creates the "Competitor Researcher" role: reads all records, writes only
// competitor + catalog objects, no settings/member access.
// Idempotent: no-op if the role already exists.
const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';
const API_KEY = process.env.TWENTY_API_KEY ?? null;
// Objects this role may WRITE (read-all is granted separately). Only those
// that actually exist in the workspace are granted; the rest are skipped.
const WRITE_OBJECTS = (process.env.RESEARCHER_WRITE_OBJECTS ??
  'competitor,product,productPackage').split(',').map((s) => s.trim());

let TOKEN = API_KEY;
async function gqlOnce(query, variables) {
  const res = await fetch(META, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors)
    throw new Error(JSON.stringify(json.errors.map((e) => e.message)));
  return json.data;
}
async function gql(query, variables) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await gqlOnce(query, variables);
    } catch (e) {
      if (!(e instanceof TypeError) || attempt === 5) throw e;
      console.error(`  (network hiccup, retry ${attempt}/5: ${e.message})`);
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
}
async function login() {
  const a = await gql(
    `mutation($e:String!,$p:String!,$o:String!){getLoginTokenFromCredentials(email:$e,password:$p,origin:$o){loginToken{token}}}`,
    { e: EMAIL, p: PASSWORD, o: ORIGIN },
  );
  const b = await gql(
    `mutation($t:String!,$o:String!){getAuthTokensFromLoginToken(loginToken:$t,origin:$o){tokens{accessOrWorkspaceAgnosticToken{token}}}}`,
    { t: a.getLoginTokenFromCredentials.loginToken.token, o: ORIGIN },
  );
  TOKEN = b.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;
}

async function main() {
  if (!TOKEN) await login();

  // 1. Idempotency: skip if the role already exists.
  const { getRoles } = await gql(`query { getRoles { id label } }`);
  const existing = getRoles.find((r) => r.label === 'Competitor Researcher');
  if (existing) {
    console.log(`Role already exists (${existing.id}). Nothing to do.`);
    return;
  }

  // 2. Create the role: read-all, no write-all, no settings.
  const { createOneRole } = await gql(
    `mutation($input: CreateRoleInput!) {
      createOneRole(createRoleInput: $input) { id label }
    }`,
    {
      input: {
        label: 'Competitor Researcher',
        description: 'Reads all records; writes competitor & catalog data only.',
        icon: 'IconBinoculars',
        canReadAllObjectRecords: true,
        canUpdateAllObjectRecords: false,
        canSoftDeleteAllObjectRecords: false,
        canDestroyAllObjectRecords: false,
        canUpdateAllSettings: false,
        canAccessAllTools: false,
        canBeAssignedToUsers: true,
      },
    },
  );
  const roleId = createOneRole.id;
  console.log(`Created role ${createOneRole.label} (${roleId}).`);

  // 3. Resolve object metadata ids for the writable objects that exist.
  const { objects } = await gql(`query {
    objects(paging: { first: 500 }) { edges { node { id nameSingular } } }
  }`);
  const byName = {};
  for (const { node } of objects.edges) byName[node.nameSingular] = node.id;

  const objectPermissions = WRITE_OBJECTS.filter((n) => byName[n]).map((n) => ({
    objectMetadataId: byName[n],
    canReadObjectRecords: true,
    canUpdateObjectRecords: true,
    canSoftDeleteObjectRecords: false,
    canDestroyObjectRecords: false,
  }));
  const skipped = WRITE_OBJECTS.filter((n) => !byName[n]);
  if (skipped.length)
    console.log(`  (skipped objects not found: ${skipped.join(', ')})`);

  // 4. Grant write on the resolved objects.
  if (objectPermissions.length) {
    await gql(
      `mutation($input: UpsertObjectPermissionsInput!) {
        upsertObjectPermissions(upsertObjectPermissionsInput: $input) { objectMetadataId }
      }`,
      { input: { roleId, objectPermissions } },
    );
    console.log(
      `  Granted write on: ${objectPermissions
        .map((p) => Object.keys(byName).find((k) => byName[k] === p.objectMetadataId))
        .join(', ')}`,
    );
  }
  console.log('Done. Assign the role to members from the Sales admin screen.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run it against a dev workspace**

Run: `node tools/sales-crm/provision-competitor-researcher-role.mjs`
Expected: "Created role Competitor Researcher (<uuid>)." plus a "Granted write on: competitor…" line.

- [ ] **Step 3: Verify idempotency**

Run: `node tools/sales-crm/provision-competitor-researcher-role.mjs`
Expected: "Role already exists (<uuid>). Nothing to do."

- [ ] **Step 4: Verify via metadata**

Run: `node -e "process.exit(0)"` is not enough — instead confirm through the app in Task 7, or query the Postgres MCP (`SELECT label, "canReadAllObjectRecords", "canUpdateAllObjectRecords" FROM metadata.role WHERE label='Competitor Researcher';`). Expected: one row, read=true, update=false.

- [ ] **Step 5: Commit**

```bash
git add tools/sales-crm/provision-competitor-researcher-role.mjs
git commit -m "feat(sales-crm): provisioning script for Competitor Researcher role"
```

---

## Task 4: Sales app — member-management API functions

**Files:**
- Modify: `packages/twenty-sales-app/src/api/admin.ts`
- Test: `packages/twenty-sales-app/src/api/admin.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `packages/twenty-sales-app/src/api/admin.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  coreQuery: vi.fn(),
  metadataQuery: vi.fn(),
}));

import { coreQuery } from './client';
import {
  deleteInvitation,
  deleteMember,
  fetchInvitations,
  inviteMember,
  resendInvitation,
  updateMemberName,
} from './admin';

const mockedCoreQuery = vi.mocked(coreQuery);

describe('member management api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inviteMember sends the email + role and returns result with link', async () => {
    mockedCoreQuery.mockResolvedValue({
      sendInvitations: {
        success: true,
        errors: [],
        result: [
          { id: 'i1', email: 'a@b.dev', roleId: 'r1', expiresAt: 'x', link: 'https://crm/invite?t=1' },
        ],
      },
    });

    const out = await inviteMember('a@b.dev', 'r1');

    expect(mockedCoreQuery).toHaveBeenCalledWith(
      expect.stringContaining('sendInvitations'),
      { emails: ['a@b.dev'], roleId: 'r1' },
    );
    expect(out.result[0].link).toBe('https://crm/invite?t=1');
    expect(out.errors).toEqual([]);
  });

  it('inviteMember surfaces server errors', async () => {
    mockedCoreQuery.mockResolvedValue({
      sendInvitations: { success: false, errors: ['already invited'], result: [] },
    });

    const out = await inviteMember('a@b.dev');

    expect(out.errors).toEqual(['already invited']);
  });

  it('fetchInvitations reads pending invitations', async () => {
    mockedCoreQuery.mockResolvedValue({
      findWorkspaceInvitations: [
        { id: 'i1', email: 'a@b.dev', roleId: null, expiresAt: 'x', link: 'https://crm/invite?t=1' },
      ],
    });

    const out = await fetchInvitations();

    expect(mockedCoreQuery).toHaveBeenCalledWith(
      expect.stringContaining('findWorkspaceInvitations'),
    );
    expect(out).toHaveLength(1);
  });

  it('deleteMember calls deleteUserFromWorkspace with the member id', async () => {
    mockedCoreQuery.mockResolvedValue({ deleteUserFromWorkspace: { id: 'm1' } });

    await deleteMember('m1');

    expect(mockedCoreQuery).toHaveBeenCalledWith(
      expect.stringContaining('deleteUserFromWorkspace'),
      { id: 'm1' },
    );
  });

  it('updateMemberName updates workspace member settings', async () => {
    mockedCoreQuery.mockResolvedValue({ updateWorkspaceMemberSettings: true });

    await updateMemberName('m1', 'Ada', 'Lovelace');

    expect(mockedCoreQuery).toHaveBeenCalledWith(
      expect.stringContaining('updateWorkspaceMemberSettings'),
      { input: { workspaceMemberId: 'm1', update: { name: { firstName: 'Ada', lastName: 'Lovelace' } } } },
    );
  });

  it('resendInvitation and deleteInvitation pass the appTokenId', async () => {
    mockedCoreQuery.mockResolvedValue({});

    await resendInvitation('t1');
    await deleteInvitation('t1');

    expect(mockedCoreQuery).toHaveBeenNthCalledWith(
      1, expect.stringContaining('resendWorkspaceInvitation'), { appTokenId: 't1' },
    );
    expect(mockedCoreQuery).toHaveBeenNthCalledWith(
      2, expect.stringContaining('deleteWorkspaceInvitation'), { appTokenId: 't1' },
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/twenty-sales-app && npx vitest run src/api/admin.test.ts`
Expected: FAIL — functions not exported from `./admin`.

- [ ] **Step 3: Implement the functions**

Append to `packages/twenty-sales-app/src/api/admin.ts` (after the members section, before `// ---------- competitors ----------`):

```ts
// ---------- member management (invite / edit / delete) ----------

export type Invitation = {
  id: string;
  email: string;
  roleId: string | null;
  expiresAt: string;
  link: string | null;
};

export const inviteMember = async (
  email: string,
  roleId?: string,
): Promise<{ result: Invitation[]; errors: string[] }> => {
  const data = await coreQuery<{
    sendInvitations: { success: boolean; errors: string[]; result: Invitation[] };
  }>(
    `mutation SendInvitations($emails: [String!]!, $roleId: UUID) {
      sendInvitations(emails: $emails, roleId: $roleId) {
        success
        errors
        result { id email roleId expiresAt link }
      }
    }`,
    { emails: [email], roleId: roleId ?? null },
  );
  return {
    result: data.sendInvitations.result,
    errors: data.sendInvitations.errors,
  };
};

export const fetchInvitations = async (): Promise<Invitation[]> => {
  const data = await coreQuery<{ findWorkspaceInvitations: Invitation[] }>(
    `query FindWorkspaceInvitations {
      findWorkspaceInvitations { id email roleId expiresAt link }
    }`,
  );
  return data.findWorkspaceInvitations;
};

export const resendInvitation = async (appTokenId: string): Promise<void> => {
  await coreQuery(
    `mutation ResendInvite($appTokenId: String!) {
      resendWorkspaceInvitation(appTokenId: $appTokenId) { success }
    }`,
    { appTokenId },
  );
};

export const deleteInvitation = async (appTokenId: string): Promise<void> => {
  await coreQuery(
    `mutation DeleteInvite($appTokenId: String!) {
      deleteWorkspaceInvitation(appTokenId: $appTokenId)
    }`,
    { appTokenId },
  );
};

export const updateMemberName = async (
  workspaceMemberId: string,
  firstName: string,
  lastName: string,
): Promise<void> => {
  await coreQuery(
    `mutation UpdateMemberName($input: UpdateWorkspaceMemberSettingsInput!) {
      updateWorkspaceMemberSettings(input: $input)
    }`,
    { input: { workspaceMemberId, update: { name: { firstName, lastName } } } },
  );
};

export const deleteMember = async (
  workspaceMemberId: string,
): Promise<void> => {
  await coreQuery(
    `mutation DeleteMember($id: String!) {
      deleteUserFromWorkspace(workspaceMemberIdToDelete: $id) { id }
    }`,
    { id: workspaceMemberId },
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/twenty-sales-app && npx vitest run src/api/admin.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/twenty-sales-app/src/api/admin.ts packages/twenty-sales-app/src/api/admin.test.ts
git commit -m "feat(sales-app): member management api (invite/list/resend/delete/edit)"
```

---

## Task 5: Sales app — Add-member + pending-invitations UI

**Files:**
- Modify: `packages/twenty-sales-app/src/views/AdminView.tsx`

This task and Task 6 together replace `AdminView.tsx`. Do Task 5 first (add invite + pending list on top of the existing members/roles view), then Task 6 (edit/delete + self-guard). No component test harness exists in this app; verify by typecheck + the manual E2E in Task 7.

- [ ] **Step 1: Rewrite AdminView with invite + pending sections**

Replace the entire contents of `packages/twenty-sales-app/src/views/AdminView.tsx` with:

```tsx
import { useState } from 'react';

import type { CurrentUser } from '../api/auth';
import {
  assignRole,
  deleteInvitation,
  deleteMember,
  fetchInvitations,
  fetchMembers,
  fetchRoles,
  inviteMember,
  resendInvitation,
  updateMemberName,
  type Member,
} from '../api/admin';
import { useCached, invalidateCache } from '../lib/cache';
import { toPersianDigits } from '../lib/jalali';
import { personName } from '../lib/format';

type AdminViewProps = { user: CurrentUser };

// User & group management: workspace members with their role (group);
// admins invite / edit / delete members and reassign roles inline.
// Server enforces the WORKSPACE_MEMBERS / ROLES permission flags.
export const AdminView = ({ user }: AdminViewProps) => {
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);

  const { data, error, refresh } = useCached('admin:members-roles', async () => {
    const [roles, members, invitations] = await Promise.all([
      fetchRoles(),
      fetchMembers(),
      fetchInvitations(),
    ]);
    return { roles, members, invitations };
  });

  const flash = (msg: string, ms = 2200) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), ms);
  };

  const reload = async () => {
    invalidateCache('admin:members-roles');
    await refresh();
  };

  const roleOfMember = (memberId: string): string | undefined =>
    data?.roles.find((r) => r.workspaceMembers.some((m) => m.id === memberId))?.id;

  const changeRole = async (memberId: string, roleId: string) => {
    setBusy(memberId);
    try {
      await assignRole(memberId, roleId);
      await reload();
      flash('نقش تغییر کرد ✓');
    } catch (err) {
      flash(`خطا: ${err instanceof Error ? err.message : ''}`, 3500);
    } finally {
      setBusy(null);
    }
  };

  const submitInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    setBusy('invite');
    setInviteLink(null);
    try {
      const { result, errors } = await inviteMember(email, inviteRole || undefined);
      if (errors.length) {
        flash(`خطا: ${errors[0]}`, 3500);
      } else {
        setInviteLink(result[0]?.link ?? null);
        setInviteEmail('');
        await reload();
        flash('دعوت‌نامه ساخته شد ✓');
      }
    } catch (err) {
      flash(`خطا: ${err instanceof Error ? err.message : ''}`, 3500);
    } finally {
      setBusy(null);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash('لینک کپی شد ✓');
    } catch {
      flash('کپی نشد — لینک را دستی انتخاب کنید', 3500);
    }
  };

  const removeInvite = async (id: string) => {
    setBusy(id);
    try {
      await deleteInvitation(id);
      await reload();
      flash('دعوت‌نامه حذف شد ✓');
    } catch (err) {
      flash(`خطا: ${err instanceof Error ? err.message : ''}`, 3500);
    } finally {
      setBusy(null);
    }
  };

  const resendInvite = async (id: string) => {
    setBusy(id);
    try {
      await resendInvitation(id);
      await reload();
      flash('دوباره ارسال شد ✓');
    } catch (err) {
      flash(`خطا: ${err instanceof Error ? err.message : ''}`, 3500);
    } finally {
      setBusy(null);
    }
  };

  const removeMember = async (m: Member) => {
    if (m.id === user.workspaceMemberId) return;
    if (!window.confirm(`حذف ${personName(m)} از فضای کاری؟`)) return;
    setBusy(m.id);
    try {
      await deleteMember(m.id);
      await reload();
      flash('کاربر حذف شد ✓');
    } catch (err) {
      flash(`خطا: ${err instanceof Error ? err.message : ''}`, 3500);
    } finally {
      setBusy(null);
    }
  };

  const saveName = async (firstName: string, lastName: string) => {
    if (!editing) return;
    setBusy(editing.id);
    try {
      await updateMemberName(editing.id, firstName, lastName);
      setEditing(null);
      await reload();
      flash('نام به‌روزرسانی شد ✓');
    } catch (err) {
      flash(`خطا: ${err instanceof Error ? err.message : ''}`, 3500);
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>مدیریت کاربران</h1>
          <div className="sub">
            {data &&
              `${toPersianDigits(data.members.length)} کاربر · ${toPersianDigits(
                data.roles.length,
              )} گروه (نقش)`}
          </div>
        </div>
      </div>

      {error !== null && (
        <div className="error-banner">
          دسترسی به مدیریت کاربران ندارید یا خطایی رخ داد: {error}
        </div>
      )}

      {data === null && error === null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 56 }} />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* Invite member */}
          <div className="card anim d1" style={{ marginBottom: 16 }}>
            <div className="card-pad" style={{ paddingBottom: 6 }}>
              <h3>دعوت کاربر جدید</h3>
              <div className="sub">ایمیل کاربر و نقش او را وارد کنید</div>
            </div>
            <div className="card-pad" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                className="btn line sm"
                dir="ltr"
                type="email"
                placeholder="email@example.com"
                style={{ flex: 1, minWidth: 180 }}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <select
                className="btn line sm"
                style={{ cursor: 'pointer', minWidth: 150 }}
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                <option value="">بدون نقش…</option>
                {data.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button
                className="btn sm"
                disabled={busy === 'invite' || !inviteEmail.trim()}
                onClick={submitInvite}
              >
                دعوت
              </button>
            </div>
            {inviteLink && (
              <div
                className="card-pad"
                style={{ display: 'flex', gap: 8, alignItems: 'center' }}
              >
                <input
                  className="btn line sm"
                  dir="ltr"
                  readOnly
                  style={{ flex: 1 }}
                  value={inviteLink}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button className="btn line sm" onClick={() => copy(inviteLink)}>
                  کپی لینک
                </button>
              </div>
            )}
          </div>

          {/* Pending invitations */}
          {data.invitations.length > 0 && (
            <div className="card anim d1" style={{ marginBottom: 16 }}>
              <div className="card-pad" style={{ paddingBottom: 6 }}>
                <h3>دعوت‌های در انتظار</h3>
              </div>
              {data.invitations.map((inv) => (
                <div className="task" key={inv.id}>
                  <div className="t-main" style={{ cursor: 'default' }}>
                    <div className="t-title" dir="ltr" style={{ justifyContent: 'flex-end' }}>
                      {inv.email}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {inv.link && (
                      <button className="btn line sm" onClick={() => copy(inv.link!)}>
                        کپی لینک
                      </button>
                    )}
                    <button
                      className="btn line sm"
                      disabled={busy === inv.id}
                      onClick={() => resendInvite(inv.id)}
                    >
                      ارسال مجدد
                    </button>
                    <button
                      className="btn line sm"
                      disabled={busy === inv.id}
                      onClick={() => removeInvite(inv.id)}
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Members */}
          <div className="card anim d1" style={{ marginBottom: 16 }}>
            <div className="card-pad" style={{ paddingBottom: 6 }}>
              <h3>کاربران</h3>
              <div className="sub">گروه هر کاربر را از ستون نقش تغییر دهید</div>
            </div>
            {data.members.map((m) => (
              <div className="task" key={m.id}>
                <span className="avatar av-26">{m.name.firstName.charAt(0)}</span>
                <div className="t-main" style={{ cursor: 'default' }}>
                  <div className="t-title">{personName(m)}</div>
                  <div className="t-sub" dir="ltr" style={{ justifyContent: 'flex-end' }}>
                    {m.userEmail ?? ''}
                  </div>
                </div>
                <select
                  className="btn line sm"
                  style={{ cursor: 'pointer', minWidth: 150 }}
                  disabled={busy === m.id || m.id === user.workspaceMemberId}
                  value={roleOfMember(m.id) ?? ''}
                  onChange={(e) => e.target.value && changeRole(m.id, e.target.value)}
                >
                  <option value="">بدون نقش…</option>
                  {data.roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <button
                  className="btn line sm"
                  disabled={busy === m.id}
                  onClick={() => setEditing(m)}
                >
                  ویرایش
                </button>
                {m.id !== user.workspaceMemberId && (
                  <button
                    className="btn line sm"
                    disabled={busy === m.id}
                    onClick={() => removeMember(m)}
                  >
                    حذف
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Roles */}
          <div className="card anim d2">
            <div className="card-pad" style={{ paddingBottom: 6 }}>
              <h3>گروه‌ها (نقش‌ها)</h3>
              <div className="sub">
                دسترسی‌های دقیق هر گروه از Settings → Roles در خود CRM تنظیم می‌شود
              </div>
            </div>
            {data.roles.map((r) => (
              <div className="task" key={r.id}>
                <div className="t-main" style={{ cursor: 'default' }}>
                  <div className="t-title">{r.label}</div>
                </div>
                <span className="pill stage num">
                  {toPersianDigits(r.workspaceMembers.length)} عضو
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {editing && (
        <EditMemberModal
          member={editing}
          busy={busy === editing.id}
          onCancel={() => setEditing(null)}
          onSave={saveName}
        />
      )}

      {toast !== null && <div className="toast">{toast}</div>}
    </main>
  );
};
```

Note: this references an `EditMemberModal` component and imports `CurrentUser` + `Member`. `EditMemberModal` is added in Task 6; the `user` prop is wired in Task 6. Until then the file will not typecheck — that is expected; finish Task 6 before running typecheck.

- [ ] **Step 2: Commit (WIP — completes in Task 6)**

```bash
git add packages/twenty-sales-app/src/views/AdminView.tsx
git commit -m "feat(sales-app): admin invite + pending invitations UI (wip)"
```

---

## Task 6: Sales app — Edit/delete member modal + wire the `user` prop

**Files:**
- Modify: `packages/twenty-sales-app/src/views/AdminView.tsx`
- Modify: `packages/twenty-sales-app/src/App.tsx:214`

- [ ] **Step 1: Add the EditMemberModal component**

Append to the end of `packages/twenty-sales-app/src/views/AdminView.tsx`:

```tsx
type EditMemberModalProps = {
  member: Member;
  busy: boolean;
  onCancel: () => void;
  onSave: (firstName: string, lastName: string) => void;
};

const EditMemberModal = ({ member, busy, onCancel, onSave }: EditMemberModalProps) => {
  const [firstName, setFirstName] = useState(member.name.firstName);
  const [lastName, setLastName] = useState(member.name.lastName);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-pad">
          <h3>ویرایش کاربر</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            <input
              className="btn line sm"
              placeholder="نام"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <input
              className="btn line sm"
              placeholder="نام خانوادگی"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <button className="btn line sm" onClick={onCancel}>
              انصراف
            </button>
            <button
              className="btn sm"
              disabled={busy || !firstName.trim()}
              onClick={() => onSave(firstName.trim(), lastName.trim())}
            >
              ذخیره
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
```

Note: `.modal-backdrop` / `.modal` classes — confirm they exist in the app's CSS (`src/index.css` or similar) with `rg -n "modal-backdrop|\.modal" packages/twenty-sales-app/src`. If absent, add minimal styles: a fixed full-screen flex-centered backdrop (`position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:50`) and a `.modal` card (`background:var(--card);border-radius:14px;max-width:340px;width:90%`), matching the app's existing `--card` variables.

- [ ] **Step 2: Pass the `user` prop from App.tsx**

In `packages/twenty-sales-app/src/App.tsx`, change line 214 from:

```tsx
    view = <AdminView />;
```

to:

```tsx
    view = <AdminView user={user} />;
```

(`user` is already in scope — every sibling view uses it.)

- [ ] **Step 3: Typecheck the sales app**

Run: `cd packages/twenty-sales-app && npx tsc --noEmit`
Expected: PASS (no type errors; `AdminView`, `EditMemberModal`, `user` prop all resolve).

- [ ] **Step 4: Re-run the api unit tests**

Run: `cd packages/twenty-sales-app && npx vitest run`
Expected: PASS (6 tests, unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/twenty-sales-app/src/views/AdminView.tsx packages/twenty-sales-app/src/App.tsx
git commit -m "feat(sales-app): edit/delete member + self-guard in admin screen"
```

---

## Task 7: End-to-end verification (dev)

**Files:** none (manual verification via the running app).

- [ ] **Step 1: Start the dev stack**

Ensure services + servers are up (`bash packages/twenty-utils/setup-dev-env.sh`, then the server + sales app dev server on port 3012). The sales app proxies `/graphql` + `/metadata` to `SALES_API_TARGET`.

- [ ] **Step 2: Confirm the role exists and is assignable**

Log in as admin → open `#/admin`. Expected: "Competitor Researcher" appears in every role `<select>` and in the roles list.

- [ ] **Step 3: Invite a member + copy link**

In "دعوت کاربر جدید" enter a throwaway email + pick a role → دعوت. Expected: a copyable invite link appears and the invite shows under "دعوت‌های در انتظار". Open the link in a private window and confirm it lands on the Twenty accept-invite screen with the email prefilled.

- [ ] **Step 4: Edit a member name**

Click ویرایش on a test member, change the name, ذخیره. Expected: toast "نام به‌روزرسانی شد" and the list shows the new name after refresh. If the server rejects the `update` JSON shape, adjust `updateMemberName` in `admin.ts` (Task 4) to the shape the server expects and re-verify.

- [ ] **Step 5: Delete a throwaway member + self-guard**

Confirm your own row has no حذف button and its role `<select>` is disabled. Delete a throwaway member and confirm it disappears.

- [ ] **Step 6: Verify the role restricts a researcher**

Assign "Competitor Researcher" to a test member, log in as them: confirm they can open a competitor and edit it, can read leads, and that `#/admin` shows the access-denied banner (not a crash).

- [ ] **Step 7: Final commit (if any tweaks were made)**

```bash
git add -A && git commit -m "fix(sales-app): adjustments from admin member-management E2E"
```

---

## Rollout (production — crm.hamagan.com)

1. Deploy the `twenty-server` change (Tasks 1–2) via the normal server deploy.
2. Run `node tools/sales-crm/provision-competitor-researcher-role.mjs` against prod with `TWENTY_META`/`TWENTY_ORIGIN`/`TWENTY_API_KEY` (or email/password) pointed at prod — same as prior object-provisioning steps.
3. Build + deploy the `twenty-sales-app` (Tasks 3–6) to `/sales/`.
```
