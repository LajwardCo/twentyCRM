// Phase 2: saved Views for daily use — replaces the "CRON alarm" idea for
// quotation-expiry / subscription-renewal with something equally practical and
// far less fragile: a filtered, sorted view a seller/team-lead checks each
// morning. (A true CRON+iterator automation is possible but materially more
// complex than the round-robin workflow — no bulk-update primitive exists, it
// needs a nested loop step. Deferred; see tools/sales-crm/README.md.)
//
// Views live in the METADATA layer (`/metadata` endpoint), not as workspace
// records — a different API surface than Products/Quotations (regular
// metadata objects) and than Workflows (workspace records on `/graphql`).
// "Assigned to me" is NOT a literal workspace-member id (that wouldn't
// generalize across users) — it's the JSON convention
// `{"isCurrentWorkspaceMemberSelected":true,"selectedRecordIds":[]}` as a
// STRINGIFIED value on a relation filter, resolved to the requesting user at
// query time (confirmed via
// packages/twenty-shared/src/utils/filter/utils/validation-schemas/jsonRelationFilterValueSchema.ts).
const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';

let TOKEN = null;
async function gqlOnce(endpoint, query, variables) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors.map((e) => e.message)));
  return json.data;
}
async function gql(endpoint, query, variables) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await gqlOnce(endpoint, query, variables);
    } catch (e) {
      if (!(e instanceof TypeError) || attempt === 5) throw e;
      console.error(`  (network hiccup, retry ${attempt}/5 in ${attempt * 2}s: ${e.message})`);
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
}
async function login() {
  const a = await gql(META, `mutation($e:String!,$p:String!,$o:String!){getLoginTokenFromCredentials(email:$e,password:$p,origin:$o){loginToken{token}}}`, { e: EMAIL, p: PASSWORD, o: ORIGIN });
  const b = await gql(META, `mutation($t:String!,$o:String!){getAuthTokensFromLoginToken(loginToken:$t,origin:$o){tokens{accessOrWorkspaceAgnosticToken{token}}}}`, { t: a.getLoginTokenFromCredentials.loginToken.token, o: ORIGIN });
  TOKEN = b.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;
}

async function getFieldIds() {
  const d = await gql(META, `query { objects(paging:{first:500}) { edges { node {
    id nameSingular
    fields(paging:{first:500}) { edges { node { id name } } }
  } } } }`);
  const wanted = ['task', 'opportunity', 'quotation', 'subscription'];
  const out = {};
  for (const { node } of d.objects.edges) {
    if (!wanted.includes(node.nameSingular)) continue;
    out[node.nameSingular] = { objectMetadataId: node.id, fields: Object.fromEntries(node.fields.edges.map((e) => [e.node.name, e.node.id])) };
  }
  return out;
}

async function findExistingView(name) {
  const d = await gql(META, `query { getViews { id name } }`);
  return d.getViews.find((v) => v.name === name);
}
async function createView(input) {
  const d = await gql(META, `mutation($input: CreateViewInput!){ createView(input:$input){ id name } }`, { input });
  return d.createView;
}
async function createFilter(input) {
  const d = await gql(META, `mutation($input: CreateViewFilterInput!){ createViewFilter(input:$input){ id } }`, { input });
  return d.createViewFilter;
}
async function createSort(input) {
  const d = await gql(META, `mutation($input: CreateViewSortInput!){ createViewSort(input:$input){ id } }`, { input });
  return d.createViewSort;
}

async function main() {
  await login();
  const F = await getFieldIds();

  if (!(await findExistingView('My Tasks — Today'))) {
    const view = await createView({ name: 'My Tasks — Today', objectMetadataId: F.task.objectMetadataId, type: 'TABLE', icon: 'IconChecklist' });
    await createFilter({ viewId: view.id, fieldMetadataId: F.task.fields.assignee, operand: 'IS', value: JSON.stringify({ isCurrentWorkspaceMemberSelected: true, selectedRecordIds: [] }) });
    await createFilter({ viewId: view.id, fieldMetadataId: F.task.fields.dueAt, operand: 'IS_TODAY', value: '' });
    console.log('created: My Tasks — Today', view.id);
  } else console.log('skip: My Tasks — Today (exists)');

  if (!(await findExistingView('Pipeline by Owner'))) {
    const view = await createView({ name: 'Pipeline by Owner', objectMetadataId: F.opportunity.objectMetadataId, type: 'TABLE', icon: 'IconTargetArrow', mainGroupByFieldMetadataId: F.opportunity.fields.owner });
    console.log('created: Pipeline by Owner', view.id);
  } else console.log('skip: Pipeline by Owner (exists)');

  if (!(await findExistingView('Quotations Nearing Expiry'))) {
    const view = await createView({ name: 'Quotations Nearing Expiry', objectMetadataId: F.quotation.objectMetadataId, type: 'TABLE', icon: 'IconFileInvoice' });
    await createFilter({ viewId: view.id, fieldMetadataId: F.quotation.fields.status, operand: 'IS', value: JSON.stringify(['SENT']) });
    await createSort({ viewId: view.id, fieldMetadataId: F.quotation.fields.validUntil, direction: 'ASC' });
    console.log('created: Quotations Nearing Expiry', view.id);
  } else console.log('skip: Quotations Nearing Expiry (exists)');

  if (!(await findExistingView('Subscriptions — Renewal Due Soon'))) {
    const view = await createView({ name: 'Subscriptions — Renewal Due Soon', objectMetadataId: F.subscription.objectMetadataId, type: 'TABLE', icon: 'IconRefresh' });
    await createFilter({ viewId: view.id, fieldMetadataId: F.subscription.fields.status, operand: 'IS', value: JSON.stringify(['ACTIVE']) });
    await createSort({ viewId: view.id, fieldMetadataId: F.subscription.fields.renewalDate, direction: 'ASC' });
    console.log('created: Subscriptions — Renewal Due Soon', view.id);
  } else console.log('skip: Subscriptions — Renewal Due Soon (exists)');
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
