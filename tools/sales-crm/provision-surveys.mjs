// tools/sales-crm/provision-surveys.mjs
// Surveys & Forms (spec: docs/superpowers/specs/2026-09-26-surveys-forms-design.md §3, §8).
//
//   surveyForm         — a reusable questionnaire: draft definition + settings
//   surveyFormVersion  — an immutable published snapshot (written only by the
//                        server's publish endpoint; the record API is blocked
//                        by a query hook)
//   surveyResponse     — one submission from any channel, pinned to a version
//   surveyCampaign     — an optional collection initiative
//   surveyInvitation   — an individual link; only the token's SHA-256 is stored
//   task.visitOutcome  — a visit (task of type VISIT) records its outcome even
//   task.surveyCampaign  when no survey was collected
//
// Idempotent: skips anything that already exists. Safe to re-run.
//
//   --schema-only   objects, fields and relations only
//   --roles-only    per-role object permissions only
//
// Auth: TWENTY_TOKEN (workspace API key) or TWENTY_EMAIL / TWENTY_PASSWORD.
//
//   TWENTY_META=https://crm.hamagan.com/metadata \
//   TWENTY_ORIGIN=https://crm.hamagan.com \
//   TWENTY_TOKEN=... node tools/sales-crm/provision-surveys.mjs
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

const SCHEMA_ONLY = process.argv.includes('--schema-only');
const ROLES_ONLY = process.argv.includes('--roles-only');

const OBJECTS = [
  {
    nameSingular: 'surveyForm',
    namePlural: 'surveyForms',
    labelSingular: 'Survey Form',
    labelPlural: 'Survey Forms',
    icon: 'IconForms',
    description: 'A reusable questionnaire with its draft definition and settings',
  },
  {
    nameSingular: 'surveyFormVersion',
    namePlural: 'surveyFormVersions',
    labelSingular: 'Survey Form Version',
    labelPlural: 'Survey Form Versions',
    icon: 'IconVersions',
    description: 'An immutable published snapshot of a survey form',
  },
  {
    nameSingular: 'surveyResponse',
    namePlural: 'surveyResponses',
    labelSingular: 'Survey Response',
    labelPlural: 'Survey Responses',
    icon: 'IconClipboardCheck',
    description: 'One submission of a survey form from any channel',
  },
  {
    nameSingular: 'surveyCampaign',
    namePlural: 'surveyCampaigns',
    labelSingular: 'Survey Campaign',
    labelPlural: 'Survey Campaigns',
    icon: 'IconSpeakerphone',
    description: 'An optional survey collection initiative',
  },
  {
    nameSingular: 'surveyInvitation',
    namePlural: 'surveyInvitations',
    labelSingular: 'Survey Invitation',
    labelPlural: 'Survey Invitations',
    icon: 'IconMailForward',
    description: 'An individual survey link; only a hash of its token is stored',
  },
];

