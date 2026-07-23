# Sales App: Member Management + Competitor Researcher Role

**Date:** 2026-07-23
**Status:** Approved design
**Scope:** `packages/twenty-sales-app` (SPA), one contained `packages/twenty-server` change, one provisioning script under `packages/twenty-sales-app/tools/sales-crm/`.

## Problem

The Sales app (`twenty-sales-app`, a standalone Vite/React RTL SPA served at `/sales/`) has an
admin screen (`AdminView`) that can only **reassign** existing roles to existing members. It
explicitly defers role creation and member add/remove to the real Twenty CRM
(«... از Settings → Roles در خود CRM انجام می‌شود»). Two gaps:

1. There is no dedicated **Competitor Researcher** role.
2. Team members cannot be **added, edited, or deleted** from the Sales UI.

## Goals

- A named "Competitor Researcher" role exists and is assignable from the existing AdminView role picker.
- From the Sales AdminView, an authorized admin can invite (add), edit, and remove members.

## Non-goals

- A general-purpose role builder / permission editor in the Sales UI (fine-grained permission
  edits stay in the CRM).
- Direct password-based account creation (Twenty is invitation-based; not pursued).
- Any change to how the main `twenty-front` settings work.

## Background (verified in code)

- Auth/data: `src/api/client.ts` exposes `coreQuery` (`/graphql`) and `metadataQuery` (`/metadata`),
  JWT bearer from `localStorage.salesAppAuth`. No Apollo, no router lib.
- Roles live on the **metadata** schema: `getRoles`, `createOneRole(CreateRoleInput!)`,
  `updateOneRole`, `deleteOneRole(roleId)`, `upsertPermissionFlags(UpsertPermissionFlagsInput!)`,
  `upsertObjectPermissions(UpsertObjectPermissionsInput!)`, `updateWorkspaceMemberRole(workspaceMemberId, roleId)`.
  `RoleEntity` carries coarse flags (`canReadAllObjectRecords`, `canUpdateAllObjectRecords`,
  `canOnlyAccessOwnedRecords`, `canUpdateAllSettings`, `canBeAssignedToUsers`, `isEditable`, `label`, `icon`, …).
- Members live on the **core** schema:
  - Add → `sendInvitations(emails: [String!]!, roleId: UUID)` → `SendInvitations { success, errors, result: [WorkspaceInvitation] }` (invitation-based).
  - Pending list → `findWorkspaceInvitations: [WorkspaceInvitation]`; `resendWorkspaceInvitation(appTokenId)`; `deleteWorkspaceInvitation(appTokenId)`.
  - Edit → `updateWorkspaceMemberSettings(input)`; role edit already wired via `assignRole`.
  - Delete → `deleteUserFromWorkspace(workspaceMemberIdToDelete: String!)`.
- Everything is gated server-side by `SettingsPermissionGuard(ROLES)` / `SettingsPermissionGuard(WORKSPACE_MEMBERS)`.
  The current admin passes; a Competitor Researcher would not.
- **Invite-link constraint:** the invite token is `appToken.value`, stored **plaintext**, but the
  `WorkspaceInvitation` GraphQL DTO returns only `{ id, email, roleId, expiresAt }` — no token.
  A copyable link therefore requires exposing the invite URL on the DTO (small server change).
- The competitor object is `competitor` (queries: `competitors`, `createCompetitor`, `updateCompetitor`).
  A provisioning-script convention already exists: `tools/sales-crm/provision-*.mjs`.

## Design

### Feature 1 — Competitor Researcher role

**Permission set (Research-focused):**

| Setting | Value |
|---|---|
| `label` | `Competitor Researcher` (UI shows Farsi «پژوهشگر رقبا») |
| `icon` | `IconBinoculars` (or similar) |
| `canReadAllObjectRecords` | `true` |
| `canUpdateAllObjectRecords` | `false` |
| `canOnlyAccessOwnedRecords` | `false` |
| `canUpdateAllSettings` | `false` |
| settings/tool permission flags | none |
| `canBeAssignedToUsers` | `true` |
| `isEditable` | `true` |
| per-object write | `upsertObjectPermissions` → `canUpdateObjectRecords: true` on the **competitor** (and **catalog**) object metadata IDs |

Net effect: reads everything for context, can create/edit competitor + catalog records, cannot
manage members/roles/settings.

**Delivery — idempotent provisioning script** `packages/twenty-sales-app/tools/sales-crm/provision-competitor-researcher-role.mjs`,
following the existing `tools/sales-crm/provision-*.mjs` pattern (env-driven base URL + admin token, metadata API):

1. `getRoles` → if a role labelled `Competitor Researcher` exists, exit (no-op / idempotent).
2. `createOneRole` with the flags above.
3. Query metadata `objects` to resolve `competitor` (and `catalog`) `objectMetadataId` by `nameSingular`.
4. `upsertObjectPermissions(roleId, [{ objectMetadataId, canUpdateObjectRecords: true, canReadObjectRecords: true }])`.
5. Log the resulting role id.

