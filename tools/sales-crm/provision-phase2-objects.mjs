// Phase 2 provisioning: Quotation + Subscription objects, fields, relations.
// Same pattern/idempotency as provision-phase1.mjs.
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
    fields(paging:{first:500}) { edges { node { name } } }
  } } } }`);
  const map = {};
  for (const { node } of d.objects.edges) map[node.nameSingular] = { id: node.id, fields: new Set(node.fields.edges.map((e) => e.node.name)) };
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
  { nameSingular: 'quotation', namePlural: 'quotations', labelSingular: 'Quotation', labelPlural: 'Quotations', icon: 'IconFileInvoice', description: 'A price quote issued to a lead, with a validity window' },
  { nameSingular: 'subscription', namePlural: 'subscriptions', labelSingular: 'Subscription', labelPlural: 'Subscriptions', icon: 'IconRefresh', description: 'An active subscription for a customer, tracked for renewal' },
];

const FIELDS = {
  quotation: [
    { name: 'quoteNumber', label: 'Quote Number', type: 'TEXT' },
    { name: 'issuedAt', label: 'Issued At', type: 'DATE_TIME' },
    { name: 'validUntil', label: 'Valid Until', type: 'DATE_TIME' },
    { name: 'agreedPrice', label: 'Agreed Price', type: 'CURRENCY' },
    { name: 'status', label: 'Status', type: 'SELECT', options: [opt('DRAFT', 'Draft', 0, 'gray'), opt('SENT', 'Sent', 1, 'blue'), opt('ACCEPTED', 'Accepted', 2, 'green'), opt('EXPIRED', 'Expired', 3, 'red'), opt('CONVERTED', 'Converted to Contract', 4, 'turquoise')] },
  ],
  subscription: [
    { name: 'startDate', label: 'Start Date', type: 'DATE_TIME' },
    { name: 'endDate', label: 'End Date', type: 'DATE_TIME' },
    { name: 'renewalDate', label: 'Renewal Date', type: 'DATE_TIME' },
    { name: 'annualPrice', label: 'Annual Price', type: 'CURRENCY' },
    { name: 'externalSystemUrl', label: 'External System URL', type: 'TEXT' },
    { name: 'status', label: 'Status', type: 'SELECT', options: [opt('ACTIVE', 'Active', 0, 'green'), opt('EXPIRING_SOON', 'Expiring Soon', 1, 'orange'), opt('EXPIRED', 'Expired', 2, 'red'), opt('CANCELLED', 'Cancelled', 3, 'gray')] },
  ],
};

const RELATIONS = [
  { source: 'quotation', name: 'opportunity', label: 'Opportunity', target: 'opportunity', targetFieldLabel: 'Quotations', targetFieldIcon: 'IconFileInvoice', icon: 'IconTargetArrow' },
  { source: 'subscription', name: 'opportunity', label: 'Opportunity', target: 'opportunity', targetFieldLabel: 'Subscriptions', targetFieldIcon: 'IconRefresh', icon: 'IconTargetArrow' },
  { source: 'subscription', name: 'company', label: 'Company', target: 'company', targetFieldLabel: 'Subscriptions', targetFieldIcon: 'IconRefresh', icon: 'IconBuildingSkyscraper' },
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
