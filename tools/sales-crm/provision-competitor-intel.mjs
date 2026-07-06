// tools/sales-crm/provision-competitor-intel.mjs
// Competitor Intelligence objects: Competitor, Competitor Product,
// Competitor Update, Competitor Usage. See
// docs/superpowers/specs/2026-07-06-competitor-intelligence-design.md.
// Idempotent: skips objects/fields/relations that already exist. Non-fatal per item.
const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';
// Prefer a workspace API key (Settings -> APIs) when provided — no account
// password needed. Falls back to email/password login otherwise.
const API_KEY = process.env.TWENTY_API_KEY ?? null;

let TOKEN = API_KEY;
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
    // `type` is a reserved field name in Twenty metadata — use `updateType`.
    { name: 'updateType', label: 'Type', type: 'SELECT', options: [opt('PRODUCT_UPDATE', 'Product Update', 0, 'blue'), opt('PRICING_CHANGE', 'Pricing Change', 1, 'orange'), opt('NEWS', 'News', 2, 'gray'), opt('WIN', 'Win', 3, 'green'), opt('LOSS', 'Loss', 4, 'red'), opt('FUNDING', 'Funding', 5, 'purple')] },
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
  if (API_KEY) { console.log('authenticated (API key).\n'); }
  else { await login(); console.log('authenticated (login).\n'); }

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
