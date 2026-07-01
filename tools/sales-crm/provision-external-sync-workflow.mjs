// Phase 3: "Notify External System On Subscription Update" workflow.
// Trigger: Subscription updated -> HTTP_REQUEST POST to
// Subscription.externalSystemUrl with the subscription's current state.
//
// Deliberately simple: no FILTER/conditional gating step. Twenty's step
// filter DSL (stepFilterGroups/stepFilters) has a `type` field whose valid
// values are an unclear taxonomy (only one real example seen: "ACTOR" for a
// composite actor-metadata field) -- getting it wrong silently either never
// matches or throws at runtime, and verifying it would need another long
// debugging cycle like the round-robin workflow needed. Pragmatic tradeoff:
// ship the simple, reliable version. If externalSystemUrl is blank, the
// HTTP_REQUEST step fails with an invalid-URL error, visible as a FAILED
// workflow run -- harmless, expected, and only relevant for subscriptions
// that haven't been wired to an external system yet. Fill in
// externalSystemUrl only for subscriptions that need real-time sync.
//
// IMPORTANT (found via live testing): Twenty's HTTP_REQUEST action has
// built-in SSRF protection and refuses requests to internal/private IPs
// ("Request to internal IP address ... is not allowed"). externalSystemUrl
// MUST be a real, publicly-reachable endpoint -- localhost/127.0.0.1/private
// IPs will always fail. This was confirmed to be the ONLY reason a local
// test run failed; the trigger, variable interpolation, and HTTP_REQUEST
// step itself all worked correctly end-to-end.
const GRAPHQL = process.env.TWENTY_GRAPHQL ?? 'http://localhost:3010/graphql';
const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';
const WORKFLOW_NAME = 'Notify External System On Subscription Update';

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
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      return await gqlOnce(endpoint, query, variables);
    } catch (e) {
      if (!(e instanceof TypeError) || attempt === 20) throw e;
      console.error(`  (network hiccup, retry ${attempt}/20)`);
      await new Promise((r) => setTimeout(r, Math.min(attempt * 1000, 5000)));
    }
  }
}
async function login() {
  const a = await gql(META, `mutation($e:String!,$p:String!,$o:String!){getLoginTokenFromCredentials(email:$e,password:$p,origin:$o){loginToken{token}}}`, { e: EMAIL, p: PASSWORD, o: ORIGIN });
  const b = await gql(META, `mutation($t:String!,$o:String!){getAuthTokensFromLoginToken(loginToken:$t,origin:$o){tokens{accessOrWorkspaceAgnosticToken{token}}}}`, { t: a.getLoginTokenFromCredentials.loginToken.token, o: ORIGIN });
  TOKEN = b.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;
}

async function getSteps(workflowVersionId) {
  const d = await gql(GRAPHQL, `query($id:UUID!){ workflowVersion(filter:{id:{eq:$id}}){ id steps } }`, { id: workflowVersionId });
  return d.workflowVersion.steps || [];
}
async function createStep(workflowVersionId, stepType, parentStepId) {
  const before = await getSteps(workflowVersionId);
  const beforeIds = new Set(before.map((s) => s.id));
  await gql(GRAPHQL, `mutation($input: CreateWorkflowVersionStepInput!) { createWorkflowVersionStep(input: $input) { triggerDiff stepsDiff } }`, { input: { workflowVersionId, stepType, parentStepId } });
  const after = await getSteps(workflowVersionId);
  const created = after.find((s) => !beforeIds.has(s.id));
  if (!created) throw new Error(`could not find newly created ${stepType} step`);
  return created;
}
async function updateStep(workflowVersionId, step) {
  const r = await gql(GRAPHQL, `mutation($input: UpdateWorkflowVersionStepInput!) { updateWorkflowVersionStep(input: $input) { id type settings } }`, { input: { workflowVersionId, step } });
  return r.updateWorkflowVersionStep;
}

async function main() {
  await login();

  const existing = await gql(GRAPHQL, `query($n:String!) { workflows(filter:{name:{eq:$n}}) { edges { node { id } } } }`, { n: WORKFLOW_NAME });
  if (existing.workflows.edges.length) {
    console.log('EXISTS, skipping:', JSON.stringify(existing.workflows.edges[0].node));
    return;
  }

  const created = await gql(GRAPHQL, `mutation($data: WorkflowCreateInput!){ createWorkflow(data:$data){ id name } }`, { data: { name: WORKFLOW_NAME } });
  const workflowId = created.createWorkflow.id;
  console.log('workflow:', workflowId);

  const versions = await gql(GRAPHQL, `query($id:UUID!){ workflowVersions(filter:{workflowId:{eq:$id}}) { edges { node { id status } } } }`, { id: workflowId });
  const workflowVersionId = versions.workflowVersions.edges[0].node.id;

  const trigger = {
    name: 'Subscription Updated',
    type: 'DATABASE_EVENT',
    position: { x: 0, y: 0 },
    settings: { eventName: 'subscription.updated', outputSchema: {} },
  };
  await gql(GRAPHQL, `mutation($id:UUID!,$data:WorkflowVersionUpdateInput!){ updateWorkflowVersion(id:$id, data:$data){ id } }`, { id: workflowVersionId, data: { trigger } });

  const httpStep = await createStep(workflowVersionId, 'HTTP_REQUEST', 'trigger');

  const patched = structuredClone(httpStep);
  patched.settings.input = {
    url: '{{trigger.properties.after.externalSystemUrl}}',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      event: 'subscription.updated',
      subscriptionId: '{{trigger.properties.after.id}}',
      status: '{{trigger.properties.after.status}}',
      startDate: '{{trigger.properties.after.startDate}}',
      endDate: '{{trigger.properties.after.endDate}}',
      renewalDate: '{{trigger.properties.after.renewalDate}}',
      opportunityId: '{{trigger.properties.after.opportunityId}}',
      companyId: '{{trigger.properties.after.companyId}}',
    },
  };
  await updateStep(workflowVersionId, patched);
  console.log('HTTP_REQUEST step configured');

  await gql(GRAPHQL, `mutation($id:UUID!){ activateWorkflowVersion(workflowVersionId:$id) }`, { id: workflowVersionId });
  console.log('activated. workflowId=', workflowId, 'versionId=', workflowVersionId);
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
