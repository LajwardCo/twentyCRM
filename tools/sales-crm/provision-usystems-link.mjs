// tools/sales-crm/provision-usystems-link.mjs
// The link between a CRM record and its counterpart in Usystems Core:
//   company.usystemsContactId          — TEXT, the Core Contact id the client
//                                         is registered as. Written once by the
//                                         Sales UI when an order is first issued.
//   opportunity.usystemsSalesOrderCode — TEXT, the code of the MOST RECENTLY
//                                         issued Sales Order for this lead.
//   opportunity.usystemsSalesOrderId   — TEXT, its Core id (for re-printing).
//   opportunity.usystemsSalesOrderValidUntil — DATE, that order's deadline.
//
// A lead can be issued more than one order over its life; the three
// opportunity fields hold only the latest, for display on the lead. Usystems
// Core remains the list of record -- re-issuing overwrites these and leaves the
// earlier order in Core untouched.
//
// TEXT rather than NUMBER for the ids so a Core id can never be mistaken for a
// CRM record id in a filter, and so it round-trips exactly.
//
// Idempotent: skips a field that already exists. Safe to re-run.
//
// Auth: TWENTY_TOKEN (workspace API key) skips the password login; otherwise
// TWENTY_EMAIL / TWENTY_PASSWORD (local dev defaults below).
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

const FIELDS_BY_OBJECT = {
  company: [
    {
      name: 'usystemsContactId',
      label: 'Usystems Contact',
      type: 'TEXT',
      icon: 'IconLink',
      description:
        'Id of this client in Usystems Core. Set by the Sales UI when the client is linked or registered while issuing a sales order.',
    },
  ],
  opportunity: [
    {
      name: 'usystemsSalesOrderCode',
      label: 'Sales Order',
      type: 'TEXT',
      icon: 'IconFileInvoice',
      description: 'Code of the most recently issued Usystems sales order for this lead.',
    },
    {
      name: 'usystemsSalesOrderId',
      label: 'Sales Order Id',
      type: 'TEXT',
      icon: 'IconHash',
      description: 'Usystems Core id of that sales order (used to re-print it).',
    },
    {
      name: 'usystemsSalesOrderValidUntil',
      label: 'Sales Order Valid Until',
      type: 'DATE',
      icon: 'IconCalendarDue',
      description: 'The deadline on the most recently issued sales order.',
    },
  ],
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
  const objects = d.objects.edges.map((e) => e.node);

  for (const [objectName, fields] of Object.entries(FIELDS_BY_OBJECT)) {
    const object = objects.find((o) => o.nameSingular === objectName);
    if (!object) throw new Error(`${objectName} object not found`);
    const existing = new Set(object.fields.edges.map((e) => e.node.name));

    for (const field of fields) {
      if (existing.has(field.name)) {
        console.log(`[skip]  field: ${objectName}.${field.name} — exists`);
        continue;
      }
      await gql(
        `mutation($input:CreateOneFieldMetadataInput!){createOneField(input:$input){id name}}`,
        { input: { field: { objectMetadataId: object.id, ...field } } },
      );
      console.log(`[created] field: ${objectName}.${field.name}`);
    }
  }

  console.log('\ndone.');
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
