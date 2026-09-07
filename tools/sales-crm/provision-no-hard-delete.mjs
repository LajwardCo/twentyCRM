// "Soft delete for everything, no hard delete anywhere."
//
// Twenty has two removals. `delete<Object>` sets deletedAt: the record leaves
// every list but stays in the trash view and can be restored. `destroy<Object>`
// erases the row. This script denies the second one to every role on every
// object, so the trash is the only removal path that exists on the instance --
// including for the workspace owner, whose Admin role ships with
// canDestroyAllObjectRecords: true.
//
// It does NOT touch anyone's soft-delete rights by default. Which records a
// role may remove is a policy decision the other provisioning scripts already
// make deliberately and differently -- provision-external-partners.mjs lets an
// external marketer remove their own notes and tasks but never a lead, and
// provision-permissions.mjs withholds it on subscription and dailyReport. A
// blanket "can update, therefore can delete" rule would quietly overrule all of
// them, which is a wider grant than "stop hard deletes" ever asked for.
// --grant-soft-delete opts into that behaviour where it is genuinely wanted.
//
// KNOWN CEILING (measured on prod 2026-09-07): the Admin role CANNOT be changed
// through the API. It is part of the twenty-standard-application manifest with
// isEditable: false, and validate-role-is-editable.util.ts rejects the update
// with ROLE_NOT_EDITABLE at the migration-builder layer. Editing the row in
// Postgres directly is not a fix either -- the standard application reconciles
// drift on sync, so it would silently revert.
//
// Nor can the Admin holders simply be moved to a destroy-less custom role:
// user-role.service.ts raises CANNOT_UNASSIGN_LAST_ADMIN, so at least one
// account must keep it.
//
// The script therefore reports Admin as NOT applied and exits non-zero rather
// than implying a lockdown it did not achieve. Closing that last gap means
// patching the fork's own manifest (canDestroyAllObjectRecords: false in
// engine/workspace-manager/twenty-standard-application/utils/role-metadata/
// create-standard-flat-role-metadata.util.ts) and deploying -- which is durable
// precisely because sync then enforces it.
//
// Idempotent, and reversible: --allow-admin-destroy restores the Admin role's
// destroy flag if a genuine erasure request ever has to be honoured.
//
// Usage:
//   node provision-no-hard-delete.mjs                  # deny destroy everywhere
//   node provision-no-hard-delete.mjs --dry-run        # report, change nothing
//   node provision-no-hard-delete.mjs --allow-admin-destroy
//   node provision-no-hard-delete.mjs --grant-soft-delete
const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';

const DRY_RUN = process.argv.includes('--dry-run');
const ALLOW_ADMIN_DESTROY = process.argv.includes('--allow-admin-destroy');
const GRANT_SOFT_DELETE = process.argv.includes('--grant-soft-delete');

// Deleting one of these takes the records that point at it with it, so even
// --grant-soft-delete leaves them alone.
const NEVER_AUTO_SOFT_DELETABLE = new Set(['company', 'person', 'workspaceMember']);

let TOKEN = process.env.TWENTY_TOKEN ?? null;

