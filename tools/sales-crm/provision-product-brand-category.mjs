// tools/sales-crm/provision-product-brand-category.mjs
// Catalog taxonomy on the Product object:
//   product.brand    — TEXT, the vendor / product line the product belongs to.
//   product.category — TEXT, the catalog grouping (what kind of product it is).
//
// Both are TEXT rather than SELECT on purpose: the taxonomy differs per
// workspace and grows over time, and a SELECT would mean re-provisioning
// options every time the catalog gains a brand. The Sales UI keeps values
// consistent instead by suggesting the ones already in use (a <datalist> built
// from the existing products) — same reasoning as discountRule.conditionMetric.
//
// Creating a field also creates its view fields, so both columns show up in the
// Twenty CRM Products table view without any extra step here.
//
// Idempotent: skips a field that already exists. Safe to re-run.
//
// Auth: set TWENTY_TOKEN to a workspace API key (Settings > APIs & Webhooks) to
// skip the password login entirely -- preferable against production, where you
// don't want an admin password in your shell history. Otherwise it logs in with
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

const FIELDS = [
  {
    name: 'brand',
    label: 'Brand',
    type: 'TEXT',
    icon: 'IconCopyright',
    description:
      'Vendor or product line this product belongs to, e.g. "Hamagan". Free text — the Sales UI suggests brands already in use.',
  },
  {
    name: 'category',
    label: 'Category',
    type: 'TEXT',
    icon: 'IconCategory',
    description:
      'Catalog grouping for this product, e.g. "Healthcare". Free text — the Sales UI suggests categories already in use.',
  },
];

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

  const product = d.objects.edges
    .map((e) => e.node)
    .find((o) => o.nameSingular === 'product');
  if (!product) throw new Error('product object not found -- run provision-phase1.mjs first');

  const existing = new Set(product.fields.edges.map((e) => e.node.name));

  for (const field of FIELDS) {
    if (existing.has(field.name)) {
      console.log(`[skip]  field: product.${field.name} — exists`);
      continue;
    }
    await gql(
      `mutation($input:CreateOneFieldMetadataInput!){createOneField(input:$input){id name}}`,
      { input: { field: { objectMetadataId: product.id, ...field } } },
    );
    console.log(`[created] field: product.${field.name}`);
  }

  console.log('\ndone.');
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
