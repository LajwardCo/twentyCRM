# Competitor Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision four custom objects (Competitor, Competitor Product, Competitor Update, Competitor Usage) with fields, relations, and daily-use views into the Twenty workspace via the metadata API.

**Architecture:** One idempotent Node ESM provisioning script that authenticates to the metadata GraphQL endpoint and creates objects → fields → relations, mirroring `tools/sales-crm/provision-whatsapp.mjs`. A second script provisions saved views, mirroring `tools/sales-crm/provision-views.mjs`. Scripts are the prod deploy vehicle (idempotent, env-var driven). No `twenty-server` entity changes, so no instance/upgrade command.

**Tech Stack:** Node ESM (`.mjs`), `fetch`, Twenty metadata GraphQL API (`CreateOneObjectInput`, `CreateOneFieldMetadataInput`, `CreateViewInput`).

**Reference files (read before starting):**
- `tools/sales-crm/provision-whatsapp.mjs` — object/field/relation provisioning shape
- `tools/sales-crm/provision-views.mjs` — view/filter/sort provisioning + retry `gql` wrapper
- `docs/superpowers/specs/2026-07-06-competitor-intelligence-design.md` — the spec

**Verification model:** Provisioning scripts have no jest tests. Each task is verified by running the script against the local instance (server must be running at `localhost:3011`, metadata at `localhost:3010`) and confirming results via a metadata query and/or the Postgres MCP, then re-running to confirm idempotency (all `skip`).

**Prereq:** local Twenty running. Env defaults in the scripts (`tim@apple.dev`) target local. Per the dev-env memory, this fork runs the app on 3010/3011.

---

### Task 1: Create the object/field/relation provisioning script

**Files:**
- Create: `tools/sales-crm/provision-competitor-intel.mjs`

- [ ] **Step 1: Write the script**

