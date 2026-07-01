// Phase 1 provisioning: sales-management data model on Twenty via metadata API.
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
  { nameSingular: 'product', namePlural: 'products', labelSingular: 'Product', labelPlural: 'Products', icon: 'IconBox', description: 'Catalog product with base pricing and discount limits' },
  { nameSingular: 'partner', namePlural: 'partners', labelSingular: 'Partner', labelPlural: 'Partners', icon: 'IconUsersGroup', description: 'Referrer / partner for commission tracking' },
  { nameSingular: 'dealProduct', namePlural: 'dealProducts', labelSingular: 'Deal Product', labelPlural: 'Deal Products', icon: 'IconShoppingCart', description: 'Per-product line item on an opportunity' },
];

// scalar/select fields keyed by object nameSingular
const FIELDS = {
  product: [
    { name: 'baseInstallPrice', label: 'Base Install Price', type: 'CURRENCY' },
    { name: 'baseAnnualPrice', label: 'Base Annual Price', type: 'CURRENCY' },
    { name: 'maxDiscountPercent', label: 'Max Discount %', type: 'NUMBER' },
    { name: 'pricingModel', label: 'Pricing Model', type: 'SELECT', options: [opt('FLAT', 'Flat', 0, 'blue'), opt('PER_FACTOR', 'Per-factor', 1, 'purple')] },
    { name: 'pricingFactorNotes', label: 'Pricing Factor Notes', type: 'TEXT' },
    { name: 'isSellable', label: 'Active for Sale', type: 'BOOLEAN' },
  ],
  partner: [
    { name: 'partnerType', label: 'Type', type: 'SELECT', options: [opt('MARKETER', 'Marketer', 0, 'green'), opt('SELLER', 'Seller', 1, 'blue'), opt('PARTNER', 'Partner', 2, 'purple')] },
    { name: 'commissionPercent', label: 'Commission %', type: 'NUMBER' },
  ],
  dealProduct: [
    { name: 'quantity', label: 'Quantity', type: 'NUMBER' },
    { name: 'installPrice', label: 'Install Price', type: 'CURRENCY' },
    { name: 'annualPrice', label: 'Annual Price', type: 'CURRENCY' },
    { name: 'discountPercent', label: 'Discount %', type: 'NUMBER' },
    { name: 'lineStatus', label: 'Line Status', type: 'SELECT', options: [opt('QUOTED', 'Quoted', 0, 'gray'), opt('CONTRACTED', 'Contracted', 1, 'blue'), opt('PAID', 'Paid', 2, 'green'), opt('DELIVERED', 'Delivered', 3, 'turquoise')] },
  ],
  opportunity: [
    { name: 'temperature', label: 'Temperature', type: 'SELECT', options: [opt('HOT', 'Hot', 0, 'red'), opt('WARM', 'Warm', 1, 'orange'), opt('COLD', 'Cold', 2, 'blue')] },
    { name: 'leadSource', label: 'Lead Source', type: 'SELECT', options: [opt('FIELD', 'Field Marketing', 0, 'green'), opt('WHATSAPP', 'WhatsApp', 1, 'turquoise'), opt('TELEGRAM', 'Telegram', 2, 'sky'), opt('FACEBOOK', 'Facebook', 3, 'blue'), opt('REFERRAL', 'Referral', 4, 'purple'), opt('OTHER', 'Other', 5, 'gray')] },
    { name: 'lostReason', label: 'Lost Reason', type: 'SELECT', options: [opt('NO_ANSWER', 'No Answer', 0, 'gray'), opt('WENT_SILENT', 'Went Silent', 1, 'yellow'), opt('NOT_INTERESTED', 'Not Interested', 2, 'red'), opt('CHOSE_COMPETITOR', 'Chose Competitor', 3, 'orange'), opt('NO_BUDGET', 'No Budget', 4, 'pink')] },
    { name: 'depositAmount', label: 'Deposit Amount', type: 'CURRENCY' },
    { name: 'priceLockedUntil', label: 'Price Locked Until', type: 'DATE_TIME' },
  ],
  person: [
    { name: 'preferredContactMethod', label: 'Preferred Contact Method', type: 'SELECT', options: [opt('PHONE', 'Phone', 0, 'blue'), opt('WHATSAPP', 'WhatsApp', 1, 'turquoise'), opt('TELEGRAM', 'Telegram', 2, 'sky'), opt('FACEBOOK', 'Facebook', 3, 'purple'), opt('EMAIL', 'Email', 4, 'green'), opt('IN_PERSON', 'In-person', 5, 'gray')] },
  ],
};

// relations: created on `source` object, pointing to `target` object
const RELATIONS = [
  { source: 'opportunity', name: 'referrer', label: 'Referrer', target: 'partner', targetFieldLabel: 'Referred Opportunities', targetFieldIcon: 'IconTargetArrow', icon: 'IconTargetArrow' },
  { source: 'dealProduct', name: 'opportunity', label: 'Opportunity', target: 'opportunity', targetFieldLabel: 'Deal Products', targetFieldIcon: 'IconShoppingCart', icon: 'IconTargetArrow' },
  { source: 'dealProduct', name: 'product', label: 'Product', target: 'product', targetFieldLabel: 'Deal Products', targetFieldIcon: 'IconShoppingCart', icon: 'IconBox' },
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
