// "Contact Request Auto-Link Person" workflow.
// Trigger: Contact Request created -> FIND_RECORDS person by email (CONTAINS on
// the emails.primaryEmail subfield -- the only operand Twenty exposes for that
// composite subfield, see computeGqlOperationFilterForEmails.ts; a case-insensitive
// substring match, not exact-equals) -> IF_ELSE on whether any match was found
// -> found: link the existing Person; not found: create one, then link it.
//
// Branch wiring gotcha (verified against source, not guessed): runtime routing
// for IF_ELSE reads `branches[].nextStepIds`, NOT the generic per-step
// `nextStepIds` set by createWorkflowVersionStep's parent-child wiring
// (get-next-step-ids-for-if-else.util.ts). So branch step chains are created as
// children of the IF_ELSE step (for correct tree structure /
// positioning), then `branches` is explicitly patched afterward with the real
// child step ids -- same "re-fetch fresh steps, then patch settings" idiom the
// round-robin workflow already established (see its file header).
//
// Requires the twenty-server WORKER process running to actually fire
// (DATABASE_EVENT triggers are consumed off a BullMQ queue by the worker, not
// the API server -- same requirement as the round-robin workflow).
const GRAPHQL = process.env.TWENTY_GRAPHQL ?? 'http://localhost:3010/graphql';
const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';
const WORKFLOW_NAME = 'Contact Request Auto-Link Person';

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
async function getFieldId(objectNameSingular, fieldName) {
  // ObjectFilter has no nameSingular input field in this schema version
  // (confirmed via introspection: only and/or/id/isRemote/isActive/isSystem/
  // isUIEditable/isUICreatable/isUIReadOnly/isSearchable) -- so filter
  // client-side instead of on the server.
  const d = await gql(META, `query { objects(paging:{first:500}) { edges { node { id nameSingular fields(paging:{first:500}) { edges { node { id name } } } } } } }`, {});
  const obj = d.objects.edges.map((e) => e.node).find((o) => o.nameSingular === objectNameSingular);
  if (!obj) throw new Error(`object not found: ${objectNameSingular}`);
  const field = obj.fields.edges.find((e) => e.node.name === fieldName)?.node;
  if (!field) throw new Error(`field not found: ${objectNameSingular}.${fieldName}`);
  return field.id;
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

  const personEmailsFieldId = await getFieldId('person', 'emails');

  const created = await gql(GRAPHQL, `mutation($data: WorkflowCreateInput!){ createWorkflow(data:$data){ id name } }`, { data: { name: WORKFLOW_NAME } });
  const workflowId = created.createWorkflow.id;
  console.log('workflow:', workflowId);

  const versions = await gql(GRAPHQL, `query($id:UUID!){ workflowVersions(filter:{workflowId:{eq:$id}}) { edges { node { id status } } } }`, { id: workflowId });
  const workflowVersionId = versions.workflowVersions.edges[0].node.id;

  const trigger = {
    name: 'Contact Request Created',
    type: 'DATABASE_EVENT',
    position: { x: 0, y: 0 },
    settings: { eventName: 'contactRequest.created', outputSchema: {} },
  };
  await gql(GRAPHQL, `mutation($id:UUID!,$data:WorkflowVersionUpdateInput!){ updateWorkflowVersion(id:$id, data:$data){ id } }`, { id: workflowVersionId, data: { trigger } });

  const find = await createStep(workflowVersionId, 'FIND_RECORDS', 'trigger');
  const ifElse = await createStep(workflowVersionId, 'IF_ELSE', find.id);
  const linkExisting = await createStep(workflowVersionId, 'UPDATE_RECORD', ifElse.id);
  const createPerson = await createStep(workflowVersionId, 'CREATE_RECORD', ifElse.id);
  const linkNew = await createStep(workflowVersionId, 'UPDATE_RECORD', createPerson.id);

  // Re-fetch fresh state before patching -- patching from a captured step
  // object whose siblings/children didn't exist yet silently wipes wiring.
  const freshSteps = await getSteps(workflowVersionId);
  const freshById = Object.fromEntries(freshSteps.map((s) => [s.id, s]));

  const findPatched = structuredClone(freshById[find.id]);
  findPatched.settings.input = {
    objectName: 'person',
    limit: 1,
    filter: {
      recordFilterGroups: [{ id: 'filter-group-email-match', logicalOperator: 'AND' }],
      recordFilters: [{
        id: 'filter-email-match',
        fieldMetadataId: personEmailsFieldId,
        type: 'EMAILS',
        operand: 'CONTAINS',
        subFieldName: 'primaryEmail',
        value: '{{trigger.properties.after.email}}',
        recordFilterGroupId: 'filter-group-email-match',
      }],
    },
  };
  await updateStep(workflowVersionId, findPatched);

  const ifElsePatched = structuredClone(freshById[ifElse.id]);
  ifElsePatched.settings.input = {
    stepFilterGroups: [{ id: 'branch-group-found', logicalOperator: 'AND' }],
    stepFilters: [{
      id: 'branch-filter-found',
      type: 'ARRAY',
      stepOutputKey: `{{${find.id}.all}}`,
      operand: 'IS_NOT_EMPTY',
      value: '',
      stepFilterGroupId: 'branch-group-found',
    }],
    branches: [
      { id: 'branch-found', filterGroupId: 'branch-group-found', nextStepIds: [linkExisting.id] },
      { id: 'branch-not-found', nextStepIds: [createPerson.id] },
    ],
  };
  await updateStep(workflowVersionId, ifElsePatched);

  const linkExistingPatched = structuredClone(freshById[linkExisting.id]);
  linkExistingPatched.settings.input = {
    objectName: 'contactRequest',
    objectRecordId: '{{trigger.properties.after.id}}',
    fieldsToUpdate: ['personId'],
    objectRecord: { person: { id: `{{${find.id}.first.id}}` } },
  };
  await updateStep(workflowVersionId, linkExistingPatched);

  const createPersonPatched = structuredClone(freshById[createPerson.id]);
  createPersonPatched.settings.input = {
    objectName: 'person',
    objectRecord: {
      name: { firstName: '{{trigger.properties.after.fullName}}', lastName: '' },
      emails: { primaryEmail: '{{trigger.properties.after.email}}' },
    },
  };
  await updateStep(workflowVersionId, createPersonPatched);

  const linkNewPatched = structuredClone(freshById[linkNew.id]);
  linkNewPatched.settings.input = {
    objectName: 'contactRequest',
    objectRecordId: '{{trigger.properties.after.id}}',
    fieldsToUpdate: ['personId'],
    objectRecord: { person: { id: `{{${createPerson.id}.id}}` } },
  };
  await updateStep(workflowVersionId, linkNewPatched);

  await gql(GRAPHQL, `mutation($id:UUID!){ activateWorkflowVersion(workflowVersionId:$id) }`, { id: workflowVersionId });
  console.log('activated. workflowId=', workflowId, 'versionId=', workflowVersionId);
  console.log('\nReminder: requires the twenty-server WORKER process running to actually fire.');
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