```javascript
// tools/sales-crm/provision-competitor-intel.mjs
// Competitor Intelligence objects: Competitor, Competitor Product,
// Competitor Update, Competitor Usage. See
// docs/superpowers/specs/2026-07-06-competitor-intelligence-design.md.
// Idempotent: skips objects/fields/relations that already exist. Non-fatal per item.
const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';

let TOKEN = null;
async function gqlOnce(query, variables) {
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
async function gql(query, variables) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try { return await gqlOnce(query, variables); }
    catch (e) {
      if (!(e instanceof TypeError) || attempt === 5) throw e;
      console.error(`  (network hiccup, retry ${attempt}/5 in ${attempt * 2}s: ${e.message})`);
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
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

async function fetchObjects() {
  const d = await gql(`query {
    objects(paging:{first:500}) { edges { node {
      id nameSingular isSystem
      fields(paging:{first:500}) { edges { node { name } } }
    } } }
  }`);
  const map = {};
  for (const { node } of d.objects.edges) {
    map[node.nameSingular] = { id: node.id, fields: new Set(node.fields.edges.map((e) => e.node.name)) };
  }
  return map;
}

async function createObject(spec) {
  const d = await gql(
    `mutation($input:CreateOneObjectInput!){createOneObject(input:$input){id nameSingular}}`,
    { input: { object: spec } },
  );
  return d.createOneObject;
}
// Creates a field. Retries LINKS as TEXT if the metadata API rejects LINKS in this version.
async function createField(input) {
  try {
    const d = await gql(`mutation($input:CreateOneFieldMetadataInput!){createOneField(input:$input){id name}}`, { input: { field: input } });
    return { field: d.createOneField, note: '' };
  } catch (e) {
    if (input.type === 'LINKS') {
      const d = await gql(`mutation($input:CreateOneFieldMetadataInput!){createOneField(input:$input){id name}}`, { input: { field: { ...input, type: 'TEXT' } } });
      return { field: d.createOneField, note: 'LINKS->TEXT fallback' };
    }
    throw e;
  }
}

const opt = (value, label, position, color) => ({ value, label, position, color });

// ---- model ----
const OBJECTS = [
  { nameSingular: 'competitor', namePlural: 'competitors', labelSingular: 'Competitor', labelPlural: 'Competitors', icon: 'IconSwords', description: 'A company we compete with' },
  { nameSingular: 'competitorProduct', namePlural: 'competitorProducts', labelSingular: 'Competitor Product', labelPlural: 'Competitor Products', icon: 'IconBox', description: 'A product or offering sold by a competitor' },
  { nameSingular: 'competitorUpdate', namePlural: 'competitorUpdates', labelSingular: 'Competitor Update', labelPlural: 'Competitor Updates', icon: 'IconNews', description: 'A dated piece of news or change about a competitor' },
  { nameSingular: 'competitorUsage', namePlural: 'competitorUsages', labelSingular: 'Competitor Usage', labelPlural: 'Competitor Usages', icon: 'IconLink', description: 'A record that one of our leads uses a competitor product' },
];

const FIELDS = {
  competitor: [
    { name: 'website', label: 'Website', type: 'LINKS' },
    { name: 'description', label: 'Description', type: 'TEXT' },
    { name: 'tier', label: 'Tier', type: 'SELECT', options: [opt('LEADER', 'Leader', 0, 'red'), opt('CHALLENGER', 'Challenger', 1, 'orange'), opt('NICHE', 'Niche', 2, 'blue'), opt('EMERGING', 'Emerging', 3, 'green')] },
    { name: 'threatLevel', label: 'Threat Level', type: 'SELECT', options: [opt('HIGH', 'High', 0, 'red'), opt('MEDIUM', 'Medium', 1, 'orange'), opt('LOW', 'Low', 2, 'green')] },
    { name: 'status', label: 'Status', type: 'SELECT', options: [opt('ACTIVELY_TRACKING', 'Actively Tracking', 0, 'green'), opt('WATCHING', 'Watching', 1, 'blue'), opt('DORMANT', 'Dormant', 2, 'gray')] },
    { name: 'strengths', label: 'Strengths', type: 'TEXT' },
    { name: 'weaknesses', label: 'Weaknesses', type: 'TEXT' },
  ],
  competitorProduct: [
    { name: 'category', label: 'Category', type: 'SELECT', options: [opt('CORE', 'Core Product', 0, 'blue'), opt('ADDON', 'Add-on', 1, 'purple'), opt('SERVICE', 'Service', 2, 'green')] },
    { name: 'description', label: 'Description', type: 'TEXT' },
    { name: 'demoUrl', label: 'Demo URL', type: 'LINKS' },
    { name: 'pricingModel', label: 'Pricing Model', type: 'SELECT', options: [opt('SUBSCRIPTION', 'Subscription', 0, 'blue'), opt('ONE_TIME', 'One-time', 1, 'green'), opt('USAGE_BASED', 'Usage-based', 2, 'orange'), opt('FREEMIUM', 'Freemium', 3, 'purple'), opt('CUSTOM', 'Custom', 4, 'gray')] },
    { name: 'startingPrice', label: 'Starting Price', type: 'CURRENCY' },
    { name: 'pricingSummary', label: 'Pricing Summary', type: 'TEXT' },
    { name: 'strengths', label: 'Strengths', type: 'TEXT' },
    { name: 'weaknesses', label: 'Weaknesses', type: 'TEXT' },
  ],
  competitorUpdate: [
    { name: 'type', label: 'Type', type: 'SELECT', options: [opt('PRODUCT_UPDATE', 'Product Update', 0, 'blue'), opt('PRICING_CHANGE', 'Pricing Change', 1, 'orange'), opt('NEWS', 'News', 2, 'gray'), opt('WIN', 'Win', 3, 'green'), opt('LOSS', 'Loss', 4, 'red'), opt('FUNDING', 'Funding', 5, 'purple')] },
    { name: 'date', label: 'Date', type: 'DATE_TIME' },
    { name: 'body', label: 'Body', type: 'TEXT' },
    { name: 'source', label: 'Source', type: 'LINKS' },
  ],
  competitorUsage: [
    { name: 'status', label: 'Status', type: 'SELECT', options: [opt('CURRENT_USER', 'Current User', 0, 'green'), opt('EVALUATING', 'Evaluating', 1, 'orange'), opt('FORMER_USER', 'Former User', 2, 'gray')] },
    { name: 'satisfaction', label: 'Satisfaction', type: 'SELECT', options: [opt('HAPPY', 'Happy', 0, 'green'), opt('NEUTRAL', 'Neutral', 1, 'blue'), opt('UNHAPPY', 'Unhappy', 2, 'red')] },
    { name: 'switchingSignal', label: 'Switching Signal', type: 'SELECT', options: [opt('NONE', 'None', 0, 'gray'), opt('INTERESTED', 'Interested', 1, 'blue'), opt('ACTIVELY_LOOKING', 'Actively Looking', 2, 'orange'), opt('COMMITTED', 'Committed', 3, 'green')] },
    { name: 'renewalDate', label: 'Renewal Date', type: 'DATE_TIME' },
    { name: 'notes', label: 'Notes', type: 'TEXT' },
  ],
};

// relations: created as MANY_TO_ONE on `source`, pointing to `target`
const RELATIONS = [
  { source: 'competitorProduct', name: 'competitor', label: 'Competitor', target: 'competitor', targetFieldLabel: 'Products', targetFieldIcon: 'IconBox', icon: 'IconSwords' },
  { source: 'competitorUpdate', name: 'competitor', label: 'Competitor', target: 'competitor', targetFieldLabel: 'Updates', targetFieldIcon: 'IconNews', icon: 'IconSwords' },
  { source: 'competitorUpdate', name: 'product', label: 'Product', target: 'competitorProduct', targetFieldLabel: 'Updates', targetFieldIcon: 'IconNews', icon: 'IconBox' },
  { source: 'competitorUsage', name: 'competitor', label: 'Competitor', target: 'competitor', targetFieldLabel: 'Usages', targetFieldIcon: 'IconLink', icon: 'IconSwords' },
  { source: 'competitorUsage', name: 'product', label: 'Product', target: 'competitorProduct', targetFieldLabel: 'Usages', targetFieldIcon: 'IconLink', icon: 'IconBox' },
  { source: 'competitorUsage', name: 'person', label: 'Person', target: 'person', targetFieldLabel: 'Competitor Usages', targetFieldIcon: 'IconLink', icon: 'IconUser' },
  { source: 'competitorUsage', name: 'opportunity', label: 'Opportunity', target: 'opportunity', targetFieldLabel: 'Competitor Usages', targetFieldIcon: 'IconLink', icon: 'IconTargetArrow' },
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
      try { const { note } = await createField({ objectMetadataId: obj.id, ...f }); rec('field', `${objName}.${f.name}`, 'created', note); }
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
        objectMetadataId: src.id,
        name: r.name,
        label: r.label,
        type: 'RELATION',
        icon: r.icon,
        relationCreationPayload: {
          type: 'MANY_TO_ONE',
          targetObjectMetadataId: tgt.id,
          targetFieldLabel: r.targetFieldLabel,
          targetFieldIcon: r.targetFieldIcon,
        },
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

- [ ] **Step 2: Commit**

```bash
git add tools/sales-crm/provision-competitor-intel.mjs
git commit -m "feat(sales-crm): provisioning script for Competitor Intelligence objects"
```

---

### Task 2: Run against local and verify objects, fields, relations

**Prereq:** local Twenty server + metadata up (`localhost:3011` / `localhost:3010`). If not running, start it (see CLAUDE.md `yarn start`) before this task.

- [ ] **Step 1: Run the script**

Run: `node tools/sales-crm/provision-competitor-intel.mjs`
Expected: `authenticated.`, then object/field/relation lines, ending with a SUMMARY showing `0 failed`. Note any `LINKS->TEXT fallback` detail on website/demoUrl/source fields — expected and acceptable.

- [ ] **Step 2: Verify the four objects and their field counts via metadata query**

Run:
```bash
node -e "const q=async()=>{const META='http://localhost:3010/metadata',ORIGIN='http://localhost:3011';const g=async(query,variables,t)=>{const r=await fetch(META,{method:'POST',headers:{'Content-Type':'application/json',Origin:ORIGIN,...(t?{Authorization:'Bearer '+t}:{})},body:JSON.stringify({query,variables})});return (await r.json())};const a=(await g('mutation(\$e:String!,\$p:String!,\$o:String!){getLoginTokenFromCredentials(email:\$e,password:\$p,origin:\$o){loginToken{token}}}',{e:'tim@apple.dev',p:'tim@apple.dev',o:ORIGIN})).data;const b=(await g('mutation(\$t:String!,\$o:String!){getAuthTokensFromLoginToken(loginToken:\$t,origin:\$o){tokens{accessOrWorkspaceAgnosticToken{token}}}}',{t:a.getLoginTokenFromCredentials.loginToken.token,o:ORIGIN})).data;const T=b.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;const d=(await g('{objects(paging:{first:500}){edges{node{nameSingular fields(paging:{first:500}){edges{node{name type}}}}}}',{},T)).data;for(const{node}of d.objects.edges){if(node.nameSingular.startsWith('competitor'))console.log(node.nameSingular, node.fields.edges.length+' fields');}};q();"
```
Expected: four lines — `competitor`, `competitorProduct`, `competitorUpdate`, `competitorUsage` — each with a field count that includes the base fields plus the ones provisioned (competitor ≥ 7 custom, competitorUsage ≥ 5 custom + relations). If any object is missing, re-check Step 1 output for FAILs.

- [ ] **Step 3: Verify idempotency — re-run the script**

Run: `node tools/sales-crm/provision-competitor-intel.mjs`
Expected: SUMMARY shows `0 created, N skipped, 0 failed` — every object/field/relation reports `skip: exists`.

- [ ] **Step 4: No commit** (verification only — the script was committed in Task 1). If Step 1 required a code fix to the script, commit it now:

```bash
git add tools/sales-crm/provision-competitor-intel.mjs
git commit -m "fix(sales-crm): adjust Competitor Intelligence provisioning after local run"
```

---

### Task 3: Provision the four views

**Files:**
- Create: `tools/sales-crm/provision-competitor-views.mjs`

- [ ] **Step 1: Write the view script**

```javascript
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
```

- [ ] **Step 2: Run the view script**

Run: `node tools/sales-crm/provision-competitor-views.mjs`
Expected: five `created:` lines. If `KANBAN` type or the `IS_NOT` operand is rejected, the FATAL message names it — adjust (Kanban→TABLE with `mainGroupByFieldMetadataId`, or filter operand to the version's enum) and re-run.

- [ ] **Step 3: Verify idempotency**

Run: `node tools/sales-crm/provision-competitor-views.mjs`
Expected: five `skip: ... (exists)` lines.

- [ ] **Step 4: Commit**

```bash
git add tools/sales-crm/provision-competitor-views.mjs
git commit -m "feat(sales-crm): saved views for Competitor Intelligence"
```

---

### Task 4: Document deploy + register scripts in README

**Files:**
- Modify: `tools/sales-crm/DEPLOY-TO-PRODUCTION.md`
- Modify: `tools/sales-crm/README.md`

- [ ] **Step 1: Read both files to match their existing structure**

Run: `sed -n '1,80p' tools/sales-crm/DEPLOY-TO-PRODUCTION.md; echo '==='; sed -n '1,60p' tools/sales-crm/README.md`
Expected: see how prior objects (WhatsApp, Discount Rules) documented their prod run step and README entry.

- [ ] **Step 2: Add a Competitor Intelligence section to DEPLOY-TO-PRODUCTION.md**

Follow the file's existing format. The run step is (adjust env values to match how other objects document prod there):

```bash
TWENTY_META=<prod-metadata-url> TWENTY_ORIGIN=<prod-origin> \
TWENTY_EMAIL=<admin-email> TWENTY_PASSWORD=<admin-password> \
node tools/sales-crm/provision-competitor-intel.mjs

