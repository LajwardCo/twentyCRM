// Phase 3: per-factor pricing fields.
// Product.pricingFactors: rate table, e.g. [{"name":"doctor","unitPrice":50},{"name":"employee","unitPrice":20}]
// DealProduct.factorQuantities: quantities for this line, e.g. {"doctor":5,"employee":20}
// installPrice on the Deal Product is then auto-calculated by a PRE query
// hook (packages/twenty-server/src/modules/sales-crm/) whenever
// factorQuantities or the linked product changes -- see that module's
// deal-product-price-calculation.service.ts for the actual formula.
// These field NAMES are deliberately generic (not hardcoded to "doctor"/
// "employee") -- the real per-product rates are entered by whoever manages
// the Product catalog, not baked into this script.
const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';

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
  const d = await gql(`query { objects(paging:{first:500}) { edges { node { id nameSingular fields(paging:{first:500}){ edges { node { name } } } } } } }`);
  const objs = {};
  for (const { node } of d.objects.edges) objs[node.nameSingular] = { id: node.id, fields: new Set(node.fields.edges.map((e) => e.node.name)) };

  async function ensureField(objName, fieldName, def) {
    if (objs[objName].fields.has(fieldName)) { console.log('skip:', objName + '.' + fieldName, '- exists'); return; }
    const r = await gql(`mutation($input: CreateOneFieldMetadataInput!){ createOneField(input:$input){ id name } }`, {
      input: { field: { objectMetadataId: objs[objName].id, name: fieldName, ...def } },
    });
    console.log('created:', objName + '.' + fieldName, JSON.stringify(r.createOneField));
  }

  await ensureField('product', 'pricingFactors', { label: 'Pricing Factors', type: 'RAW_JSON', description: 'Per-factor rate table, e.g. [{"name":"doctor","unitPrice":50},{"name":"employee","unitPrice":20}]. Used with pricingModel=PER_FACTOR.' });
  await ensureField('dealProduct', 'factorQuantities', { label: 'Factor Quantities', type: 'RAW_JSON', description: 'Quantities per pricing factor for this line, e.g. {"doctor":5,"employee":20}. installPrice is auto-calculated from this.' });
  console.log('\ndone.');
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