const FIELDS = {
  surveyForm: [
    {
      name: 'formStatus', label: 'Status', type: 'SELECT', icon: 'IconProgressCheck',
      options: [
        opt('DRAFT', 'Draft', 0, 'gray'),
        opt('PUBLISHED', 'Published', 1, 'green'),
        opt('CLOSED', 'Closed', 2, 'orange'),
        opt('ARCHIVED', 'Archived', 3, 'red'),
      ],
    },
    {
      name: 'purpose', label: 'Purpose', type: 'SELECT', icon: 'IconTarget',
      options: [
        opt('FIELD_SURVEY', 'Field survey', 0, 'blue'),
        opt('DEMO_REQUEST', 'Demo request', 1, 'purple'),
        opt('FEEDBACK', 'Customer feedback', 2, 'green'),
        opt('QUALIFICATION', 'Qualification', 3, 'orange'),
        opt('OTHER', 'Other', 4, 'gray'),
      ],
    },
    { name: 'description', label: 'Description', type: 'TEXT', icon: 'IconNotes' },
    { name: 'draftDefinition', label: 'Draft Definition', type: 'RAW_JSON', icon: 'IconBraces' },
    { name: 'draftRevision', label: 'Draft Revision', type: 'NUMBER', icon: 'IconHash' },
    { name: 'draftUpdatedAt', label: 'Draft Updated At', type: 'DATE_TIME', icon: 'IconClock' },
    { name: 'currentVersionNumber', label: 'Current Version', type: 'NUMBER', icon: 'IconVersions' },
    { name: 'hasUnpublishedChanges', label: 'Has Unpublished Changes', type: 'BOOLEAN', icon: 'IconPencil' },
    { name: 'publicSlug', label: 'Public Link Code', type: 'TEXT', icon: 'IconLink', isUnique: true },
    { name: 'publicEnabled', label: 'Public Link Enabled', type: 'BOOLEAN', icon: 'IconWorld' },
    { name: 'opensAt', label: 'Opens At', type: 'DATE_TIME', icon: 'IconCalendar' },
    { name: 'closesAt', label: 'Closes At', type: 'DATE_TIME', icon: 'IconCalendarX' },
    { name: 'responseLimit', label: 'Response Limit', type: 'NUMBER', icon: 'IconNumber' },
    { name: 'campaignIds', label: 'Campaigns', type: 'RAW_JSON', icon: 'IconSpeakerphone' },
  ],
  surveyFormVersion: [
    { name: 'versionNumber', label: 'Version', type: 'NUMBER', icon: 'IconHash' },
    { name: 'definition', label: 'Definition', type: 'RAW_JSON', icon: 'IconBraces' },
    { name: 'publishedAt', label: 'Published At', type: 'DATE_TIME', icon: 'IconCalendarCheck' },
    { name: 'changeNote', label: 'Change Note', type: 'TEXT', icon: 'IconNotes' },
    { name: 'printCode', label: 'Print Code', type: 'TEXT', icon: 'IconPrinter' },
  ],
  surveyResponse: [
    { name: 'versionNumber', label: 'Version', type: 'NUMBER', icon: 'IconHash' },
    { name: 'submissionKey', label: 'Submission Key', type: 'TEXT', icon: 'IconKey', isUnique: true },
    { name: 'answers', label: 'Answers', type: 'RAW_JSON', icon: 'IconBraces' },
    { name: 'skippedByLogic', label: 'Skipped By Logic', type: 'RAW_JSON', icon: 'IconArrowForward' },
    { name: 'language', label: 'Language', type: 'TEXT', icon: 'IconLanguage' },
    {
      name: 'completionStatus', label: 'Completion', type: 'SELECT', icon: 'IconProgressCheck',
      options: [
        opt('PARTIAL', 'Partial', 0, 'orange'),
        opt('COMPLETED', 'Completed', 1, 'green'),
      ],
    },
    {
      name: 'reviewStatus', label: 'Review', type: 'SELECT', icon: 'IconEye',
      options: [
        opt('NEW', 'New', 0, 'blue'),
        opt('NEEDS_REVIEW', 'Needs review', 1, 'orange'),
        opt('REVIEWED', 'Reviewed', 2, 'green'),
        opt('ACTIONED', 'Actioned', 3, 'purple'),
        opt('SPAM', 'Spam', 4, 'red'),
      ],
    },
    {
      name: 'source', label: 'Channel', type: 'SELECT', icon: 'IconRoute',
      options: [
        opt('PUBLIC_LINK', 'Public link', 0, 'blue'),
        opt('INVITATION', 'Invitation', 1, 'purple'),
        opt('STAFF_VISIT', 'Staff visit', 2, 'green'),
        opt('PAPER', 'Paper', 3, 'orange'),
      ],
    },
    { name: 'collectedAt', label: 'Collected At', type: 'DATE_TIME', icon: 'IconCalendar' },
    { name: 'submittedAt', label: 'Submitted At', type: 'DATE_TIME', icon: 'IconSend' },
    { name: 'enteredAt', label: 'Entered At', type: 'DATE_TIME', icon: 'IconKeyboard' },
    { name: 'paperReference', label: 'Paper Reference', type: 'TEXT', icon: 'IconFileDescription' },
    { name: 'paperReviewNotes', label: 'Transcription Notes', type: 'TEXT', icon: 'IconAlertTriangle' },
    {
      name: 'buyingInterest', label: 'Buying Interest', type: 'SELECT', icon: 'IconFlame',
      options: [
        opt('INTERESTED', 'Interested', 0, 'green'),
        opt('UNDECIDED', 'Undecided', 1, 'orange'),
        opt('NOT_INTERESTED', 'Not interested', 2, 'gray'),
      ],
    },
    { name: 'city', label: 'City', type: 'TEXT', icon: 'IconBuildingCommunity' },
    { name: 'area', label: 'Area', type: 'TEXT', icon: 'IconMapPin' },
    { name: 'location', label: 'Location', type: 'RAW_JSON', icon: 'IconMap' },
    { name: 'crmActions', label: 'CRM Actions', type: 'RAW_JSON', icon: 'IconListCheck' },
  ],
  surveyCampaign: [
    { name: 'description', label: 'Description', type: 'TEXT', icon: 'IconNotes' },
    {
      name: 'campaignStatus', label: 'Status', type: 'SELECT', icon: 'IconProgressCheck',
      options: [
        opt('PLANNED', 'Planned', 0, 'gray'),
        opt('ACTIVE', 'Active', 1, 'green'),
        opt('COMPLETED', 'Completed', 2, 'blue'),
        opt('CANCELLED', 'Cancelled', 3, 'red'),
      ],
    },
    { name: 'startsAt', label: 'Starts At', type: 'DATE_TIME', icon: 'IconCalendar' },
    { name: 'endsAt', label: 'Ends At', type: 'DATE_TIME', icon: 'IconCalendarX' },
    { name: 'city', label: 'City', type: 'TEXT', icon: 'IconBuildingCommunity' },
    { name: 'areas', label: 'Areas', type: 'RAW_JSON', icon: 'IconMapPins' },
    { name: 'assigneeIds', label: 'Assigned Employees', type: 'RAW_JSON', icon: 'IconUsers' },
    { name: 'targetResponses', label: 'Target Responses', type: 'NUMBER', icon: 'IconTarget' },
    {
      name: 'channels', label: 'Channels', type: 'MULTI_SELECT', icon: 'IconRoute',
      options: [
        opt('PUBLIC_LINK', 'Public link', 0, 'blue'),
        opt('INVITATION', 'Invitation', 1, 'purple'),
        opt('STAFF_VISIT', 'Staff visit', 2, 'green'),
        opt('PAPER', 'Paper', 3, 'orange'),
      ],
    },
    { name: 'publicCode', label: 'Attribution Code', type: 'TEXT', icon: 'IconTag', isUnique: true },
    { name: 'formIds', label: 'Forms', type: 'RAW_JSON', icon: 'IconForms' },
  ],
  surveyInvitation: [
    { name: 'tokenHash', label: 'Token Hash', type: 'TEXT', icon: 'IconKey', isUnique: true },
    {
      name: 'invitationStatus', label: 'Status', type: 'SELECT', icon: 'IconProgressCheck',
      options: [
        opt('ACTIVE', 'Active', 0, 'green'),
        opt('USED', 'Used', 1, 'blue'),
        opt('REVOKED', 'Revoked', 2, 'red'),
      ],
    },
    { name: 'expiresAt', label: 'Expires At', type: 'DATE_TIME', icon: 'IconCalendarX' },
    { name: 'usedAt', label: 'Used At', type: 'DATE_TIME', icon: 'IconCalendarCheck' },
  ],
  task: [
    {
      name: 'visitOutcome', label: 'Visit Outcome', type: 'SELECT', icon: 'IconDoorEnter',
      options: [
        opt('COMPLETED', 'Completed', 0, 'green'),
        opt('BUSINESS_CLOSED', 'Business closed', 1, 'gray'),
        opt('MANAGER_UNAVAILABLE', 'Manager unavailable', 2, 'orange'),
        opt('DECLINED', 'Declined', 3, 'red'),
        opt('REVISIT_NEEDED', 'Revisit needed', 4, 'purple'),
      ],
    },
  ],
};