TWENTY_META=<prod-metadata-url> TWENTY_ORIGIN=<prod-origin> \
TWENTY_EMAIL=<admin-email> TWENTY_PASSWORD=<admin-password> \
node tools/sales-crm/provision-competitor-views.mjs
```

Note in the doc: run `provision-competitor-intel.mjs` first (objects/fields/relations), then `provision-competitor-views.mjs` (views depend on the objects). Both idempotent.

- [ ] **Step 3: Add both scripts to README.md**

Add lines matching the existing list style, e.g.:
```
- `provision-competitor-intel.mjs` — Competitor / Competitor Product / Competitor Update / Competitor Usage objects
- `provision-competitor-views.mjs` — saved views for the Competitor Intelligence objects
```

- [ ] **Step 4: Commit**

```bash
git add tools/sales-crm/DEPLOY-TO-PRODUCTION.md tools/sales-crm/README.md
git commit -m "docs(sales-crm): document Competitor Intelligence provisioning + deploy"
```

---

### Task 5: Final end-to-end verification

- [ ] **Step 1: Confirm objects visible in the UI**

Open the local app (`localhost:3011`), log in with the prefilled "Continue with Email" credentials, and confirm Competitor, Competitor Product, Competitor Update, Competitor Usage appear in the navigation / object list, and the five views are present. Create one Competitor record and one Competitor Product linked to it to confirm the relation works.

- [ ] **Step 2: Spot-check the relation wiring via Postgres MCP (optional)**

Use the read-only Postgres MCP to confirm the relation columns exist on the workspace schema for `competitorProduct` (a `competitorId` FK) and `competitorUsage` (competitorId, competitorProductId, personId, opportunityId). This confirms the metadata generated real columns.

- [ ] **Step 3: Update memory**

Append a one-line pointer in the auto-memory index and a memory file noting the Competitor Intelligence objects were added to the sales-crm build (objects + views, AI generator deferred). Link `[[sales-crm-build]]`.
```
