// tools/sales-crm/provision-subscriptions-referrals-offers.mjs
// Three new objects and a handful of opportunity fields behind "record how the
// deal got here and what the customer keeps paying afterwards":
//
//   leadOffer      — one offer made on one lead, so the negotiation history
//                    survives the next overwrite of opportunity.amount.
//   leadReferrer   — join row crediting a SECOND (third, ...) referrer on a
//                    lead, each with the commission share negotiated for that
//                    deal. opportunity.referrer stays the primary referrer and
//                    keeps working untouched -- the CRM's own table views and
//                    the existing reports read it.
//   subscription   — what a converted customer pays, per product, per term.
//
//   opportunity.agreedPrice     — the number both sides settled on. Stored,
//   opportunity.agreedAt          not derived from "the accepted offer": deals
//                                 are sometimes agreed verbally with no offer
//                                 row, and reports shouldn't walk a relation
//                                 to answer the commonest question about a lead.
//   opportunity.stageChangedAt  — when the stage last moved, so "age in stage"
//                                 (the number that identifies a stalling lead)
//                                 is answerable at all. Null on existing rows;
//                                 the UI falls back to createdAt for those.
//
// Per-metric discounts (the other half of this branch) need NO provisioning:
// they are two new optional keys inside the existing RAW_JSON pricingFactors.
//
// The Sales UI degrades gracefully until this runs -- each new section detects
// the unknown object/field and hides itself -- so deploying the app before
// running this breaks nothing.
//
// Idempotent: skips any object/field that already exists. Safe to re-run.
//
// Auth: set TWENTY_TOKEN to a workspace API key (Settings > APIs & Webhooks) to
// skip the password login entirely -- preferable against production, where you
// don't want an admin password in your shell history. Otherwise it logs in with
// TWENTY_EMAIL / TWENTY_PASSWORD (local dev defaults below).
//
//   TWENTY_META=https://crm.hamagan.com/metadata \
//   TWENTY_ORIGIN=https://crm.hamagan.com \
//   TWENTY_TOKEN=... node tools/sales-crm/provision-subscriptions-referrals-offers.mjs
const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';

let TOKEN = process.env.TWENTY_TOKEN ?? null;

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
  const b = await gql(
    `mutation($t:String!,$o:String!){getAuthTokensFromLoginToken(loginToken:$t,origin:$o){tokens{accessOrWorkspaceAgnosticToken{token}}}}`,
    { t: a.getLoginTokenFromCredentials.loginToken.token, o: ORIGIN },
  );
  TOKEN = b.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;
}