// Inverse labels must be unique per target object: several relations point
// at workspaceMember and company.
const RELATIONS = [
  { source: 'surveyForm', name: 'owner', label: 'Owner', target: 'workspaceMember', targetFieldLabel: 'Owned Survey Forms', icon: 'IconUserCircle' },
  { source: 'surveyFormVersion', name: 'form', label: 'Form', target: 'surveyForm', targetFieldLabel: 'Versions', icon: 'IconForms' },
  { source: 'surveyFormVersion', name: 'publishedBy', label: 'Published By', target: 'workspaceMember', targetFieldLabel: 'Published Survey Versions', icon: 'IconUser' },
  { source: 'surveyForm', name: 'publishedVersion', label: 'Published Version', target: 'surveyFormVersion', targetFieldLabel: 'Live On Forms', icon: 'IconVersions' },
  { source: 'surveyResponse', name: 'form', label: 'Form', target: 'surveyForm', targetFieldLabel: 'Responses', icon: 'IconForms' },
  { source: 'surveyResponse', name: 'formVersion', label: 'Form Version', target: 'surveyFormVersion', targetFieldLabel: 'Responses', icon: 'IconVersions' },
  { source: 'surveyResponse', name: 'collector', label: 'Collected By', target: 'workspaceMember', targetFieldLabel: 'Collected Survey Responses', icon: 'IconUser' },
  { source: 'surveyResponse', name: 'enteredBy', label: 'Entered By', target: 'workspaceMember', targetFieldLabel: 'Entered Survey Responses', icon: 'IconKeyboard' },
  { source: 'surveyResponse', name: 'company', label: 'Company', target: 'company', targetFieldLabel: 'Survey Responses', icon: 'IconBuildingSkyscraper' },
  { source: 'surveyResponse', name: 'person', label: 'Contact', target: 'person', targetFieldLabel: 'Survey Responses', icon: 'IconUser' },
  { source: 'surveyResponse', name: 'opportunity', label: 'Lead', target: 'opportunity', targetFieldLabel: 'Survey Responses', icon: 'IconTargetArrow' },
  { source: 'surveyResponse', name: 'campaign', label: 'Campaign', target: 'surveyCampaign', targetFieldLabel: 'Responses', icon: 'IconSpeakerphone' },
  { source: 'surveyResponse', name: 'visit', label: 'Visit', target: 'task', targetFieldLabel: 'Survey Responses', icon: 'IconDoorEnter' },
  { source: 'surveyInvitation', name: 'form', label: 'Form', target: 'surveyForm', targetFieldLabel: 'Invitations', icon: 'IconForms' },
  { source: 'surveyInvitation', name: 'campaign', label: 'Campaign', target: 'surveyCampaign', targetFieldLabel: 'Invitations', icon: 'IconSpeakerphone' },
  { source: 'surveyInvitation', name: 'company', label: 'Intended Company', target: 'company', targetFieldLabel: 'Survey Invitations', icon: 'IconBuildingSkyscraper' },
  { source: 'surveyInvitation', name: 'person', label: 'Intended Contact', target: 'person', targetFieldLabel: 'Survey Invitations', icon: 'IconUser' },
  { source: 'surveyInvitation', name: 'opportunity', label: 'Intended Lead', target: 'opportunity', targetFieldLabel: 'Survey Invitations', icon: 'IconTargetArrow' },
  { source: 'surveyResponse', name: 'invitation', label: 'Invitation', target: 'surveyInvitation', targetFieldLabel: 'Responses', icon: 'IconMailForward' },
  { source: 'task', name: 'surveyCampaign', label: 'Survey Campaign', target: 'surveyCampaign', targetFieldLabel: 'Visits', icon: 'IconSpeakerphone' },
];

