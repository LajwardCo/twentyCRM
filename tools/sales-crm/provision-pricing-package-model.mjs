// tools/sales-crm/provision-pricing-package-model.mjs
// Package + Pricing Version objects, plus the two new Deal Product fields
// that reference them. See docs/superpowers/specs/2026-07-03-pricing-package-model-design.md.
// Idempotent: skips objects/fields that already exist. Non-fatal per item.
const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';

let TOKEN = null;
async function gql(query, variables) {
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

async function login() {
  const a = await gql(
    `mutation($e:String!,$p:String!,$o:String!){getLoginTokenFromCredentials(email:$e,password:$p,origin:$o){loginToken{token}}}`,
    { e: EMAIL, p: PASSWORD, o: ORIGIN },
  );
  const loginToken = a.getLoginTokenFromCredentials.loginToken.token;
  const b = await gql(
    `mutation($t:String!,$o:String!){getAuthTokensFromLoginToken(loginToken:$t,origin:$o){tokens{accessOrWorkspaceAgnosticToken{token}}}}`,
    { t: loginToken, o: ORIGIN },
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
    map[node.nameSingular] = {
      id: node.id,
      fields: new Set(node.fields.edges.map((e) => e.node.name)),
    };
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

async function createField(input) {
  const d = await gql(
    `mutation($input:CreateOneFieldMetadataInput!){createOneField(input:$input){id name}}`,
    { input: { field: input } },
  );
  return d.createOneField;
}

const opt = (value, label, position, color) => ({ value, label, position, color });

// ---- model ----
const OBJECTS = [
  { nameSingular: 'package', namePlural: 'packages', labelSingular: 'Package', labelPlural: 'Packages', icon: 'IconPackage', description: 'A named, sellable pricing plan for one Product' },
  { nameSingular: 'pricingVersion', namePlural: 'pricingVersions', labelSingular: 'Pricing Version', labelPlural: 'Pricing Versions', icon: 'IconVersions', description: 'A versioned, banded rate table under a Package -- old versions are deactivated, never deleted' },
];

const FIELDS = {
  package: [
    { name: 'status', label: 'Status', type: 'SELECT', options: [opt('ACTIVE', 'Active', 0, 'green'), opt('ARCHIVED', 'Archived', 1, 'gray')] },
    { name: 'allowsCustomPricing', label: 'Allows Custom Pricing', type: 'BOOLEAN' },
    { name: 'notes', label: 'Notes', type: 'TEXT' },
  ],
  pricingVersion: [
    { name: 'versionNumber', label: 'Version Number', type: 'NUMBER' },
    { name: 'isActive', label: 'Active', type: 'BOOLEAN' },
    { name: 'effectiveFrom', label: 'Effective From', type: 'DATE_TIME' },
    { name: 'deactivatedAt', label: 'Deactivated At', type: 'DATE_TIME' },
    { name: 'currencyCode', label: 'Currency Code', type: 'TEXT', description: 'ISO code the tierSchedule amounts are denominated in; falls back to the Product base price currency if unset.' },
    { name: 'tierSchedule', label: 'Tier Schedule', type: 'RAW_JSON', description: 'Array of {factor, billingFrequency, bands:[{minQty,maxQty,mode,amount}]} -- see design spec for the exact format.' },
  ],
  dealProduct: [
    { name: 'priceSnapshot', label: 'Price Snapshot', type: 'RAW_JSON', description: 'Frozen breakdown of the Pricing Version computation that produced installPrice/annualPrice -- see design spec.' },
  ],
};

// relations: created on `source` object, pointing to `target` object
const RELATIONS = [
  { source: 'package', name: 'product', label: 'Product', target: 'product', targetFieldLabel: 'Packages', targetFieldIcon: 'IconPackage', icon: 'IconBox' },
  { source: 'pricingVersion', name: 'package', label: 'Package', target: 'package', targetFieldLabel: 'Pricing Versions', targetFieldIcon: 'IconVersions', icon: 'IconPackage' },
  { source: 'dealProduct', name: 'pricingVersion', label: 'Pricing Version', target: 'pricingVersion', targetFieldLabel: 'Deal Products', targetFieldIcon: 'IconShoppingCart', icon: 'IconVersions' },
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
  objs = await fetchObjects(); // refresh to get new object ids

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
