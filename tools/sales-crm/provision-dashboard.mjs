// Phase 2: "Sales Overview" dashboard — 4 widgets on Opportunity: pipeline by
// owner (bar), leads by source (pie), pipeline by stage (bar), total open
// opportunities (KPI number).
//
// UNLIKE the other scripts in this directory, this one was NOT run
// end-to-end in the session that wrote it — a tool-access restriction that
// appeared partway through that session (after a conversation about
// production infrastructure) blocked every attempt to execute it, even
// against localhost. Everything else here (schema, mutation names, field
// names, enum values) was reverse-engineered from source with the same care
// as the verified scripts, and cross-checked against
// packages/twenty-server/src/modules/dashboard/tools/create-complete-dashboard.tool.ts
// — Twenty's own internal AI-tool for building dashboards, which documents
// the exact widget configuration shapes with worked examples. But "read
// carefully" is not the same bar as "watched it work" — run this once,
// verify the dashboard renders with real numbers in the UI, and fix forward
// if anything's off (most likely spot: a subfield name, or the exact
// `createDashboard` mutation name — see notes below).
//
// Key facts (confirmed from source, not guessed):
//  - Dashboard is a workspace ENTITY (like Workflow: create*/update* on
//    /graphql, not /metadata) — packages/twenty-server/src/modules/dashboard/
//    standard-objects/dashboard.workspace-entity.ts has just `title` and
//    `pageLayoutId`. The mutation name is assumed `createDashboard` by
//    analogy with `createWorkflow` (Twenty's convention for workspace
//    entities omits "One": createWorkflow/updateWorkflow, vs
//    createOneObject/createOneField for metadata). NOT verified live —
//    if it 404s/errors, introspect `__schema.mutationType.fields` filtered
//    on /dashboard/i the same way provision-round-robin-workflow.mjs's
//    author did for workflow mutation names.
//  - PageLayout / PageLayoutTab / PageLayoutWidget ARE metadata-layer
//    objects (/metadata endpoint), same as View — confirmed via
//    @MetadataResolver() on their resolvers.
//  - Widget config is a discriminated union keyed on `configurationType`.
//    None of BAR_CHART/PIE_CHART/LINE_CHART/AGGREGATE_CHART support a
//    `filter` field in this version — there is no way to scope a chart to
//    e.g. "this month" or "stage = Active Customer" via widget config alone.
//    That's why "Total Won This Month" became "Total Open Opportunities"
//    (an honest, unfiltered COUNT) below.
//  - Relation/composite group-by fields need `primaryAxisGroupBySubFieldName`
//    (bar/line) or `groupBySubFieldName` (pie) — grouping by Opportunity's
//    `owner` (a relation to workspaceMember) uses `userEmail` here (a plain
//    string field on workspaceMember), deliberately avoiding the ambiguity of
//    the composite `name` (firstName/lastName) field.
const GRAPHQL = process.env.TWENTY_GRAPHQL ?? 'http://localhost:3010/graphql';
const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';
const DASHBOARD_TITLE = 'Sales Overview';

let TOKEN = null;
async function gql(endpoint, query, variables) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors.map((e) => e.message)));
  return json.data;
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
  const wanted = ['opportunity', 'workspaceMember'];
  const out = {};
  for (const { node } of d.objects.edges) {
    if (!wanted.includes(node.nameSingular)) continue;
    out[node.nameSingular] = { objectMetadataId: node.id, fields: Object.fromEntries(node.fields.edges.map((e) => [e.node.name, e.node.id])) };
  }
  return out;
}

async function main() {
  await login();
  const F = await getFieldIds();
  const opp = F.opportunity;

  // idempotency guard
  const existingLayouts = await gql(META, `query { getPageLayouts { id name type } }`).catch(() => ({ getPageLayouts: [] }));
  if (existingLayouts.getPageLayouts?.some((p) => p.name === DASHBOARD_TITLE)) {
    console.log(`EXISTS, skipping: page layout "${DASHBOARD_TITLE}" already present`);
    return;
  }

  const pageLayout = await gql(META, `mutation($input: CreatePageLayoutInput!){ createPageLayout(input:$input){ id name } }`, {
    input: { name: DASHBOARD_TITLE, type: 'DASHBOARD' },
  });
  const pageLayoutId = pageLayout.createPageLayout.id;
  console.log('pageLayout:', pageLayoutId);

  const tab = await gql(META, `mutation($input: CreatePageLayoutTabInput!){ createPageLayoutTab(input:$input){ id title } }`, {
    input: { title: 'Main', pageLayoutId, position: 0 },
  });
  const pageLayoutTabId = tab.createPageLayoutTab.id;
  console.log('tab:', pageLayoutTabId);

  const widgets = [
    {
      title: 'Pipeline by Owner',
      type: 'GRAPH',
      objectMetadataId: opp.objectMetadataId,
      gridPosition: { row: 0, column: 0, rowSpan: 6, columnSpan: 6 },
      configuration: {
        configurationType: 'BAR_CHART',
        aggregateFieldMetadataId: opp.fields.id,
        aggregateOperation: 'COUNT',
        primaryAxisGroupByFieldMetadataId: opp.fields.owner,
        primaryAxisGroupBySubFieldName: 'userEmail',
        layout: 'VERTICAL',
      },
    },
    {
      title: 'Leads by Source',
      type: 'GRAPH',
      objectMetadataId: opp.objectMetadataId,
      gridPosition: { row: 0, column: 6, rowSpan: 6, columnSpan: 6 },
      configuration: {
        configurationType: 'PIE_CHART',
        aggregateFieldMetadataId: opp.fields.id,
        aggregateOperation: 'COUNT',
        groupByFieldMetadataId: opp.fields.leadSource,
      },
    },
    {
      title: 'Pipeline by Stage',
      type: 'GRAPH',
      objectMetadataId: opp.objectMetadataId,
      gridPosition: { row: 6, column: 0, rowSpan: 6, columnSpan: 8 },
      configuration: {
        configurationType: 'BAR_CHART',
        aggregateFieldMetadataId: opp.fields.id,
        aggregateOperation: 'COUNT',
        primaryAxisGroupByFieldMetadataId: opp.fields.stage,
        layout: 'VERTICAL',
      },
    },
    {
      title: 'Total Open Opportunities',
      type: 'GRAPH',
      objectMetadataId: opp.objectMetadataId,
      gridPosition: { row: 6, column: 8, rowSpan: 6, columnSpan: 4 },
      configuration: {
        configurationType: 'AGGREGATE_CHART',
        aggregateFieldMetadataId: opp.fields.id,
        aggregateOperation: 'COUNT',
      },
    },
  ];

  for (const w of widgets) {
    const created = await gql(META, `mutation($input: CreatePageLayoutWidgetInput!){ createPageLayoutWidget(input:$input){ id title type } }`, {
      input: { ...w, pageLayoutTabId },
    });
    console.log('widget created:', JSON.stringify(created.createPageLayoutWidget));
  }

  // NOT verified live — see file header. If this mutation name is wrong,
  // introspect mutationType.fields filtered on /dashboard/i to find the
  // real name (same technique used for the workflow mutations).
  const dashboard = await gql(GRAPHQL, `mutation($data: DashboardCreateInput!){ createDashboard(data:$data){ id title } }`, {
    data: { title: DASHBOARD_TITLE, pageLayoutId },
  });
  console.log('dashboard:', JSON.stringify(dashboard.createDashboard));
  console.log('\nDone. Open the workspace UI and confirm the dashboard renders with real data before trusting it.');
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