// Roles with read-all (Admin, Member) need no entries. Everyone else gets
// exactly this; nobody gets destroy, and only read-all roles can publish
// (publishing needs update on surveyFormVersion, see capabilities endpoint).
const READ = { canReadObjectRecords: true, canUpdateObjectRecords: false, canSoftDeleteObjectRecords: false, canDestroyObjectRecords: false };
const READ_WRITE = { canReadObjectRecords: true, canUpdateObjectRecords: true, canSoftDeleteObjectRecords: false, canDestroyObjectRecords: false };
const ROLE_GRANTS = {
  Seller: { surveyForm: READ, surveyFormVersion: READ, surveyCampaign: READ, surveyResponse: READ_WRITE, surveyInvitation: READ_WRITE },
  // External field marketers collect responses; owner scoping limits them to
  // responses they collected or entered.
  Marketer: { surveyForm: READ, surveyFormVersion: READ, surveyCampaign: READ, surveyResponse: READ_WRITE },
  Partner: { surveyForm: READ, surveyFormVersion: READ, surveyCampaign: READ, surveyResponse: READ_WRITE },
};

const log = [];
const rec = (kind, name, status, detail = '') => {
  log.push({ kind, name, status, detail });
  console.log(`  [${status}] ${kind}: ${name}${detail ? ' — ' + detail : ''}`);
};

