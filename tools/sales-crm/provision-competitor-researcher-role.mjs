// "Competitor Researcher" role: full read+write on the competitor research
// objects (competitor, competitorProduct, competitorUpdate, competitorUsage)
// plus notes/tasks/attachments for research write-ups; read-only context on
// company/person/opportunity/product; no settings access.
//
// Idempotent — safe to re-run. Same auth pattern as provision-permissions.mjs;
// supports TWENTY_TOKEN bearer for API-key-less credential runs on prod.
const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';
const ROLE_LABEL = 'Competitor Researcher';

let TOKEN = process.env.TWENTY_TOKEN ?? null;
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
  if (TOKEN) return;
  const a = await gql(`mutation($e:String!,$p:String!,$o:String!){getLoginTokenFromCredentials(email:$e,password:$p,origin:$o){loginToken{token}}}`, { e: EMAIL, p: PASSWORD, o: ORIGIN });
  const b = await gql(`mutation($t:String!,$o:String!){getAuthTokensFromLoginToken(loginToken:$t,origin:$o){tokens{accessOrWorkspaceAgnosticToken{token}}}}`, { t: a.getLoginTokenFromCredentials.loginToken.token, o: ORIGIN });
  TOKEN = b.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;
}

async function main() {
  await login();

  const d = await gql(`query { objects(paging:{first:500}) { edges { node { id nameSingular } } } }`);
  const objs = {};
  for (const { node } of d.objects.edges) objs[node.nameSingular] = node.id;

  const researchObjects = ['competitor', 'competitorProduct', 'competitorUpdate', 'competitorUsage'];
  const missing = researchObjects.filter((n) => !objs[n]);
  if (missing.length) throw new Error(`competitor objects missing on this instance: ${missing.join(', ')} — provision them first`);

  const existing = await gql(`query { getRoles { id label } }`);
  let roleId = existing.getRoles.find((r) => r.label === ROLE_LABEL)?.id;

  if (roleId) {
    console.log('SKIP: role exists', roleId);
  } else {
    const created = await gql(`mutation($createRoleInput: CreateRoleInput!){ createOneRole(createRoleInput:$createRoleInput){ id label } }`, {
      createRoleInput: {
        label: ROLE_LABEL,
        description: 'Researches competitors: full access to competitor data, notes and tasks; read-only on CRM context.',
        icon: 'IconSpy',
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

  // note/task only — their *Target join objects and attachments are system
  // objects whose access follows the parent, and permissions on them are
  // rejected with CANNOT_ADD_OBJECT_PERMISSION_ON_SYSTEM_OBJECT.
  const readWrite = [...researchObjects, 'note', 'task'].filter((n) => objs[n]);
  const readOnly = ['company', 'person', 'opportunity', 'product'].filter((n) => objs[n]);

  const objectPermissions = [
    ...readWrite.map((n) => ({ objectMetadataId: objs[n], canReadObjectRecords: true, canUpdateObjectRecords: true, canSoftDeleteObjectRecords: true, canDestroyObjectRecords: false })),
    ...readOnly.map((n) => ({ objectMetadataId: objs[n], canReadObjectRecords: true, canUpdateObjectRecords: false, canSoftDeleteObjectRecords: false, canDestroyObjectRecords: false })),
  ];
  await gql(`mutation($upsertObjectPermissionsInput: UpsertObjectPermissionsInput!){ upsertObjectPermissions(upsertObjectPermissionsInput:$upsertObjectPermissionsInput){ objectMetadataId } }`, {
    upsertObjectPermissionsInput: { roleId, objectPermissions },
  });
  console.log(`object permissions set: rw[${readWrite.join(',')}] ro[${readOnly.join(',')}]`);
  console.log('\nDone. Assign the role from the sales app (مدیریت کاربران) or Settings > Roles.');
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
