// tools/sales-crm/provision-competitor-views.mjs
// Saved views for the Competitor Intelligence objects. Idempotent by view name.
// Run AFTER provision-competitor-intel.mjs. See
// docs/superpowers/specs/2026-07-06-competitor-intelligence-design.md.
const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';

let TOKEN = null;
async function gqlOnce(query, variables) {
  const res = await fetch(META, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) }, body: JSON.stringify({ query, variables }) });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors.map((e) => e.message)));
  return json.data;
}
async function gql(query, variables) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try { return await gqlOnce(query, variables); }
    catch (e) { if (!(e instanceof TypeError) || attempt === 5) throw e; await new Promise((r) => setTimeout(r, attempt * 2000)); }
  }
}
async function login() {
  const a = await gql(`mutation($e:String!,$p:String!,$o:String!){getLoginTokenFromCredentials(email:$e,password:$p,origin:$o){loginToken{token}}}`, { e: EMAIL, p: PASSWORD, o: ORIGIN });
  const b = await gql(`mutation($t:String!,$o:String!){getAuthTokensFromLoginToken(loginToken:$t,origin:$o){tokens{accessOrWorkspaceAgnosticToken{token}}}}`, { t: a.getLoginTokenFromCredentials.loginToken.token, o: ORIGIN });
  TOKEN = b.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;
}

async function getFieldIds() {
  const d = await gql(`query { objects(paging:{first:500}) { edges { node {
    id nameSingular
    fields(paging:{first:500}) { edges { node { id name } } }
  } } } }`);
  const wanted = ['competitor', 'competitorProduct', 'competitorUpdate', 'competitorUsage'];
  const out = {};
  for (const { node } of d.objects.edges) {
    if (!wanted.includes(node.nameSingular)) continue;
    out[node.nameSingular] = { objectMetadataId: node.id, fields: Object.fromEntries(node.fields.edges.map((e) => [e.node.name, e.node.id])) };
  }
  return out;
}
async function findExistingView(name) {
  const d = await gql(`query { getViews { id name } }`);
  return d.getViews.find((v) => v.name === name);
}
async function createView(input) { return (await gql(`mutation($input: CreateViewInput!){ createView(input:$input){ id name } }`, { input })).createView; }
async function createFilter(input) { await gql(`mutation($input: CreateViewFilterInput!){ createViewFilter(input:$input){ id } }`, { input }); }
async function createSort(input) { await gql(`mutation($input: CreateViewSortInput!){ createViewSort(input:$input){ id } }`, { input }); }

async function ensureView(name, build) {
  if (await findExistingView(name)) { console.log(`skip: ${name} (exists)`); return; }
  await build();
  console.log(`created: ${name}`);
}

async function main() {
  await login();
  const F = await getFieldIds();
  for (const key of ['competitor', 'competitorProduct', 'competitorUpdate', 'competitorUsage']) {
    if (!F[key]) throw new Error(`object ${key} not found — run provision-competitor-intel.mjs first`);
  }

  await ensureView('Competitors by Threat', async () => {
    const view = await createView({ name: 'Competitors by Threat', objectMetadataId: F.competitor.objectMetadataId, type: 'TABLE', icon: 'IconSwords' });
    await createSort({ viewId: view.id, fieldMetadataId: F.competitor.fields.threatLevel, direction: 'ASC' });
  });

  await ensureView('Competitors by Status', async () => {
    await createView({ name: 'Competitors by Status', objectMetadataId: F.competitor.objectMetadataId, type: 'KANBAN', icon: 'IconLayoutKanban', mainGroupByFieldMetadataId: F.competitor.fields.status });
  });

  await ensureView('Competitor Products', async () => {
    await createView({ name: 'Competitor Products', objectMetadataId: F.competitorProduct.objectMetadataId, type: 'TABLE', icon: 'IconBox' });
  });

  await ensureView('Competitor Updates — Recent', async () => {
    const view = await createView({ name: 'Competitor Updates — Recent', objectMetadataId: F.competitorUpdate.objectMetadataId, type: 'TABLE', icon: 'IconNews' });
    await createSort({ viewId: view.id, fieldMetadataId: F.competitorUpdate.fields.date, direction: 'DESC' });
  });

  await ensureView('Switching Signals', async () => {
    const view = await createView({ name: 'Switching Signals', objectMetadataId: F.competitorUsage.objectMetadataId, type: 'TABLE', icon: 'IconArrowsExchange' });
    await createFilter({ viewId: view.id, fieldMetadataId: F.competitorUsage.fields.switchingSignal, operand: 'IS_NOT', value: JSON.stringify(['NONE']) });
  });
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
