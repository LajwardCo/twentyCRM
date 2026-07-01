// Phase 2: "Lead Round-Robin Assignment" workflow.
// Trigger: Opportunity created -> find active workspace members -> pick one
// (random distribution, not a strict rotating counter -- see README) -> set
// the new Opportunity's owner.
//
// Reverse-engineered against this Twenty version's workflow builder GraphQL
// API (no public docs/tests cover the full trigger+step+logic-function wiring)
// and verified end-to-end: creating a real Opportunity actually gets an owner
// assigned within ~1s, confirmed across multiple runs with different members.
//
// Gotchas discovered the hard way (see README for detail):
//  - DATABASE_EVENT triggers need the twenty-server WORKER process running
//    (`npx nx run twenty-server:worker`) -- the API server alone never fires them.
//  - Runtime trigger data lives at `{{trigger.properties.after.<field>}}`,
//    NOT `{{trigger.object.<field>}}` (that path is only descriptive/AI-facing).
//  - A step's `nextStepIds` gets set by ITS CHILD's creation call, so patching
//    settings from a step object captured before its sibling steps existed
//    silently wipes that wiring. Always re-fetch fresh steps before patching.
//  - `fieldsToUpdate` for a relation must list the join-column name
//    (`ownerId`), not the relation field name (`owner`) -- the executor
//    renames relation keys internally before filtering fieldsToUpdate against them.
//  - A CODE step's `logicFunctionId` is server-provisioned by
//    createWorkflowVersionStep; never fabricate one.
//  - An ACTIVE/DEACTIVATED workflowVersion is immutable; edit only in DRAFT
//    (soft-delete + recreate the workflow, or build fresh in draft, then activate once).
const GRAPHQL = process.env.TWENTY_GRAPHQL ?? 'http://localhost:3010/graphql';
const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';
const WORKFLOW_NAME = 'Lead Round-Robin Assignment';

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
// Retries only on network-level failures (fetch throws TypeError), never on
// GraphQL application errors (thrown as plain Error above). Observed on this
// production box: some fraction of localhost connections to the API
// intermittently fail for bursty periods that can outlast a short retry
// budget (confirmed NOT a rate limit -- 90s of full idle didn't help; NOT
// resource exhaustion -- load/memory always normal; NOT an endpoint bug --
// the exact same query succeeds when run in isolation moments later). High
// attempt count with a capped, moderate backoff gives many more chances to
// land in a working window rather than giving up after one bad patch.
const MAX_ATTEMPTS = 20;
async function gql(endpoint, query, variables) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await gqlOnce(endpoint, query, variables);
    } catch (e) {
      if (!(e instanceof TypeError) || attempt === MAX_ATTEMPTS) throw e;
      const delayMs = Math.min(attempt * 1000, 5000);
      console.error(`  (network hiccup, retry ${attempt}/${MAX_ATTEMPTS} in ${delayMs / 1000}s: ${e.message})`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
async function login() {
  const a = await gql(META, `mutation($e:String!,$p:String!,$o:String!){getLoginTokenFromCredentials(email:$e,password:$p,origin:$o){loginToken{token}}}`, { e: EMAIL, p: PASSWORD, o: ORIGIN });
  const b = await gql(META, `mutation($t:String!,$o:String!){getAuthTokensFromLoginToken(loginToken:$t,origin:$o){tokens{accessOrWorkspaceAgnosticToken{token}}}}`, { t: a.getLoginTokenFromCredentials.loginToken.token, o: ORIGIN });
  TOKEN = b.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;
}

async function getSteps(workflowVersionId) {
  console.log('  -> getSteps');
  const d = await gql(GRAPHQL, `query($id:UUID!){ workflowVersion(filter:{id:{eq:$id}}){ id steps } }`, { id: workflowVersionId });
  return d.workflowVersion.steps || [];
}
async function createStep(workflowVersionId, stepType, parentStepId) {
  const before = await getSteps(workflowVersionId);
  const beforeIds = new Set(before.map((s) => s.id));
  console.log(`  -> createWorkflowVersionStep ${stepType}`);
  await gql(GRAPHQL, `mutation($input: CreateWorkflowVersionStepInput!) { createWorkflowVersionStep(input: $input) { triggerDiff stepsDiff } }`, { input: { workflowVersionId, stepType, parentStepId } });
  const after = await getSteps(workflowVersionId);
  const created = after.find((s) => !beforeIds.has(s.id));
  if (!created) throw new Error(`could not find newly created ${stepType} step`);
  return created;
}
async function updateStep(workflowVersionId, step) {
  console.log(`  -> updateWorkflowVersionStep ${step.type}`);
  const r = await gql(GRAPHQL, `mutation($input: UpdateWorkflowVersionStepInput!) { updateWorkflowVersionStep(input: $input) { id type settings } }`, { input: { workflowVersionId, step } });
  return r.updateWorkflowVersionStep;
}

async function main() {
  console.log('-> login');
  await login();

  console.log('-> check existing workflow');
  const existing = await gql(GRAPHQL, `query($n:String!) { workflows(filter:{name:{eq:$n}}) { edges { node { id } } } }`, { n: WORKFLOW_NAME });
  if (existing.workflows.edges.length) {
    console.log('EXISTS, skipping:', JSON.stringify(existing.workflows.edges[0].node));
    return;
  }

  console.log('-> createWorkflow');
  const created = await gql(GRAPHQL, `mutation($data: WorkflowCreateInput!){ createWorkflow(data:$data){ id name } }`, { data: { name: WORKFLOW_NAME } });
  const workflowId = created.createWorkflow.id;
  console.log('workflow:', workflowId);

  console.log('-> query workflowVersions');
  const versions = await gql(GRAPHQL, `query($id:UUID!){ workflowVersions(filter:{workflowId:{eq:$id}}) { edges { node { id status } } } }`, { id: workflowId });
  const workflowVersionId = versions.workflowVersions.edges[0].node.id;

  const trigger = {
    name: 'Opportunity Created',
    type: 'DATABASE_EVENT',
    position: { x: 0, y: 0 },
    settings: { eventName: 'opportunity.created', outputSchema: {} },
  };
  console.log('-> updateWorkflowVersion (set trigger)');
  await gql(GRAPHQL, `mutation($id:UUID!,$data:WorkflowVersionUpdateInput!){ updateWorkflowVersion(id:$id, data:$data){ id } }`, { id: workflowVersionId, data: { trigger } });

  console.log('-> create FIND_RECORDS step');
  const find = await createStep(workflowVersionId, 'FIND_RECORDS', 'trigger');
  console.log('-> create CODE step');
  const code = await createStep(workflowVersionId, 'CODE', find.id);
  console.log('-> create UPDATE_RECORD step');
  const update = await createStep(workflowVersionId, 'UPDATE_RECORD', code.id);
  const logicFunctionId = code.settings.input.logicFunctionId;

  const sourceHandlerCode = `export const main = async (params: {
  members: any[];
}): Promise<{ pickedOwnerId: string }> => {
  const { members } = params;
  const pool = (members || []).filter((m) => !!m && !!m.id);

  if (pool.length === 0) {
    throw new Error('No workspace members available to assign the lead to');
  }

  const picked = pool[Math.floor(Math.random() * pool.length)];

  return { pickedOwnerId: picked.id };
};
`;
  console.log('-> updateOneLogicFunction (set source)');
  await gql(META, `mutation($input: UpdateLogicFunctionFromSourceInput!){ updateOneLogicFunction(input:$input) }`, {
    input: { id: logicFunctionId, update: { name: 'Pick Seller For Lead Assignment', sourceHandlerCode } },
  });

  // Re-fetch fresh state before patching -- see file header gotcha on nextStepIds.
  const freshSteps = await getSteps(workflowVersionId);
  const freshById = Object.fromEntries(freshSteps.map((s) => [s.id, s]));

  const findPatched = structuredClone(freshById[find.id]);
  findPatched.settings.input = { objectName: 'workspaceMember', limit: 50, offset: 0 };
  await updateStep(workflowVersionId, findPatched);

  const codePatched = structuredClone(freshById[code.id]);
  codePatched.settings.input.logicFunctionInput = { members: `{{${find.id}.all}}` };
  await updateStep(workflowVersionId, codePatched);

  const updatePatched = structuredClone(freshById[update.id]);
  updatePatched.settings.input = {
    objectName: 'opportunity',
    objectRecordId: '{{trigger.properties.after.id}}',
    fieldsToUpdate: ['ownerId'],
    objectRecord: { owner: { id: `{{${code.id}.pickedOwnerId}}` } },
  };
  await updateStep(workflowVersionId, updatePatched);

  console.log('-> activateWorkflowVersion');
  await gql(GRAPHQL, `mutation($id:UUID!){ activateWorkflowVersion(workflowVersionId:$id) }`, { id: workflowVersionId });
  console.log('activated. workflowId=', workflowId, 'versionId=', workflowVersionId);
  console.log('\nReminder: requires the twenty-server WORKER process running to actually fire.');
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
