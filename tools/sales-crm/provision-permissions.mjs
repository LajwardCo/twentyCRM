// Phase 3: "Seller" role with object-level and field-level permissions.
//
// Seller role: read+update on the sales objects a seller actually works
// (Opportunity, Person, Company, Task, Note, Deal Product, Quotation,
// Subscription); READ-ONLY on the catalog objects (Product, Partner) so
// sellers can quote from the catalog but not edit it. Field permission hides
// Product.maxDiscountPercent from Sellers — they shouldn't see the internal
// discount ceiling (the ceiling is still enforced server-side regardless,
// see the PRE query hook in packages/twenty-server/src/modules/sales-crm/).
//
// NOT INCLUDED: row-level ("a seller only sees their OWN opportunities")
// permission predicates. Twenty gates this behind an Enterprise license --
// attempting to set one returns "Row level permission predicate feature is
// disabled" (ROW_LEVEL_PERMISSION_FEATURE_DISABLED), and there's no simple
// config-variable override (checked config-variables.ts — nothing there).
// This is a real licensing boundary, not a bug to route around. If "sellers
// only see their own deals" becomes a hard requirement, that needs either an
// Enterprise license or a custom PRE-hook-based filter (same code-level
// mechanism as the discount-ceiling hook), not a metadata-only fix.
const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';
const ROLE_LABEL = 'Seller';

let TOKEN = null;
async function gql(query, variables) {
  const res = await fetch(META, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}
async function login() {
  const a = await gql(`mutation($e:String!,$p:String!,$o:String!){getLoginTokenFromCredentials(email:$e,password:$p,origin:$o){loginToken{token}}}`, { e: EMAIL, p: PASSWORD, o: ORIGIN });
  const b = await gql(`mutation($t:String!,$o:String!){getAuthTokensFromLoginToken(loginToken:$t,origin:$o){tokens{accessOrWorkspaceAgnosticToken{token}}}}`, { t: a.getLoginTokenFromCredentials.loginToken.token, o: ORIGIN });
  TOKEN = b.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;
}

async function main() {
  await login();

  const d = await gql(`query { objects(paging:{first:500}) { edges { node {
    id nameSingular
    fields(paging:{first:500}) { edges { node { id name } } }
  } } } }`);
  const objs = {};
  for (const { node } of d.objects.edges) objs[node.nameSingular] = { id: node.id, fields: Object.fromEntries(node.fields.edges.map((e) => [e.node.name, e.node.id])) };

  const existing = await gql(`query { getRoles { id label } }`);
  let roleId = existing.getRoles.find((r) => r.label === ROLE_LABEL)?.id;

  if (roleId) {
    console.log('SKIP: role exists', roleId);
  } else {
    const created = await gql(`mutation($createRoleInput: CreateRoleInput!){ createOneRole(createRoleInput:$createRoleInput){ id label } }`, {
      createRoleInput: {
        label: ROLE_LABEL,
        description: "Sales rep: sees and works deals; catalog is read-only; cannot see the internal discount ceiling.",
        icon: 'IconUserDollar',
        canUpdateAllSettings: false,
        canAccessAllTools: false,
        canReadAllObjectRecords: false,
        canUpdateAllObjectRecords: false,
        canSoftDeleteAllObjectRecords: false,
        canDestroyAllObjectRecords: false,
        canOnlyAccessOwnedRecords: false,
        canBeAssignedToUsers: true,
      },
    });
    roleId = created.createOneRole.id;
    console.log('created role:', roleId);
  }

  // dailyReport: sellers create + edit their own end-of-day report (read+update,
  // no delete). Without this grant the Seller role (canReadAllObjectRecords=false)
  // gets permission-denied on the End-of-Day report even once the object exists.
  const readWrite = ['opportunity', 'person', 'company', 'task', 'note', 'dealProduct', 'quotation', 'subscription', 'dailyReport'];
  const readOnly = ['product', 'partner'];
  // Skip (with a warning) any object not present in this workspace instead of
  // crashing on objs[n].id — lets the script run cleanly even if a later object
  // (e.g. dailyReport) hasn't been provisioned in the target environment yet.
  const present = (n) => { if (!objs[n]) { console.warn(`  skip: object '${n}' not found in this workspace`); return false; } return true; };
  const objectPermissions = [
    ...readWrite.filter(present).map((n) => ({ objectMetadataId: objs[n].id, canReadObjectRecords: true, canUpdateObjectRecords: true, canSoftDeleteObjectRecords: false, canDestroyObjectRecords: false })),
    ...readOnly.filter(present).map((n) => ({ objectMetadataId: objs[n].id, canReadObjectRecords: true, canUpdateObjectRecords: false, canSoftDeleteObjectRecords: false, canDestroyObjectRecords: false })),
  ];
  await gql(`mutation($upsertObjectPermissionsInput: UpsertObjectPermissionsInput!){ upsertObjectPermissions(upsertObjectPermissionsInput:$upsertObjectPermissionsInput){ objectMetadataId canReadObjectRecords canUpdateObjectRecords } }`, {
    upsertObjectPermissionsInput: { roleId, objectPermissions },
  });
  console.log('object permissions set for', objectPermissions.length, 'objects');

  await gql(`mutation($upsertFieldPermissionsInput: UpsertFieldPermissionsInput!){ upsertFieldPermissions(upsertFieldPermissionsInput:$upsertFieldPermissionsInput){ objectMetadataId fieldMetadataId canReadFieldValue } }`, {
    upsertFieldPermissionsInput: {
      roleId,
      fieldPermissions: [
        { objectMetadataId: objs.product.id, fieldMetadataId: objs.product.fields.maxDiscountPercent, canReadFieldValue: false, canUpdateFieldValue: false },
      ],
    },
  });
  console.log('field permission set: Product.maxDiscountPercent hidden from Seller');

  console.log('\nDone. Assign the "Seller" role to workspace members via Settings > Roles in the UI (no bulk-assign API endpoint found).');
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
