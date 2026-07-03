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
