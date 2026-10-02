// tools/sales-crm/provision-lead-tags.mjs
// Lead tags: two objects.
//
//   leadTag      -- a label a seller can put on leads. visibility is PERSONAL
//                   (only its creator sees/uses it) or PUBLIC (everyone).
//   leadTagLink  -- one row per tag applied to one lead.
//
// Personal-tag privacy is enforced by the sales app, not the database: the
// record API has no per-user row scoping for custom objects, so a technical
// user calling the API directly could read another seller's personal tag
// names. Tag names are low-sensitivity; see
// docs/superpowers/specs/2026-10-02-lead-tags-design.md.
//
// The Sales UI hides every tag control until this runs (it probes /metadata for
// the leadTag object), so deploying the app first breaks nothing.
//
// Idempotent: skips any object/field that already exists. Safe to re-run.
//
//   TWENTY_META=https://crm.hamagan.com/metadata \
//   TWENTY_ORIGIN=https://crm.hamagan.com \
//   TWENTY_TOKEN=... node tools/sales-crm/provision-lead-tags.mjs
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
    nameSingular: 'leadTag',
    namePlural: 'leadTags',
    labelSingular: 'Lead Tag',
    labelPlural: 'Lead Tags',
    icon: 'IconTag',
    description: 'A label sellers put on leads; personal (creator only) or public',
  },
  {
    nameSingular: 'leadTagLink',
    namePlural: 'leadTagLinks',
    labelSingular: 'Lead Tag Link',
    labelPlural: 'Lead Tag Links',
    icon: 'IconTags',
    description: 'One tag applied to one lead',
  },
];

const FIELDS = {
  leadTag: [
    {
      name: 'color',
      label: 'Color',
      type: 'SELECT',
      icon: 'IconPalette',
      options: [
        opt('GRAY', 'Gray', 0, 'gray'),
        opt('RED', 'Red', 1, 'red'),
        opt('ORANGE', 'Orange', 2, 'orange'),
        opt('YELLOW', 'Yellow', 3, 'yellow'),
        opt('GREEN', 'Green', 4, 'green'),
        opt('TEAL', 'Teal', 5, 'turquoise'),
        opt('BLUE', 'Blue', 6, 'blue'),
        opt('PURPLE', 'Purple', 7, 'purple'),
        opt('PINK', 'Pink', 8, 'pink'),
      ],
    },
    {
      name: 'visibility',
      label: 'Visibility',
      type: 'SELECT',
      icon: 'IconEye',
      options: [
        opt('PERSONAL', 'Personal', 0, 'gray'),
        opt('PUBLIC', 'Public', 1, 'blue'),
      ],
    },
  ],
  leadTagLink: [],
};

// relations: created on `source` object, pointing to `target` object
const RELATIONS = [
  {
    source: 'leadTag', name: 'createdByMember', label: 'Created By', target: 'workspaceMember',
    targetFieldLabel: 'Lead Tags', targetFieldIcon: 'IconTag', icon: 'IconUser',
  },
  {
    source: 'leadTagLink', name: 'opportunity', label: 'Lead', target: 'opportunity',
    targetFieldLabel: 'Tag Links', targetFieldIcon: 'IconTags', icon: 'IconTargetArrow',
  },
  {
    source: 'leadTagLink', name: 'tag', label: 'Tag', target: 'leadTag',
    targetFieldLabel: 'Links', targetFieldIcon: 'IconTags', icon: 'IconTag',
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