async function fetchObjects() {
  const d = await gql(`query {
    objects(paging:{first:500}) { edges { node {
      id nameSingular
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
  {
    nameSingular: 'leadOffer',
    namePlural: 'leadOffers',
    labelSingular: 'Lead Offer',
    labelPlural: 'Lead Offers',
    icon: 'IconReceipt',
    description: 'One price offered on a lead, keeping the negotiation history',
  },
  {
    nameSingular: 'leadReferrer',
    namePlural: 'leadReferrers',
    labelSingular: 'Lead Referrer',
    labelPlural: 'Lead Referrers',
    icon: 'IconUsersGroup',
    description: 'An additional referrer credited on a lead, with their commission share for that deal',
  },
  {
    nameSingular: 'subscription',
    namePlural: 'subscriptions',
    labelSingular: 'Subscription',
    labelPlural: 'Subscriptions',
    icon: 'IconRefresh',
    description: 'What a converted customer pays for a product, per term',
  },
];

// scalar/select fields keyed by object nameSingular
const FIELDS = {
  leadOffer: [
    { name: 'offeredAt', label: 'Offered At', type: 'DATE_TIME', icon: 'IconCalendar' },
    { name: 'amount', label: 'Amount', type: 'CURRENCY', icon: 'IconCurrency' },
    {
      name: 'offerStatus',
      label: 'Status',
      type: 'SELECT',
      icon: 'IconProgressCheck',
      options: [
        opt('PROPOSED', 'Proposed', 0, 'blue'),
        opt('ACCEPTED', 'Accepted', 1, 'green'),
        opt('REJECTED', 'Rejected', 2, 'red'),
        opt('SUPERSEDED', 'Superseded', 3, 'gray'),
      ],
    },
    { name: 'note', label: 'Note', type: 'TEXT', icon: 'IconNotes' },
  ],
  leadReferrer: [
    { name: 'commissionPercent', label: 'Commission %', type: 'NUMBER', icon: 'IconPercentage' },
    {
      name: 'referrerRole',
      label: 'Role',
      type: 'SELECT',
      icon: 'IconUserStar',
      options: [
        opt('FINDER', 'Finder', 0, 'green'),
        opt('INTRODUCER', 'Introducer', 1, 'blue'),
        opt('CLOSER', 'Closer', 2, 'purple'),
        opt('OTHER', 'Other', 3, 'gray'),
      ],
    },
    { name: 'note', label: 'Note', type: 'TEXT', icon: 'IconNotes' },
  ],
  subscription: [
    { name: 'startDate', label: 'Start Date', type: 'DATE_TIME', icon: 'IconCalendar' },
    { name: 'endDate', label: 'End Date', type: 'DATE_TIME', icon: 'IconCalendarX' },
    {
      name: 'subscriptionStatus',
      label: 'Status',
      type: 'SELECT',
      icon: 'IconProgressCheck',
      options: [
        opt('PENDING', 'Pending', 0, 'gray'),
        opt('ACTIVE', 'Active', 1, 'green'),
        opt('EXPIRED', 'Expired', 2, 'orange'),
        opt('CANCELLED', 'Cancelled', 3, 'red'),
      ],
    },
    {
      name: 'billingPeriod',
      label: 'Billing Period',
      type: 'SELECT',
      icon: 'IconRepeat',
      options: [
        opt('MONTHLY', 'Monthly', 0, 'blue'),
        opt('ANNUAL', 'Annual', 1, 'purple'),
      ],
    },
    { name: 'recurringAmount', label: 'Recurring Amount', type: 'CURRENCY', icon: 'IconCurrency' },
    { name: 'autoRenew', label: 'Auto Renew', type: 'BOOLEAN', icon: 'IconRefresh' },
    { name: 'note', label: 'Note', type: 'TEXT', icon: 'IconNotes' },
  ],
  opportunity: [
    { name: 'agreedPrice', label: 'Agreed Price', type: 'CURRENCY', icon: 'IconHandshake' },
    { name: 'agreedAt', label: 'Agreed At', type: 'DATE_TIME', icon: 'IconCalendarCheck' },
    { name: 'stageChangedAt', label: 'Stage Changed At', type: 'DATE_TIME', icon: 'IconArrowsExchange' },
  ],
};

// relations: created on `source` object, pointing to `target` object
const RELATIONS = [
  {
    source: 'leadOffer', name: 'opportunity', label: 'Lead', target: 'opportunity',
    targetFieldLabel: 'Offers', targetFieldIcon: 'IconReceipt', icon: 'IconTargetArrow',
  },
  {
    source: 'leadOffer', name: 'offeredBy', label: 'Offered By', target: 'workspaceMember',
    targetFieldLabel: 'Offers Made', targetFieldIcon: 'IconReceipt', icon: 'IconUser',
  },
  {
    source: 'leadReferrer', name: 'opportunity', label: 'Lead', target: 'opportunity',
    targetFieldLabel: 'Additional Referrers', targetFieldIcon: 'IconUsersGroup', icon: 'IconTargetArrow',
  },
  {
    source: 'leadReferrer', name: 'partner', label: 'Partner', target: 'partner',
    targetFieldLabel: 'Referred Leads (Additional)', targetFieldIcon: 'IconTargetArrow', icon: 'IconUsersGroup',
  },
  {
    source: 'subscription', name: 'company', label: 'Customer', target: 'company',
    targetFieldLabel: 'Subscriptions', targetFieldIcon: 'IconRefresh', icon: 'IconBuildingSkyscraper',
  },
  {
    source: 'subscription', name: 'opportunity', label: 'Converted From', target: 'opportunity',
    targetFieldLabel: 'Subscriptions', targetFieldIcon: 'IconRefresh', icon: 'IconTargetArrow',
  },
  {
    source: 'subscription', name: 'product', label: 'Product', target: 'product',
    targetFieldLabel: 'Subscriptions', targetFieldIcon: 'IconRefresh', icon: 'IconBox',
  },
];

const log = [];
const rec = (kind, name, status, detail = '') => {
  log.push({ kind, name, status, detail });
  console.log(`  [${status}] ${kind}: ${name}${detail ? ' — ' + detail : ''}`);
};

async function main() {
  if (TOKEN) {
    console.log('using TWENTY_TOKEN (API key).\n');
  } else {
    await login();
    console.log(`authenticated as ${EMAIL}.\n`);
  }

  let objs = await fetchObjects();

  console.log('== objects ==');
  for (const spec of OBJECTS) {
    if (objs[spec.nameSingular]) { rec('object', spec.nameSingular, 'skip', 'exists'); continue; }
    try { const o = await createObject(spec); rec('object', o.nameSingular, 'created', o.id); }
    catch (e) { rec('object', spec.nameSingular, 'FAIL', e.message); }
  }
  objs = await fetchObjects(); // refresh to pick up new object ids

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

  const created = log.filter((l) => l.status === 'created').length;
  const skipped = log.filter((l) => l.status === 'skip').length;
  const fails = log.filter((l) => l.status === 'FAIL');
  console.log(`\n==== SUMMARY: ${created} created, ${skipped} skipped, ${fails.length} failed ====`);
  if (fails.length) process.exitCode = 1;
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
