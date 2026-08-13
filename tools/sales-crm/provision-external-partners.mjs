// tools/sales-crm/provision-external-partners.mjs
//
// Gives marketers and referral partners -- people who are NOT employees -- their
// own login into the Sales App, seeing only the leads they brought and the tasks
// assigned to them.
//
// What it provisions:
//
//   partner.member              relation -> workspaceMember. The link between a
//                               partner record and a login. Nullable: partners
//                               without an account keep working exactly as before.
//   opportunity.marketerPartner relation -> partner. Replaces the hard-coded
//                               `marketer` SELECT, which could only ever hold the
//                               three names compiled into the app.
//   partner records            one per legacy MARKETER enum value, then every
//                               opportunity is backfilled from the enum so no
//                               credit is lost. The old SELECT is left in place
//                               and simply stops being written -- dropping it
//                               would destroy the only copy of that history.
//   roles                      "Marketer" and "Partner", both owner-scoped.
//
// Enforcement is server-side: both roles set canOnlyAccessOwnedRecords, which the
// twenty-orm owner-scope engine turns into a filter on every read, update and
// delete (see packages/twenty-server/src/engine/twenty-orm/owner-scope/). The
// scoping rules for opportunity are owner OR marketerPartner OR referrer, so
// credit survives a lead being handed to a seller. Hiding things in the UI alone
// would be meaningless here -- these users are outside the company.
//
// ORDER MATTERS, and the deploy is two-phase:
//
//   node ...provision-external-partners.mjs --schema-only    (BEFORE the deploy)
//   node ...provision-external-partners.mjs --roles-only     (AFTER  the deploy)
//
// The schema half -- fields, partner records, backfill -- is plain metadata and
// works against the currently running server, so it must go first: the Sales App
// deploys in seconds while the server image takes ~90 minutes, and until
// opportunity.marketerPartner exists the app cannot record who brought a lead.
//
// The roles half must go LAST, after the new server is live. A role with
// canOnlyAccessOwnedRecords set is only as strong as the owner-scope rules the
// running server knows about: an older server does not scope `opportunity` at
// all, so creating these roles early would hand an external user every lead in
// the workspace. Creating them after the deploy closes that window.
//
// With no flag both halves run, which is right for a fresh environment where
// nothing is live yet.
//
// Idempotent: skips anything that already exists. Safe to re-run.
//
// Auth: set TWENTY_TOKEN to a workspace API key (Settings > APIs & Webhooks) to
// skip the password login entirely -- preferable against production, where you
// don't want an admin password in your shell history.
//
//   TWENTY_META=https://crm.hamagan.com/metadata \
//   TWENTY_GRAPHQL=https://crm.hamagan.com/graphql \
//   TWENTY_ORIGIN=https://crm.hamagan.com \
//   TWENTY_TOKEN=... node tools/sales-crm/provision-external-partners.mjs
const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const CORE = process.env.TWENTY_GRAPHQL ?? META.replace(/\/metadata$/, '/graphql');
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';

let TOKEN = process.env.TWENTY_TOKEN ?? null;

const ONLY = process.argv.includes('--roles-only')
  ? 'roles'
  : process.argv.includes('--schema-only')
    ? 'schema'
    : 'all';
const DO_SCHEMA = ONLY !== 'roles';
const DO_ROLES = ONLY !== 'schema';

