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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Twenty rate-limits to 100 requests per 60s and answers the 101st with a
// plain error, so a 134-lead backfill cannot just loop. Pace every record call
// and back off when the limit is hit anyway -- the backfill skips leads that
// are already linked, so a resumed run picks up where it stopped.
const isRateLimited = (error) => /Limit reached/i.test(error.message);

// The legacy enum is expected to be deactivated once everything is linked.
const isMissingMarketerField = (error) =>
  /doesn't have any .?marketer.? field|Cannot query field .?marketer.?|marketer.*not.*defined/i.test(
    error.message,
  );

const core = async (query, variables) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const data = await post(CORE, query, variables);
      await sleep(650);
      return data;
    } catch (e) {
      if (!isRateLimited(e) || attempt >= 5) throw e;
      const waitMs = 62_000;
      console.log(`  … rate limited, waiting ${waitMs / 1000}s before retrying`);
      await sleep(waitMs);
    }
  }
};

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
// noteTarget, taskTarget and attachment are SYSTEM objects: Twenty rejects a
// per-object permission on them ("Cannot add object permission on system
// object") because access to them follows the record they attach to. They are
// therefore deliberately absent from the grant below -- granting note and task
// is what lets lead detail list its own notes and tasks. They are also absent
// from OWNER_SCOPED_OBJECTS for the join rows, which carry no content of their
// own; the note bodies and task titles behind them are owner-scoped, and
// attachment is scoped by its author.
//
// Their own partner row, so the app can resolve "which partner am I". Scoped by
// partner.member, so this is not a view of the partner list.
const EXTERNAL_READ_ONLY = ['partner'];
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

// Points every lead still carrying a legacy marketer enum value at the matching
// partner record.
//
// Queries the leads that are NOT yet linked and always reads the first page:
// each pass links its page, those rows drop out of the filter, and the next
// pass sees the remainder. Cursor pagination is deliberately avoided -- the
// bulk-imported leads share identical createdAt values, and paging on a
// non-unique sort key silently skips rows (it left 27 of 134 behind).
async function backfillMarketers(partnerIdByEnumValue) {
  const PAGE = 40;
  const values = JSON.stringify(LEGACY_MARKETERS.map((m) => m.value));
  const unlinkedFilter = `{ and: [ { marketer: { in: ${values} } }, { marketerPartnerId: { is: NULL } } ] }`;

  let updated = 0;
  let skipped = 0;

  for (let pass = 0; pass < 200; pass += 1) {
    let data;

    try {
      data = await core(
        `query {
          opportunities(first: ${PAGE}, filter: ${unlinkedFilter}) {
            edges { node { id marketer } }
          }
        }`,
      );
    } catch (e) {
      // Once the legacy `marketer` SELECT is retired, filtering on it is a hard
      // error -- and that is the success case, not a failure: a field nobody can
      // write can no longer drift out of sync with the relation.
      if (isMissingMarketerField(e)) {
        rec(
          'backfill',
          'opportunity.marketerPartner',
          'skip',
          'legacy marketer field retired — nothing can drift',
        );

        return;
      }

      throw e;
    }

    const nodes = data.opportunities.edges.map((e) => e.node);

    if (nodes.length === 0) break;

    let progressed = false;

    for (const node of nodes) {
      const partnerId = partnerIdByEnumValue[node.marketer];

      if (!partnerId) {
        skipped += 1;
        continue;
      }

      await core(
        `mutation($id: UUID!, $data: OpportunityUpdateInput!) {
          updateOpportunity(id: $id, data: $data) { id }
        }`,
        { id: node.id, data: { marketerPartnerId: partnerId } },
      );
      updated += 1;
      progressed = true;
    }

    // Every remaining lead names a marketer we have no partner record for;
    // another pass would fetch the same rows forever.
    if (!progressed) break;

    console.log(`  … ${updated} linked so far`);
  }

  rec(
    'backfill',
    'opportunity.marketerPartner',
    'created',
    `${updated} leads linked${skipped ? `, ${skipped} skipped (unknown marketer)` : ''}`,
  );
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