Once present, the role is returned by `getRoles` and appears automatically in the AdminView role
`<select>` — **no client change is required to assign it.** (Confirm `fetchRoles` in `admin.ts`
does not filter it out; the current `.filter((r) => r.label !== 'Admin' || true)` is a no-op and
passes everything.)

### Feature 2 — Member management in AdminView

**Backend change (twenty-server, contained):** add an invite-URL field to the workspace-invitation
DTO so the client can render a copyable link.

- Extend `WorkspaceInvitation` DTO (`.../workspace-invitation/dtos/workspace-invitation.dto.ts`) with a
  nullable `link: String` (or `inviteToken`) field.
- Populate it in `castAppTokenToWorkspaceInvitationUtil` (and/or the send path) from the plaintext
  `appToken.value` + workspace invite hash via the existing `buildWorkspaceURL(...)` helper — the
  same URL Twenty emails.
- Both `sendInvitations.result[]` and `findWorkspaceInvitations` then carry a ready-to-copy link.
- No schema-breaking change: additive nullable field. Ships via the normal server deploy.
- Regenerate front GraphQL types only if the main `twenty-front` consumes it (the Sales app does not
  use codegen — it hand-writes queries).

**Client changes** — `src/api/admin.ts` (new functions) + `src/views/AdminView.tsx` (UI):

New `admin.ts` functions:
- `type Invitation = { id; email; roleId: string | null; expiresAt: string; link: string | null }`.
- `inviteMember(email, roleId?) : Promise<Invitation[]>` → `sendInvitations(emails: [email], roleId)`,
  returns `result` (surface `errors`).
- `fetchInvitations() : Promise<Invitation[]>` → `findWorkspaceInvitations`.
- `resendInvitation(appTokenId)` → `resendWorkspaceInvitation`.
- `deleteInvitation(appTokenId)` → `deleteWorkspaceInvitation`.
- `updateMemberName(workspaceMemberId, firstName, lastName)` → `updateWorkspaceMemberSettings`.
- `deleteMember(workspaceMemberId)` → `deleteUserFromWorkspace(workspaceMemberIdToDelete)`.

`AdminView.tsx` UI (matching existing Farsi/RTL card styling):
- **Add member** panel: email input + role `<select>` → `inviteMember` → on success show the returned
  `link` with a copy button + toast (link works whether or not SMTP is configured).
- **Pending invitations** list (from `fetchInvitations`): email, role, expiry, copy-link, resend, delete.
- **Members** list (existing): keep inline role `<select>`; add an **Edit** control (first/last name)
  and a **Delete** control behind a confirm dialog.
- **Guards:** disable delete/role-change on the current user (`currentUser.workspaceMemberId`) — the
  server already blocks self role-change; mirror it in the UI to avoid a confusing error.
- **Error handling:** existing AdminView pattern already renders an "access denied" banner when
  role/member queries fail; extend the same treatment to invite/delete failures (a Competitor
  Researcher hitting this screen sees the banner, no crash).
- Invalidate the `admin:members-roles` cache after any mutation so the lists refresh.

## Data flow

```
AdminView ──inviteMember(email, roleId)──▶ coreQuery sendInvitations ──▶ { link } ──▶ copy UI
AdminView ──deleteMember(id)────────────▶ coreQuery deleteUserFromWorkspace
AdminView ──updateMemberName(...)───────▶ coreQuery updateWorkspaceMemberSettings
AdminView ──assignRole(id, roleId)──────▶ metadataQuery updateWorkspaceMemberRole   (existing)
provision-competitor-researcher-role.mjs ──▶ metadataQuery createOneRole + upsertObjectPermissions
```

## Testing

- **Provisioning script:** run twice against a dev workspace — second run is a no-op; verify the role
  appears in `getRoles` with the expected flags and competitor write permission (Postgres MCP /
  metadata query).
- **admin.ts:** vitest unit tests mocking `coreQuery`/`metadataQuery` — assert each new function issues
  the right operation + variables and maps the response (esp. `inviteMember` returning `link`,
  `errors` surfaced).
- **Manual E2E (dev):** log in as admin → invite an email → copy link → open in a fresh session and
  confirm the accept-invite flow; edit a member name; delete a throwaway member; assign the new role
  and confirm a member with it can edit a competitor but is blocked from the admin screen.
- **Backend field:** verify `sendInvitations` and `findWorkspaceInvitations` return a non-null `link`
  matching the emailed URL shape.

## Risks / mitigations

- **Self-delete / self-role-change:** disable in UI; server already blocks role change.
- **Missing SMTP:** copy-link covers it — invites are usable without email.
- **Permission errors for non-admins:** surfaced via the existing access-denied banner, not a crash.
- **Backend field regen:** additive nullable field; no breaking change; Sales app hand-writes queries.

## Rollout

1. Land the twenty-server invite-`link` field; deploy server.
2. Run `provision-competitor-researcher-role.mjs` against prod (crm.hamagan.com), same as prior
   object-provisioning steps.
3. Ship the twenty-sales-app AdminView + admin.ts changes to `/sales/`.
