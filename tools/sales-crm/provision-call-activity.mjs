// Call Activity: one work call made or received by a seller, linked to the
// contact, the lead and the agent. Written by the Call Companion mobile app;
// see docs/superpowers/specs/2026-08-31-call-companion-design.md.
// Same pattern/idempotency as provision-daily-report-object.mjs.
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

const OBJECTS = [
  { nameSingular: 'callActivity', namePlural: 'callActivities', labelSingular: 'Call Activity', labelPlural: 'Call Activities', icon: 'IconPhone', description: 'One work call made or received by a seller, linked to its contact and lead' },
];

const opt = (value, label, position, color) => ({ value, label, position, color });

const FIELDS = {
  callActivity: [
    { name: 'direction', label: 'Direction', type: 'SELECT', icon: 'IconArrowsExchange', options: [
      opt('OUTBOUND', 'خروجی', 0, 'blue'),
      opt('INBOUND', 'ورودی', 1, 'green'),
      opt('MISSED', 'از دست رفته', 2, 'red'),
    ] },
    { name: 'channel', label: 'Channel', type: 'SELECT', icon: 'IconPhone', options: [
      opt('PHONE', 'تماس', 0, 'blue'),
      opt('WHATSAPP', 'واتساپ', 1, 'green'),
      opt('TELEGRAM', 'تلگرام', 2, 'sky'),
    ] },
    { name: 'phoneNumber', label: 'Phone Number', type: 'TEXT' },
    { name: 'contactName', label: 'Contact Name', type: 'TEXT' },
    { name: 'startedAt', label: 'Started At', type: 'DATE_TIME' },
    { name: 'durationSeconds', label: 'Duration Seconds', type: 'NUMBER' },
    { name: 'durationSource', label: 'Duration Source', type: 'SELECT', icon: 'IconRuler', options: [
      opt('CALL_LOG', 'ثبت تماس', 0, 'green'),
      opt('ESTIMATED', 'تخمینی', 1, 'orange'),
      opt('MANUAL', 'دستی', 2, 'gray'),
    ] },
    { name: 'recordingStatus', label: 'Recording Status', type: 'SELECT', icon: 'IconMicrophone', options: [
      opt('NONE', 'ندارد', 0, 'gray'),
      opt('PENDING', 'در انتظار', 1, 'orange'),
      opt('UPLOADED', 'بارگذاری شد', 2, 'green'),
      opt('UNAVAILABLE', 'در دسترس نیست', 3, 'red'),
    ] },
    { name: 'deviceCallId', label: 'Device Call Id', type: 'TEXT' },
  ],
};

const RELATIONS = [
  { source: 'callActivity', name: 'agent', label: 'Agent', target: 'workspaceMember', targetFieldLabel: 'Call Activities', targetFieldIcon: 'IconPhone', icon: 'IconUser' },
  { source: 'callActivity', name: 'person', label: 'Person', target: 'person', targetFieldLabel: 'Call Activities', targetFieldIcon: 'IconPhone', icon: 'IconUser' },
  { source: 'callActivity', name: 'opportunity', label: 'Opportunity', target: 'opportunity', targetFieldLabel: 'Call Activities', targetFieldIcon: 'IconPhone', icon: 'IconTargetArrow' },
  { source: 'callActivity', name: 'task', label: 'Task', target: 'task', targetFieldLabel: 'Call Activities', targetFieldIcon: 'IconPhone', icon: 'IconCheckbox' },
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