async function gql(query, variables) {
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
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function login() {
  if (TOKEN) return;
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
  await login();

  const roleData = await gql(`query {
    getRoles {
      id
      label
      canDestroyAllObjectRecords
      canSoftDeleteAllObjectRecords
      canUpdateAllObjectRecords
      objectPermissions {
        objectMetadataId
        canReadObjectRecords
        canUpdateObjectRecords
        canSoftDeleteObjectRecords
        canDestroyObjectRecords
      }
    }
  }`);

  const objectData = await gql(
    `query { objects(paging:{first:500}) { edges { node { id nameSingular isSystem } } } }`,
  );
  const objects = objectData.objects.edges
    .map((e) => e.node)
    // Permissions on system objects are rejected outright
    // (CANNOT_ADD_OBJECT_PERMISSION_ON_SYSTEM_OBJECT); their access follows the
    // record they hang off, so denying destroy on the parent covers them.
    .filter((o) => !o.isSystem);
  const nameById = Object.fromEntries(objects.map((o) => [o.id, o.nameSingular]));

  console.log(
    `${roleData.getRoles.length} roles, ${objects.length} non-system objects\n`,
  );

  const refused = [];

  for (const role of roleData.getRoles) {
    const isAdminRole = role.label === 'Admin';
    const destroyAllowed = isAdminRole && ALLOW_ADMIN_DESTROY;

    // Roles are the coarse switch: canDestroyAllObjectRecords overrides every
    // per-object flag, so it has to come down first or the rest is decorative.
    // Member and Object-restricted ship with it on, which is where most staff
    // accounts actually get their destroy rights from -- not from Admin.
    if (role.canDestroyAllObjectRecords !== destroyAllowed) {
      console.log(
        `role "${role.label}": canDestroyAllObjectRecords ${role.canDestroyAllObjectRecords} -> ${destroyAllowed}`,
      );
      if (!DRY_RUN) {
        try {
          await gql(
            `mutation($id: UUID!, $update: UpdateRolePayload!) {
              updateOneRole(updateRoleInput: { id: $id, update: $update }) { id }
            }`,
            { id: role.id, update: { canDestroyAllObjectRecords: destroyAllowed } },
          );
        } catch (error) {
          // Admin is flagged isEditable: false. There is no guard on the update
          // path today, but if a server version adds one, say so plainly rather
          // than reporting a lockdown that did not happen.
          refused.push(`${role.label} (role flag): ${error.message}`);
        }
      }
    }

    const existing = role.objectPermissions ?? [];
    const changes = [];

    for (const permission of existing) {
      const name = nameById[permission.objectMetadataId];
      if (!name) continue;

      // Left exactly as found unless explicitly asked to widen it.
      const softDelete =
        permission.canSoftDeleteObjectRecords ||
        (GRANT_SOFT_DELETE &&
          permission.canUpdateObjectRecords &&
          !NEVER_AUTO_SOFT_DELETABLE.has(name));

      if (
        permission.canDestroyObjectRecords === false &&
        permission.canSoftDeleteObjectRecords === softDelete
      ) {
        continue;
      }

      changes.push({
        objectMetadataId: permission.objectMetadataId,
        canReadObjectRecords: permission.canReadObjectRecords,
        canUpdateObjectRecords: permission.canUpdateObjectRecords,
        canSoftDeleteObjectRecords: softDelete,
        canDestroyObjectRecords: false,
      });

      const notes = [];
      if (permission.canDestroyObjectRecords) notes.push('destroy denied');
      if (permission.canSoftDeleteObjectRecords !== softDelete)
        notes.push(`soft delete -> ${softDelete}`);
      console.log(`  ${role.label} / ${name}: ${notes.join(', ')}`);
    }

    if (changes.length > 0 && !DRY_RUN) {
      try {
        await gql(
          `mutation($upsertObjectPermissionsInput: UpsertObjectPermissionsInput!) {
            upsertObjectPermissions(upsertObjectPermissionsInput:$upsertObjectPermissionsInput) { objectMetadataId }
          }`,
          { upsertObjectPermissionsInput: { roleId: role.id, objectPermissions: changes } },
        );
      } catch (error) {
        refused.push(`${role.label} (object permissions): ${error.message}`);
      }
    }
  }

  if (refused.length > 0) {
    console.error('\nNOT applied:');
    for (const line of refused) console.error(`  ${line}`);
    console.error(
      '\nHard delete is still reachable through the roles listed above. Fix those before treating this as done.',
    );
    process.exit(1);
  }

  console.log(
    DRY_RUN
      ? '\nDry run — nothing was written.'
      : `\nDone. Hard delete is ${ALLOW_ADMIN_DESTROY ? 'denied to every role except Admin' : 'denied to every role, Admin included'}.`,
  );
  console.log('Verify with: node provision-no-hard-delete.mjs --dry-run (expect no changes).');
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