async function post(url, query, variables) {
  const res = await fetch(url, {
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

const gql = (query, variables) => post(META, query, variables);
const core = (query, variables) => post(CORE, query, variables);

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
      fields(paging:{first:500}) { edges { node { id name } } }
    } } }
  }`);
  const map = {};
  for (const { node } of d.objects.edges) {
    map[node.nameSingular] = {
      id: node.id,
      fields: Object.fromEntries(node.fields.edges.map((e) => [e.node.name, e.node.id])),
    };
  }
  return map;
}

const createField = (input) =>
  gql(`mutation($input:CreateOneFieldMetadataInput!){createOneField(input:$input){id name}}`, {
    input: { field: input },
  });

// The three names that lived in MARKETER_LABELS in the Sales App. Each becomes a
// real partner record so marketers can be added from now on without a deploy.
const LEGACY_MARKETERS = [
  { value: 'ALAVI', name: 'مصطفی علوی' },
  { value: 'SHABAB', name: 'نذیراحمد شباب' },
  { value: 'NOORZAI', name: 'سهراب نورزایی' },
];

const RELATIONS = [
  {
    source: 'partner',
    name: 'member',
    label: 'Login Account',
    target: 'workspaceMember',
    icon: 'IconUserCircle',
    targetFieldLabel: 'Partner Profile',
    targetFieldIcon: 'IconUsersGroup',
  },
  {
    source: 'opportunity',
    name: 'marketerPartner',
    label: 'Marketer',
    target: 'partner',
    icon: 'IconUsersGroup',
    targetFieldLabel: 'Leads Brought',
    targetFieldIcon: 'IconTargetArrow',
  },
];

const log = [];
const rec = (kind, name, status, detail = '') => {
  log.push({ kind, name, status, detail });
  console.log(`  [${status}] ${kind}: ${name}${detail ? ' — ' + detail : ''}`);
};

// ---- roles ----

// Both external roles get the same grants; only the label differs, so an admin
// can tell a field marketer from a referral partner at a glance and the two can
// diverge later without a migration.
const EXTERNAL_ROLES = [
  {
    label: 'Marketer',
    description:
      'External field marketer: sees only the leads they brought and their own tasks. Cannot see pricing, other sellers, or reports.',
    icon: 'IconUsersGroup',
  },
  {
    label: 'Partner',
    description:
      'External referral partner: sees only the leads they are credited on and their own tasks. Cannot see pricing, other sellers, or reports.',
    icon: 'IconHeartHandshake',
  },
];

// Objects an external user works. Everything else is denied outright rather than
// scoped -- catalog, quotations, subscriptions, competitors, reports and daily
// reports are all internal.
const EXTERNAL_READ_WRITE = ['opportunity', 'person', 'company', 'task', 'note'];
// Join rows carrying no content of their own. They stay unscoped (there is no
// owner column that would survive a seller linking a task to a marketer's lead),
// so a determined user could enumerate ids through them -- but the note bodies
// and task titles behind those ids are still owner-scoped, so nothing readable
// leaks. Without these, lead detail cannot list its own notes and tasks at all.
const EXTERNAL_JOIN_ROWS = ['noteTarget', 'taskTarget'];
// Their own partner row, so the app can resolve "which partner am I". Scoped by
// partner.member, so this is not a view of the partner list.
const EXTERNAL_READ_ONLY = ['partner', 'attachment'];
const EXTERNAL_SOFT_DELETABLE = new Set(['task', 'note']);

async function upsertExternalRole(spec, objs) {
  const existing = await gql(`query { getRoles { id label } }`);
  let roleId = existing.getRoles.find((r) => r.label === spec.label)?.id;

  if (roleId) {
    rec('role', spec.label, 'skip', `exists ${roleId}`);
  } else {
    const created = await gql(
      `mutation($createRoleInput: CreateRoleInput!){ createOneRole(createRoleInput:$createRoleInput){ id label } }`,
      {
        createRoleInput: {
          label: spec.label,
          description: spec.description,
          icon: spec.icon,
          canUpdateAllSettings: false,
          canAccessAllTools: false,
          canReadAllObjectRecords: false,
          canUpdateAllObjectRecords: false,
          canSoftDeleteAllObjectRecords: false,
          canDestroyAllObjectRecords: false,
          // The whole point: every read/update/delete is filtered to records
          // this member is involved with, by the owner-scope engine.
          canOnlyAccessOwnedRecords: true,
          canBeAssignedToUsers: true,
        },
      },
    );
    roleId = created.createOneRole.id;
    rec('role', spec.label, 'created', roleId);
  }

  const present = (n) => {
    if (!objs[n]) {
      rec('permission', `${spec.label}.${n}`, 'skip', 'object not in workspace');
      return false;
    }
    return true;
  };

  const objectPermissions = [
    ...EXTERNAL_READ_WRITE.filter(present).map((n) => ({
      objectMetadataId: objs[n].id,
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: EXTERNAL_SOFT_DELETABLE.has(n),
      canDestroyObjectRecords: false,
    })),
    ...EXTERNAL_JOIN_ROWS.filter(present).map((n) => ({
      objectMetadataId: objs[n].id,
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: true,
      canDestroyObjectRecords: false,
    })),
    ...EXTERNAL_READ_ONLY.filter(present).map((n) => ({
      objectMetadataId: objs[n].id,
      canReadObjectRecords: true,
      canUpdateObjectRecords: false,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    })),
  ];

  await gql(
    `mutation($upsertObjectPermissionsInput: UpsertObjectPermissionsInput!){ upsertObjectPermissions(upsertObjectPermissionsInput:$upsertObjectPermissionsInput){ objectMetadataId } }`,
    { upsertObjectPermissionsInput: { roleId, objectPermissions } },
  );
  rec('permission', spec.label, 'created', `${objectPermissions.length} objects`);

  // File upload/download only. Deliberately no AI flag: the AI endpoints
  // summarise a lead and draft call scripts, which is internal tooling, and each
  // call costs money against our own key.
  await gql(
    `mutation($upsertPermissionFlagsInput: UpsertPermissionFlagsInput!){ upsertPermissionFlags(upsertPermissionFlagsInput:$upsertPermissionFlagsInput){ id flag } }`,
    { upsertPermissionFlagsInput: { roleId, permissionFlagKeys: ['UPLOAD_FILE', 'DOWNLOAD_FILE'] } },
  );
  rec('flags', spec.label, 'created', 'UPLOAD_FILE, DOWNLOAD_FILE');

  // Money stays invisible. Owner scoping controls which rows they see; these
  // control which columns, so a marketer cannot read the amount a lead closed
  // at even on a lead that is legitimately theirs.
  const hiddenFields = [
    ['opportunity', 'amount'],
    ['opportunity', 'agreedPrice'],
    ['partner', 'commissionPercent'],
  ];
  const fieldPermissions = hiddenFields
    .filter(([objName, fieldName]) => {
      const fieldId = objs[objName]?.fields?.[fieldName];
      if (!fieldId) {
        rec('field-permission', `${objName}.${fieldName}`, 'skip', 'field not in workspace');
        return false;
      }
      return true;
    })
    .map(([objName, fieldName]) => ({
      objectMetadataId: objs[objName].id,
      fieldMetadataId: objs[objName].fields[fieldName],
      canReadFieldValue: false,
      canUpdateFieldValue: false,
    }));

  if (fieldPermissions.length) {
    await gql(
      `mutation($upsertFieldPermissionsInput: UpsertFieldPermissionsInput!){ upsertFieldPermissions(upsertFieldPermissionsInput:$upsertFieldPermissionsInput){ fieldMetadataId } }`,
      { upsertFieldPermissionsInput: { roleId, fieldPermissions } },
    );
    rec('field-permission', spec.label, 'created', `${fieldPermissions.length} fields hidden`);
  }

  return roleId;
}

// ---- backfill ----

// Reads every opportunity that still has a legacy marketer enum value and points
// it at the matching partner record. Paginated: `first` is not clamped by the
// server, so an oversized page silently truncates instead of erroring.
async function backfillMarketers(partnerIdByEnumValue) {
  const PAGE = 60;
  let after = null;
  let scanned = 0;
  let updated = 0;

  for (;;) {
    const data = await core(
      `query($after: String) {
        opportunities(
          first: ${PAGE}
          after: $after
          filter: { marketer: { in: ${JSON.stringify(LEGACY_MARKETERS.map((m) => m.value))} } }
          orderBy: [{ createdAt: AscNullsLast }]
        ) {
          edges { cursor node { id marketer marketerPartnerId } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { after },
    );

    const edges = data.opportunities.edges;
    scanned += edges.length;

    for (const { node } of edges) {
      if (node.marketerPartnerId) continue;
      const partnerId = partnerIdByEnumValue[node.marketer];
      if (!partnerId) continue;

      await core(
        `mutation($id: UUID!, $data: OpportunityUpdateInput!) {
          updateOpportunity(id: $id, data: $data) { id }
        }`,
        { id: node.id, data: { marketerPartnerId: partnerId } },
      );
      updated += 1;
    }

    if (!data.opportunities.pageInfo.hasNextPage) break;
    after = data.opportunities.pageInfo.endCursor;
  }

  rec('backfill', 'opportunity.marketerPartner', 'created', `${updated} of ${scanned} leads linked`);
}