async function provisionSchema() {
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
        objectMetadataId: src.id,
        name: r.name,
        label: r.label,
        type: 'RELATION',
        icon: r.icon,
        relationCreationPayload: {
          type: 'MANY_TO_ONE',
          targetObjectMetadataId: tgt.id,
          targetFieldLabel: r.targetFieldLabel,
          targetFieldIcon: 'IconForms',
        },
      });
      rec('relation', `${r.source}.${r.name} -> ${r.target}`, 'created');
    } catch (e) { rec('relation', `${r.source}.${r.name}`, 'FAIL', e.message); }
  }
}

async function provisionRoles() {
  const objs = await fetchObjects();
  const { getRoles: roles } = await gql(`query { getRoles {
    id label canReadAllObjectRecords
    objectPermissions { objectMetadataId canReadObjectRecords canUpdateObjectRecords canSoftDeleteObjectRecords canDestroyObjectRecords }
  } }`);

  console.log('\n== role permissions ==');
  for (const role of roles) {
    const grants = ROLE_GRANTS[role.label];
    if (!grants) {
      rec('permission', role.label, 'skip', role.canReadAllObjectRecords ? 'reads all objects' : 'no survey access');
      continue;
    }
    const wanted = Object.entries(grants)
      .filter(([objectName]) => objs[objectName])
      .map(([objectName, flags]) => ({ objectMetadataId: objs[objectName].id, ...flags }));
    const wantedIds = new Set(wanted.map((p) => p.objectMetadataId));
    // The upsert DELETES every object permission missing from the payload, so
    // the role's existing entries must be re-sent alongside the new ones.
    const existing = (role.objectPermissions ?? [])
      .filter((p) => !wantedIds.has(p.objectMetadataId))
      .map((p) => ({
        objectMetadataId: p.objectMetadataId,
        canReadObjectRecords: p.canReadObjectRecords,
        canUpdateObjectRecords: p.canUpdateObjectRecords,
        canSoftDeleteObjectRecords: p.canSoftDeleteObjectRecords,
        canDestroyObjectRecords: p.canDestroyObjectRecords,
      }));
    const unchanged = wanted.every((w) =>
      (role.objectPermissions ?? []).some(
        (p) => p.objectMetadataId === w.objectMetadataId &&
          p.canReadObjectRecords === w.canReadObjectRecords &&
          p.canUpdateObjectRecords === w.canUpdateObjectRecords &&
          p.canSoftDeleteObjectRecords === w.canSoftDeleteObjectRecords &&
          p.canDestroyObjectRecords === w.canDestroyObjectRecords,
      ),
    );
    if (unchanged) { rec('permission', role.label, 'skip', 'already granted'); continue; }
    try {
      await gql(
        `mutation($i:UpsertObjectPermissionsInput!){ upsertObjectPermissions(upsertObjectPermissionsInput:$i){ objectMetadataId } }`,
        { i: { roleId: role.id, objectPermissions: [...existing, ...wanted] } },
      );
      rec('permission', role.label, 'created', `${wanted.length} survey objects`);
    } catch (e) { rec('permission', role.label, 'FAIL', e.message); }
  }
}

async function main() {
  if (TOKEN) {
    console.log('using TWENTY_TOKEN (API key).\n');
  } else {
    await login();
    console.log(`authenticated as ${EMAIL}.\n`);
  }

  if (!ROLES_ONLY) await provisionSchema();
  if (!SCHEMA_ONLY) await provisionRoles();

  const created = log.filter((l) => l.status === 'created').length;
  const skipped = log.filter((l) => l.status === 'skip').length;
  const fails = log.filter((l) => l.status === 'FAIL');
  console.log(`\n==== SUMMARY: ${created} created, ${skipped} skipped, ${fails.length} failed ====`);
  if (fails.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
