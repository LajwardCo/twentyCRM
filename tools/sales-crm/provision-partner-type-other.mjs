// Adds an `OTHER` option to the `partner.partnerType` SELECT.
//
// A referral can come from anyone -- a happy customer, the owner's cousin, a
// doctor met once at a clinic -- and the three working roles (Marketer, Seller,
// Partner) forced a wrong one on those people. OTHER is the catch-all the
// sales-app's referrer quick-add defaults to, so without this the app's "add a
// new referrer" dialog is rejected by the server.
//
// Idempotent: existing options are written back unchanged (ids included, so
// saved views and filters that reference an option keep pointing at it) and the
// script exits early once OTHER is present.
//
// Auth: TWENTY_TOKEN bearer (API key) or TWENTY_EMAIL/TWENTY_PASSWORD.
// Target: TWENTY_META (default http://localhost:3010/metadata).

const META = process.env.TWENTY_META || 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN || 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL || 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD || 'tim@apple.dev';

let TOKEN = null;

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
  if (json.errors) {
    throw new Error(JSON.stringify(json.errors.map((e) => e.message)));
  }
  return json.data;
}

async function login() {
  if (process.env.TWENTY_TOKEN) {
    TOKEN = process.env.TWENTY_TOKEN.trim();
    return;
  }
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
  console.log('-> login');
  await login();

  console.log('-> find partner.partnerType');
  const data = await gql(`query {
    objects(paging:{first:500}) { edges { node {
      nameSingular
      fields(paging:{first:500}) { edges { node { id name type options } } }
    } } }
  }`);

  const partner = data.objects.edges
    .map((edge) => edge.node)
    .find((node) => node.nameSingular === 'partner');
  if (!partner) {
    throw new Error(
      'partner object not found -- run provision-phase1.mjs first',
    );
  }

  const field = partner.fields.edges
    .map((edge) => edge.node)
    .find((node) => node.name === 'partnerType');
  if (!field) throw new Error('partner.partnerType field not found');

  const existing = field.options ?? [];
  if (existing.some((option) => option.value === 'OTHER')) {
    console.log('OTHER already present — nothing to do');
    return;
  }

  const options = [
    ...existing.map((option) => ({
      id: option.id,
      value: option.value,
      label: option.label,
      position: option.position,
      color: option.color,
    })),
    {
      value: 'OTHER',
      label: 'Other / General',
      position: existing.length,
      color: 'gray',
    },
  ];

  console.log('-> updateOneField partner.partnerType');
  const updated = await gql(
    `mutation($id:UUID!,$u:UpdateFieldInput!){updateOneField(input:{id:$id,update:$u}){id options}}`,
    { id: field.id, u: { options } },
  );
  console.log(
    'partnerType ->',
    updated.updateOneField.options.map((o) => o.value).join(' | '),
  );
}

main().catch((error) => {
  console.error('FATAL:', error.message);
  process.exit(1);
});