async function ensurePartnerRecords() {
  const existing = await core(
    `query { partners(first: 200) { edges { node { id name } } } }`,
  );
  const byName = Object.fromEntries(
    existing.partners.edges.map((e) => [e.node.name, e.node.id]),
  );

  const partnerIdByEnumValue = {};

  for (const marketer of LEGACY_MARKETERS) {
    if (byName[marketer.name]) {
      partnerIdByEnumValue[marketer.value] = byName[marketer.name];
      rec('partner', marketer.name, 'skip', 'exists');
      continue;
    }

    const created = await core(
      `mutation($data: PartnerCreateInput!) { createPartner(data: $data) { id } }`,
      { data: { name: marketer.name, partnerType: 'MARKETER' } },
    );
    partnerIdByEnumValue[marketer.value] = created.createPartner.id;
    rec('partner', marketer.name, 'created', created.createPartner.id);
  }

  return partnerIdByEnumValue;
}

async function main() {
  if (TOKEN) {
    console.log('using TWENTY_TOKEN (API key).\n');
  } else {
    await login();
    console.log(`authenticated as ${EMAIL}.\n`);
  }

  let objs = await fetchObjects();

  if (!objs.partner) {
    console.error(
      'FATAL: the `partner` object is missing. Run provision-subscriptions-referrals-offers.mjs first.',
    );
    process.exit(1);
  }

  if (DO_SCHEMA) {
  console.log('== relations ==');
  for (const r of RELATIONS) {
    const src = objs[r.source];
    const tgt = objs[r.target];
    if (!src || !tgt) {
      rec('relation', `${r.source}.${r.name}`, 'FAIL', 'src/tgt missing');
      continue;
    }
    if (src.fields[r.name]) {
      rec('relation', `${r.source}.${r.name}`, 'skip', 'exists');
      continue;
    }
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
    } catch (e) {
      rec('relation', `${r.source}.${r.name}`, 'FAIL', e.message);
    }
  }

  objs = await fetchObjects();

  console.log('\n== partner records for the legacy marketer list ==');
  let partnerIdByEnumValue = {};
  try {
    partnerIdByEnumValue = await ensurePartnerRecords();
  } catch (e) {
    rec('partner', 'legacy marketers', 'FAIL', e.message);
  }

  console.log('\n== backfill ==');
  if (!objs.opportunity.fields.marketerPartner) {
    rec('backfill', 'opportunity.marketerPartner', 'FAIL', 'relation missing');
  } else if (!Object.keys(partnerIdByEnumValue).length) {
    rec('backfill', 'opportunity.marketerPartner', 'skip', 'no partner records');
  } else {
    try {
      await backfillMarketers(partnerIdByEnumValue);
    } catch (e) {
      rec('backfill', 'opportunity.marketerPartner', 'FAIL', e.message);
    }
  }
  }

  if (DO_ROLES) {
    console.log('\n== roles ==');
    for (const spec of EXTERNAL_ROLES) {
      try {
        await upsertExternalRole(spec, objs);
      } catch (e) {
        rec('role', spec.label, 'FAIL', e.message);
      }
    }
  } else {
    console.log(
      '\n== roles ==\n  [skip] --schema-only: run again with --roles-only once the new server is live.',
    );
  }

  const created = log.filter((l) => l.status === 'created').length;
  const skipped = log.filter((l) => l.status === 'skip').length;
  const fails = log.filter((l) => l.status === 'FAIL');
  console.log(`\n==== SUMMARY: ${created} created, ${skipped} skipped, ${fails.length} failed ====`);
  console.log(
    '\nNext: invite each marketer/partner from the Sales App admin screen, assign them\n' +
      'the Marketer or Partner role, and link their partner record to the new account.',
  );
  if (fails.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
