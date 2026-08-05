// tools/sales-crm/provision-deletion-reason.mjs
// deletionReason — TEXT, on Opportunity, Task and Note.
//
// The Sales App never hard-deletes: "delete" means Twenty's soft delete, which
// sets deletedAt and leaves the record restorable from the CRM's trash view.
// Before it deletes, the app asks the seller why and writes the answer here, so
// a lead that vanished from the pipeline can still be accounted for — and so
// "why do we lose leads" is a question the CRM can answer rather than one that
// dies with the record.
//
// TEXT rather than SELECT for the same reason as product.brand: the reasons a
// lead gets removed are not a fixed list, and a SELECT would need
// re-provisioning every time a new one shows up.
//
// The app treats this field as optional -- an instance that has not run this
// script still deletes, filing the reason as a note on the lead instead. Run
// this to get the reason as a real, queryable field.
//
// Idempotent: skips a field that already exists. Safe to re-run.
//
// Auth: set TWENTY_TOKEN to a workspace API key (Settings > APIs & Webhooks) to
// skip the password login entirely -- preferable against production, where you
// don't want an admin password in your shell history. Otherwise it logs in with
// TWENTY_EMAIL / TWENTY_PASSWORD (local dev defaults below).
//
//   TWENTY_META=https://crm.hamagan.com/metadata \
//   TWENTY_ORIGIN=https://crm.hamagan.com \
//   TWENTY_TOKEN=<api key> \
//   node tools/sales-crm/provision-deletion-reason.mjs
const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';

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
  if (json.errors) throw new Error(JSON.stringify(json.errors.map((e) => e.message)));
  return json.data;
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

const TARGET_OBJECTS = ['opportunity', 'task', 'note'];

const FIELD = {
  name: 'deletionReason',
  label: 'Deletion Reason',
  type: 'TEXT',
  icon: 'IconTrashX',
  description:
    'Why this record was removed. Written by the Sales App just before a soft delete; the record itself stays recoverable in the trash.',
};

async function main() {
  if (TOKEN) {
    console.log('using TWENTY_TOKEN (API key).\n');
  } else {
    await login();
    console.log(`authenticated as ${EMAIL}.\n`);
  }

  const d = await gql(`query {
    objects(paging:{first:500}){ edges { node {
      id nameSingular
      fields(paging:{first:500}){ edges { node { name } } }
    } } }
  }`);

  const objects = new Map(d.objects.edges.map((e) => [e.node.nameSingular, e.node]));

  for (const name of TARGET_OBJECTS) {
    const object = objects.get(name);
    if (!object) {
      console.warn(`[skip]  object '${name}' not found in this workspace`);
      continue;
    }

    const existing = new Set(object.fields.edges.map((e) => e.node.name));
    if (existing.has(FIELD.name)) {
      console.log(`[skip]  field: ${name}.${FIELD.name} — exists`);
      continue;
    }

    await gql(
      `mutation($input:CreateOneFieldMetadataInput!){createOneField(input:$input){id name}}`,
      { input: { field: { objectMetadataId: object.id, ...FIELD } } },
    );
    console.log(`[created] field: ${name}.${FIELD.name}`);
  }

  console.log(
    '\ndone. Re-run provision-permissions.mjs so the Seller role can soft-delete.',
  );
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
