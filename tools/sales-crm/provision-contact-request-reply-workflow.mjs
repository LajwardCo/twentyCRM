// "Send Contact Request Reply" workflow.
// Trigger: MANUAL, launched from a Contact Request record ("Send Message"
// action). Shows a one-field form (message text), sends it as an email to the
// requester via Twenty's native SEND_EMAIL action, then marks the request
// Replied.
//
// Requires a connected email account in the workspace (Settings > Accounts)
// -- looked up here via `myConnectedAccounts` and used as-is (first account
// found). If none exists, this script fails loudly with a clear message
// rather than silently skipping.
const GRAPHQL = process.env.TWENTY_GRAPHQL ?? 'http://localhost:3010/graphql';
const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';
const WORKFLOW_NAME = 'Send Contact Request Reply';

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
async function getConnectedAccountId() {
  // myConnectedAccounts lives on the metadata resolver (@MetadataResolver),
  // served on /metadata, not the workspace /graphql endpoint -- verified
  // against connected-account.resolver.ts and the frontend's own query
  // (getMyConnectedAccounts.ts uses `name`, not `accountName`).
  const d = await gql(META, `query { myConnectedAccounts { id handle name } }`, {});
  const account = d.myConnectedAccounts?.[0];
  if (!account) throw new Error('No connected email account found. Connect one via Settings > Accounts before running this script.');
  console.log('using connected account:', account.handle, account.name ? `(${account.name})` : '');
  return account.id;
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

  const connectedAccountId = await getConnectedAccountId();

  const created = await gql(GRAPHQL, `mutation($data: WorkflowCreateInput!){ createWorkflow(data:$data){ id name } }`, { data: { name: WORKFLOW_NAME } });
  const workflowId = created.createWorkflow.id;
  console.log('workflow:', workflowId);

  const versions = await gql(GRAPHQL, `query($id:UUID!){ workflowVersions(filter:{workflowId:{eq:$id}}) { edges { node { id status } } } }`, { id: workflowId });
  const workflowVersionId = versions.workflowVersions.edges[0].node.id;

  const trigger = {
    name: 'Send Message (manual)',
    type: 'MANUAL',
    position: { x: 0, y: 0 },
    settings: {
      outputSchema: {},
      icon: 'IconMail',
      availability: { type: 'SINGLE_RECORD', objectNameSingular: 'contactRequest' },
    },
  };
  await gql(GRAPHQL, `mutation($id:UUID!,$data:WorkflowVersionUpdateInput!){ updateWorkflowVersion(id:$id, data:$data){ id } }`, { id: workflowVersionId, data: { trigger } });

  const form = await createStep(workflowVersionId, 'FORM', 'trigger');
  const sendEmail = await createStep(workflowVersionId, 'SEND_EMAIL', form.id);
  const markReplied = await createStep(workflowVersionId, 'UPDATE_RECORD', sendEmail.id);

  const freshSteps = await getSteps(workflowVersionId);
  const freshById = Object.fromEntries(freshSteps.map((s) => [s.id, s]));

  const formPatched = structuredClone(freshById[form.id]);
  formPatched.settings.input = [{
    id: 'form-field-message',
    name: 'message',
    label: 'Message',
    type: 'TEXT',
    placeholder: 'What would you like to tell them?',
  }];
  await updateStep(workflowVersionId, formPatched);

  // NOTE: docs/tests elsewhere in this codebase reference `{{trigger.record.X}}`
  // for a SINGLE_RECORD manual trigger, but that's stale -- verified live
  // against a real run (see getWorkflowRunContext.ts: the trigger's context
  // entry is `stepInfos.trigger.result`, which for this trigger type has no
  // `record` key at all, only fields flattened directly on `trigger` plus a
  // duplicate copy under `trigger.payload` per WORKFLOW_TRIGGER_PAYLOAD_KEY =
  // 'payload'). `{{trigger.record.email}}` silently resolves to nothing
  // (Handlebars + JSON.parse swallow the failure), so SEND_EMAIL sends with
  // empty recipients. Using `{{trigger.payload.X}}` instead, confirmed
  // against the actual runtime context of a live workflow run.
  const sendEmailPatched = structuredClone(freshById[sendEmail.id]);
  sendEmailPatched.settings.input = {
    connectedAccountId,
    recipients: { to: '{{trigger.payload.email}}' },
    subject: 'Re: your request',
    body: `{{${form.id}.message}}`,
  };
  await updateStep(workflowVersionId, sendEmailPatched);

  const markRepliedPatched = structuredClone(freshById[markReplied.id]);
  markRepliedPatched.settings.input = {
    objectName: 'contactRequest',
    objectRecordId: '{{trigger.payload.id}}',
    fieldsToUpdate: ['status'],
    objectRecord: { status: 'REPLIED' },
  };
  await updateStep(workflowVersionId, markRepliedPatched);

  await gql(GRAPHQL, `mutation($id:UUID!){ activateWorkflowVersion(workflowVersionId:$id) }`, { id: workflowVersionId });
  console.log('activated. workflowId=', workflowId, 'versionId=', workflowVersionId);
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
