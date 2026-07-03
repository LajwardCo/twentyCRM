# Contact Request (Website Intake) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Contact Request` custom object (website question/demo-request intake) to the Twenty sales-crm fork, auto-linked to Person by email, manually promotable to Opportunity, with a one-click "Send Message" action that emails the requester and marks the request Replied.

**Architecture:** Pure metadata + native-workflow provisioning, following the exact pattern already established in `tools/sales-crm/` (idempotent `.mjs` scripts against the metadata + `/graphql` GraphQL APIs — no new TypeScript entities or server code, since nothing here needs synchronous save-blocking or derived-field computation the way Phase 3's discount/pricing hooks did). Two workflows: one `DATABASE_EVENT`-triggered auto-link-to-Person, one `MANUAL`-triggered send-and-close action.

**Tech Stack:** Node.js (`.mjs` scripts, Node 24), Twenty metadata GraphQL API, Twenty `/graphql` workflow-builder API (`createWorkflow`/`createWorkflowVersionStep`/`updateWorkflowVersionStep`/`activateWorkflowVersion`).

---

## Reference: exact schemas this plan depends on (verified against source, not docs)

- `FIND_RECORDS` step input: `{ objectName, limit?, filter: { recordFilters: RecordFilter[], recordFilterGroups: RecordFilterGroup[] } }`. **The `gqlOperationFilter` field in the schema is dead for this action** — `packages/twenty-server/.../find-records.workflow-action.ts` only computes a real filter when `filter.recordFilters` AND `filter.recordFilterGroups` are both present; otherwise it silently filters on `{}` (returns everything). Output: `{ first, all, totalCount }`.
- `RecordFilter`: `{ id, fieldMetadataId, value, type, operand, subFieldName?, recordFilterGroupId }`. For Person's composite `emails` field, only `subFieldName: 'primaryEmail'` + `operand: 'CONTAINS'` is supported (compiles to `ilike '%value%'` — see `computeGqlOperationFilterForEmails.ts`). No exact-equals operand exists for this subfield, so this is a case-insensitive substring match on email, not is a genuine engine limitation, not a shortcut taken here.
- `IF_ELSE` step input: `{ stepFilterGroups: [{id, logicalOperator:'AND'}], stepFilters: [{id, type, stepOutputKey, operand, value, stepFilterGroupId}], branches: [{id, filterGroupId?, nextStepIds}] }`. A branch with **no** `filterGroupId` is the catch-all/else and must be evaluated last (branches are matched in array order, first match wins — `find-matching-branch.util.ts`). **Branch routing at runtime is driven entirely by `branches[].nextStepIds`**, not by the generic per-step `nextStepIds` set by the parent-child `createWorkflowVersionStep` wiring — so branches must be set explicitly via `updateWorkflowVersionStep`, same "re-fetch fresh steps then patch" idiom the round-robin workflow already uses.
- `CREATE_RECORD` / `UPDATE_RECORD` `objectRecord`: composite fields need their sub-shape, e.g. `{"name": {"firstName": "...", "lastName": "..."}, "emails": {"primaryEmail": "..."}}` (from `object-record-schema.ts`'s own doc comment). Step output for `CREATE_RECORD` is the created record directly, so `{{stepId.id}}` gives the new record's id (same pattern as `{{codeStepId.pickedOwnerId}}` in the round-robin workflow).
- `MANUAL` trigger settings: `{ outputSchema: {}, icon?, availability: { type: 'SINGLE_RECORD', objectNameSingular: 'contactRequest' } }`. **Correction found during Task 3 live verification:** the schema's own `.describe()` text (and this plan's original draft) says the selected record's fields are available via `{{trigger.record.<field>}}` — that path is stale/never wired at runtime. `getWorkflowRunContext.ts` builds `stepInfos.trigger.result` with fields flattened directly on `trigger`, duplicated under `trigger.payload` (`WORKFLOW_TRIGGER_PAYLOAD_KEY = 'payload'`) — there is no `record` key at all. Use `{{trigger.payload.<field>}}`. Confirmed against a real workflow run (`8312b29f`).
- `FORM` step input: `z.array({ id, name, label, type, placeholder? })`. A later step reads the submitted value via `{{formStepId.<name>}}`.
- `SEND_EMAIL` step input: `{ connectedAccountId, recipients: { to, cc?, bcc? }, subject?, body? }`. Requires a real connected email account in the workspace — looked up via `myConnectedAccounts` query, not provisionable by script (external prerequisite, same category as Phase 3's `externalSystemUrl` needing a real public endpoint). **Correction found during Task 3 live verification:** `myConnectedAccounts` is a metadata-only resolver (`@MetadataResolver` in `connected-account.resolver.ts`) — query it against `/metadata`, not `/graphql` (it 404s/errors there). The field is `name`, not `accountName`. Also note: this query returns ALL connected accounts unfiltered, including ones with dead OAuth tokens (`authFailedAt` set) — picking `[0]` unconditionally can silently wire a broken account into the workflow; a seeded dev-fixture account with no working refresh token was hit exactly this way during verification (see Task 3's report — genuine external limitation, not a config bug).

---

## Task 1: Contact Request object, fields, relations

**Files:**
- Create: `tools/sales-crm/provision-contact-request-object.mjs`
- Modify: `tools/sales-crm/README.md`

- [ ] **Step 1: Write the provisioning script**

```javascript
// Contact Request: inbound website submissions (questions / demo requests).
// Same pattern/idempotency as provision-phase2-objects.mjs.
//
// Deliberately a separate object from Person, not a merge into it: a website
// submission is raw, unqualified intake that may or may not become a real
// Person or Opportunity. See docs/superpowers/specs/2026-07-03-contact-request-model-design.md.
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
  if (json.errors) throw new Error(JSON.stringify(json.errors.map((e) => e.message)));
  return json.data;
}
async function login() {
  const a = await gql(`mutation($e:String!,$p:String!,$o:String!){getLoginTokenFromCredentials(email:$e,password:$p,origin:$o){loginToken{token}}}`, { e: EMAIL, p: PASSWORD, o: ORIGIN });
  const b = await gql(`mutation($t:String!,$o:String!){getAuthTokensFromLoginToken(loginToken:$t,origin:$o){tokens{accessOrWorkspaceAgnosticToken{token}}}}`, { t: a.getLoginTokenFromCredentials.loginToken.token, o: ORIGIN });
  TOKEN = b.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;
}
async function fetchObjects() {
  const d = await gql(`query { objects(paging:{first:500}) { edges { node {
    id nameSingular isSystem
    fields(paging:{first:500}) { edges { node { id name } } }
  } } } }`);
  const map = {};
  for (const { node } of d.objects.edges) {
    map[node.nameSingular] = { id: node.id, fields: new Map(node.fields.edges.map((e) => [e.node.name, e.node.id])) };
  }
  return map;
}
async function createObject(spec) {
  const d = await gql(`mutation($input:CreateOneObjectInput!){createOneObject(input:$input){id nameSingular}}`, { input: { object: spec } });
  return d.createOneObject;
}
async function createField(input) {
  const d = await gql(`mutation($input:CreateOneFieldMetadataInput!){createOneField(input:$input){id name}}`, { input: { field: input } });
  return d.createOneField;
}
const opt = (value, label, position, color) => ({ value, label, position, color });

const OBJECTS = [
  { nameSingular: 'contactRequest', namePlural: 'contactRequests', labelSingular: 'Contact Request', labelPlural: 'Contact Requests', icon: 'IconMessageQuestion', description: 'An inbound website submission — a question or demo request' },
];

const FIELDS = {
  contactRequest: [
    { name: 'fullName', label: 'Full Name', type: 'TEXT' },
    { name: 'email', label: 'Email', type: 'TEXT' },
    { name: 'phone', label: 'Phone', type: 'PHONES' },
    { name: 'category', label: 'Category', type: 'SELECT', options: [opt('QUESTION', 'Question', 0, 'blue'), opt('DEMO_REQUEST', 'Demo Request', 1, 'green')] },
    { name: 'message', label: 'Message', type: 'TEXT' },
    { name: 'preferredContactMethod', label: 'Preferred Contact Method', type: 'SELECT', options: [opt('PHONE', 'Phone', 0, 'blue'), opt('WHATSAPP', 'WhatsApp', 1, 'turquoise'), opt('TELEGRAM', 'Telegram', 2, 'sky'), opt('FACEBOOK', 'Facebook', 3, 'purple'), opt('EMAIL', 'Email', 4, 'green'), opt('IN_PERSON', 'In-person', 5, 'gray')] },
    { name: 'status', label: 'Status', type: 'SELECT', options: [opt('NEW', 'New', 0, 'blue'), opt('REPLIED', 'Replied', 1, 'orange'), opt('CLOSED', 'Closed', 2, 'gray')] },
    { name: 'sourceUrl', label: 'Source URL', type: 'TEXT' },
  ],
};

const RELATIONS = [
  { source: 'contactRequest', name: 'person', label: 'Person', target: 'person', targetFieldLabel: 'Contact Requests', targetFieldIcon: 'IconMessageQuestion', icon: 'IconUser' },
  { source: 'contactRequest', name: 'opportunity', label: 'Opportunity', target: 'opportunity', targetFieldLabel: 'Contact Requests', targetFieldIcon: 'IconMessageQuestion', icon: 'IconTargetArrow' },
];

const log = [];
const rec = (kind, name, status, detail = '') => { log.push({ kind, name, status, detail }); console.log(`  [${status}] ${kind}: ${name}${detail ? ' — ' + detail : ''}`); };

async function main() {
  await login();
  console.log('authenticated.\n');
  let objs = await fetchObjects();

  console.log('== objects ==');
  for (const spec of OBJECTS) {
    if (objs[spec.nameSingular]) { rec('object', spec.nameSingular, 'skip', 'exists'); continue; }
    try { const o = await createObject(spec); rec('object', o.nameSingular, 'created', o.id); }
    catch (e) { rec('object', spec.nameSingular, 'FAIL', e.message); }
  }
  objs = await fetchObjects();

  console.log('\n== fields ==');
  for (const [objName, fields] of Object.entries(FIELDS)) {
    const obj = objs[objName];
    if (!obj) { rec('field', objName + '.*', 'FAIL', 'object missing'); continue; }
    for (const f of fields) {
      if (obj.fields.has(f.name)) { rec('field', `${objName}.${f.name}`, 'skip', 'exists'); continue; }
      try { await createField({ objectMetadataId: obj.id, ...f }); rec('field', `${objName}.${f.name}`, 'created'); }
      catch (e) { rec('field', `${objName}.${f.name}`, 'FAIL', e.message); }
    }
  }
  objs = await fetchObjects();

  console.log('\n== relations ==');
  for (const r of RELATIONS) {
    const src = objs[r.source], tgt = objs[r.target];
    if (!src || !tgt) { rec('relation', `${r.source}.${r.name}`, 'FAIL', 'src/tgt missing'); continue; }
    if (src.fields.has(r.name)) { rec('relation', `${r.source}.${r.name}`, 'skip', 'exists'); continue; }
    try {
      await createField({
        objectMetadataId: src.id, name: r.name, label: r.label, type: 'RELATION', icon: r.icon,
        relationCreationPayload: { type: 'MANY_TO_ONE', targetObjectMetadataId: tgt.id, targetFieldLabel: r.targetFieldLabel, targetFieldIcon: r.targetFieldIcon },
      });
      rec('relation', `${r.source}.${r.name} -> ${r.target}`, 'created');
    } catch (e) { rec('relation', `${r.source}.${r.name}`, 'FAIL', e.message); }
  }

  const fails = log.filter((l) => l.status === 'FAIL');
  console.log(`\n==== SUMMARY: ${log.filter(l=>l.status==='created').length} created, ${log.filter(l=>l.status==='skip').length} skipped, ${fails.length} failed ====`);
  if (fails.length) process.exitCode = 1;
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
```

- [ ] **Step 2: Run it against the local dev instance**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
node tools/sales-crm/provision-contact-request-object.mjs
```

Expected: `SUMMARY: 11 created, 0 skipped, 0 failed` on first run (1 object + 8 fields + 2 relations), `0 created, 11 skipped, 0 failed` on a second run (idempotency check).

- [ ] **Step 3: Verify in the metadata API**

```bash
node -e "
const META='http://localhost:3010/metadata', ORIGIN='http://localhost:3011';
(async () => {
  const login1 = await fetch(META,{method:'POST',headers:{'Content-Type':'application/json',Origin:ORIGIN},body:JSON.stringify({query:'mutation(\$e:String!,\$p:String!,\$o:String!){getLoginTokenFromCredentials(email:\$e,password:\$p,origin:\$o){loginToken{token}}}',variables:{e:'tim@apple.dev',p:'tim@apple.dev',o:ORIGIN}})}).then(r=>r.json());
  const login2 = await fetch(META,{method:'POST',headers:{'Content-Type':'application/json',Origin:ORIGIN},body:JSON.stringify({query:'mutation(\$t:String!,\$o:String!){getAuthTokensFromLoginToken(loginToken:\$t,origin:\$o){tokens{accessOrWorkspaceAgnosticToken{token}}}}',variables:{t:login1.data.getLoginTokenFromCredentials.loginToken.token,o:ORIGIN}})}).then(r=>r.json());
  const token = login2.data.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;
  const r = await fetch(META,{method:'POST',headers:{'Content-Type':'application/json',Origin:ORIGIN,Authorization:'Bearer '+token},body:JSON.stringify({query:'query{objects(filter:{nameSingular:{eq:\"contactRequest\"}}){edges{node{id nameSingular fields(paging:{first:50}){edges{node{name type}}}}}}}'})}).then(r=>r.json());
  console.log(JSON.stringify(r.data, null, 2));
})();
"
```

Expected: one object `contactRequest` with 8 own fields (fullName, email, phone, category, message, preferredContactMethod, status, sourceUrl) plus `person` and `opportunity` relation fields.

- [ ] **Step 4: Commit**

```bash
git add tools/sales-crm/provision-contact-request-object.mjs
git commit -m "feat(sales-crm): provision Contact Request object, fields, relations"
```

---

## Task 2: Auto-link workflow (Contact Request → Person)

**Files:**
- Create: `tools/sales-crm/provision-contact-request-autolink-workflow.mjs`

Depends on Task 1 (the `contactRequest` object and its `person` relation must exist).

- [ ] **Step 1: Write the workflow provisioning script**

```javascript
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
  const d = await gql(META, `query($n:String!){ objects(filter:{nameSingular:{eq:$n}}) { edges { node { id fields(paging:{first:500}) { edges { node { id name } } } } } } }`, { n: objectNameSingular });
  const obj = d.objects.edges[0]?.node;
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
```

- [ ] **Step 2: Run it (worker must be running first)**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npx nx run twenty-server:worker &   # if not already running
node tools/sales-crm/provision-contact-request-autolink-workflow.mjs
```

Expected: `activated. workflowId= ... versionId= ...`, then a second run prints `EXISTS, skipping`.

- [ ] **Step 3: Live verification — existing Person match**

Create a Person with a known email, then create a Contact Request via `/graphql`'s `createOneContactRequest` with the same email, wait ~2s, then query the Contact Request's `person.id` and confirm it equals the existing Person's id (not a newly created one).

- [ ] **Step 4: Live verification — new Person creation**

Create a Contact Request with an email that matches no existing Person. Confirm a new Person now exists with that email (`emails.primaryEmail`) and the Contact Request's `person` relation points to it.

- [ ] **Step 5: Commit**

```bash
git add tools/sales-crm/provision-contact-request-autolink-workflow.mjs
git commit -m "feat(sales-crm): Contact Request auto-link-to-Person workflow"
```

---

## Task 3: Send-reply workflow (manual action on Contact Request)

**Files:**
- Create: `tools/sales-crm/provision-contact-request-reply-workflow.mjs`

Depends on Task 1. Requires a connected email account in the target workspace (Settings → Accounts in Twenty's UI) — this is an external prerequisite the script cannot provision, same category as Phase 3's `externalSystemUrl` needing a real endpoint.

- [ ] **Step 1: Write the workflow provisioning script**

```javascript
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
  const d = await gql(GRAPHQL, `query { myConnectedAccounts { id handle accountName } }`, {});
  const account = d.myConnectedAccounts?.[0];
  if (!account) throw new Error('No connected email account found. Connect one via Settings > Accounts before running this script.');
  console.log('using connected account:', account.handle);
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

  const sendEmailPatched = structuredClone(freshById[sendEmail.id]);
  sendEmailPatched.settings.input = {
    connectedAccountId,
    recipients: { to: '{{trigger.record.email}}' },
    subject: 'Re: your request',
    body: `{{${form.id}.message}}`,
  };
  await updateStep(workflowVersionId, sendEmailPatched);

  const markRepliedPatched = structuredClone(freshById[markReplied.id]);
  markRepliedPatched.settings.input = {
    objectName: 'contactRequest',
    objectRecordId: '{{trigger.record.id}}',
    fieldsToUpdate: ['status'],
    objectRecord: { status: 'REPLIED' },
  };
  await updateStep(workflowVersionId, markRepliedPatched);

  await gql(GRAPHQL, `mutation($id:UUID!){ activateWorkflowVersion(workflowVersionId:$id) }`, { id: workflowVersionId });
  console.log('activated. workflowId=', workflowId, 'versionId=', workflowVersionId);
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
```

- [ ] **Step 2: Run it**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
node tools/sales-crm/provision-contact-request-reply-workflow.mjs
```

Expected: either `activated. workflowId= ...` or a clear `FATAL: No connected email account found...` if the prerequisite isn't met — in that case, connect an account via Twenty's UI (Settings → Accounts) and re-run.

- [ ] **Step 3: Live verification**

Open a Contact Request record in the Twenty UI, trigger the "Send Message (manual)" action, type a message, submit. Confirm: an email arrives at the request's `email` address with the typed message as the body, and the record's `status` flips to `Replied`.

- [ ] **Step 4: Commit**

```bash
git add tools/sales-crm/provision-contact-request-reply-workflow.mjs
git commit -m "feat(sales-crm): Contact Request send-reply manual workflow"
```

---

## Task 4: Documentation

**Files:**
- Modify: `tools/sales-crm/README.md`

- [ ] **Step 1: Add a new section documenting the three scripts**

Add after the `provision-external-sync-workflow.mjs` bullet in the "What they do" list:

```markdown
- `provision-contact-request-object.mjs` — creates the **Contact Request**
  custom object (inbound website questions/demo requests: fullName, email,
  phone, category, message, preferredContactMethod, status, sourceUrl) with
  relations to Person and Opportunity. Idempotent.
- `provision-contact-request-autolink-workflow.mjs` — creates the **"Contact
  Request Auto-Link Person"** workflow (trigger: Contact Request created ->
  find Person by email (substring match on `emails.primaryEmail` — the only
  operand Twenty exposes for that subfield) -> link if found, else create a
  new Person and link it). Idempotent. Requires the twenty-server WORKER
  process running (same DATABASE_EVENT requirement as round-robin).
- `provision-contact-request-reply-workflow.mjs` — creates the **"Send
  Contact Request Reply"** workflow: a manual "Send Message" action on a
  Contact Request record that pops a one-field form, emails the typed message
  to the requester via Twenty's native SEND_EMAIL action, and sets status to
  Replied. Idempotent. **Requires a connected email account** in the
  workspace (Settings > Accounts) — the script fails loudly if none exists.
```

Add to the "Prerequisites" list:

```markdown
- A connected email account in the workspace (Settings > Accounts), for the
  Contact Request reply workflow only.
```

Add a short "Website integration" note near the bottom:

```markdown
## Website integration (Contact Request intake)

Once `provision-contact-request-object.mjs` has run, the standard
`createOneContactRequest` mutation is available on `/graphql` like any other
object — no extra provisioning needed for intake itself. Generate a scoped
API key for the workspace via Settings > APIs (Twenty's own UI, not a
script) and have the website POST to `/graphql` with it as a Bearer token.
Filtering by `category`/`status` works through Twenty's standard view
filters once Contact Requests exist.
```

- [ ] **Step 2: Commit**

```bash
git add tools/sales-crm/README.md
git commit -m "docs(sales-crm): document Contact Request scripts"
```

---

## Task 5: End-to-end verification against the running local stack

**Files:** none (verification only)

- [ ] **Step 1: Confirm local stack is up**

```bash
curl -sf http://localhost:3010/healthz || echo "server not running"
```

If not running: `npx nx start twenty-server` (and `npx nx run twenty-server:worker` in a separate terminal — required for Task 2's DATABASE_EVENT trigger).

- [ ] **Step 2: Run all three provisioning scripts in order**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
node tools/sales-crm/provision-contact-request-object.mjs
node tools/sales-crm/provision-contact-request-autolink-workflow.mjs
node tools/sales-crm/provision-contact-request-reply-workflow.mjs
```

Expected: all three report success (create-or-skip, no FAIL/FATAL lines).

- [ ] **Step 3: Full-cycle live test**

1. Create a Contact Request via `/graphql`'s `createOneContactRequest` mutation with a brand-new email, `category: DEMO_REQUEST`, a `message`, and `preferredContactMethod: EMAIL`.
2. Wait ~2s, re-fetch it, confirm `person` is now linked to a newly created Person with that email.
3. In the Twenty UI, open the Contact Request, manually link it to an existing (or new) Opportunity, and confirm it now appears in that Opportunity's related-records panel. Also check the Opportunity's Timeline tab to see whether Twenty's `targetCustom` hook auto-surfaces it there too (bonus if so, not required — the related-records panel is the guaranteed mechanism per the design spec).
4. Trigger "Send Message (manual)" on the Contact Request, type a message, submit. Confirm the email arrives and `status` becomes `Replied`.
5. Re-submit a second Contact Request using the **same** email from step 1. Confirm it links to the **same** Person (not a duplicate).

- [ ] **Step 4: Report results**

No commit for this task — it's verification only. Note any deviations from expected behavior for follow-up (this plan does not include automated regression tests, matching the established precedent for this directory's provisioning scripts — see Task reference notes above).
