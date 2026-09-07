// Audit log: the `auditEvent` object the sales app writes every user action to.
//
// Same idempotent shape as the other provisioners here -- safe to re-run, it
// skips whatever already exists. See docs/sales-crm/audit-log.md for the
// threat model and for what this log can and cannot see.
//
// The permission model is the point of this script, not the fields:
//
//   * every non-admin role is denied all four permissions on auditEvent. Not
//     "not granted" -- explicitly denied, because a per-object override beats
//     a role's canReadAllObjectRecords, and roles like Member have that on.
//   * nobody but an admin can read it, and NOBODY writes it through the API:
//     the app posts events to POST /rest/sales/audit-events, and the server
//     writes them with permissions bypassed. That indirection exists because
//     Twenty refuses "write but not read" (it returns "Cannot give update
//     permission to non-readable object"), so a client-credentialed log would
//     have to be a log every seller could read in full.
//   * admins read it through the Admin role's canReadAllObjectRecords, which
//     this script does not touch.
//
// CAREFUL: upsertObjectPermissions DELETES any object permission for a role
// that is missing from its payload. This script therefore reads each role's
// current permissions and re-sends them alongside the new one. Do not
// "simplify" it into sending only the audit entry -- that would silently strip
// every permission provision-permissions.mjs set up.

const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';

// Who counts as an admin, i.e. who keeps the ability to read the log.
//
// NOT the role's label. A workspace's real administrators are frequently on a
// role called something else entirely -- on the dev instance the owner sits on
// one labelled "Object-restricted" -- so matching on the name locks the actual
// admins out of the audit screen while leaving the log readable by whoever
// happens to own a role called "Admin".
//
// The test that matters is canUpdateAllSettings, because that is the same
// permission the app itself probes to decide who is an admin (it calls
// getRoles, which the SETTINGS/PERMISSIONS grant gates). Using the same
// signal means the UI and the data layer cannot disagree about who may read
// the trail. The label check stays only as a second way to say yes.
const ADMIN_ROLE_LABELS = new Set(['Admin', 'Administrator']);

const isAdminRole = (role) =>
  role.canUpdateAllSettings === true || ADMIN_ROLE_LABELS.has(role.label);

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
  const b = await gql(
    `mutation($t:String!,$o:String!){getAuthTokensFromLoginToken(loginToken:$t,origin:$o){tokens{accessOrWorkspaceAgnosticToken{token}}}}`,
    { t: a.getLoginTokenFromCredentials.loginToken.token, o: ORIGIN },
  );
  TOKEN = b.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;
}

async function fetchObjects() {
  const d = await gql(`query { objects(paging:{first:500}) { edges { node {
    id nameSingular isSystem
    fields(paging:{first:500}) { edges { node { id name } } }
  } } } }`);
  const map = {};
  for (const { node } of d.objects.edges) {
    map[node.nameSingular] = {
      id: node.id,
      fields: new Map(node.fields.edges.map((e) => [e.node.name, e.node.id])),
    };
  }
  return map;
}

const createObject = (spec) =>
  gql(`mutation($input:CreateOneObjectInput!){createOneObject(input:$input){id nameSingular}}`, {
    input: { object: spec },
  }).then((d) => d.createOneObject);

const createField = (input) =>
  gql(`mutation($input:CreateOneFieldMetadataInput!){createOneField(input:$input){id name}}`, {
    input: { field: input },
  }).then((d) => d.createOneField);

const OBJECT = {
  nameSingular: 'auditEvent',
  namePlural: 'auditEvents',
  labelSingular: 'Audit Event',
  labelPlural: 'Audit Events',
  icon: 'IconShieldLock',
  description:
    'One recorded user action in the sales app: who, what, on which record, from which device, and when.',
};

const FIELDS = [
  // Client-side time. The row's own createdAt is the server's time; the app
  // compares the two and flags a device whose clock has been moved.
  { name: 'occurredAt', label: 'Occurred At', type: 'DATE_TIME' },
  { name: 'eventType', label: 'Event Type', type: 'TEXT' },
  { name: 'category', label: 'Category', type: 'TEXT' },
  { name: 'severity', label: 'Severity', type: 'TEXT' },
  // The actor is denormalized as well as related: a row has to stay readable
  // after the workspace member is deleted.
  { name: 'actorName', label: 'Actor Name', type: 'TEXT' },
  { name: 'actorEmail', label: 'Actor Email', type: 'TEXT' },
  { name: 'actorRole', label: 'Actor Role', type: 'TEXT' },
  { name: 'targetType', label: 'Target Type', type: 'TEXT' },
  { name: 'targetId', label: 'Target Id', type: 'TEXT' },
  { name: 'targetLabel', label: 'Target Label', type: 'TEXT' },
  { name: 'route', label: 'Route', type: 'TEXT' },
  // Redacted JSON: field names, counts and codes. Never field values.
  { name: 'detail', label: 'Detail', type: 'TEXT' },
  { name: 'sessionId', label: 'Session Id', type: 'TEXT' },
  { name: 'device', label: 'Device', type: 'TEXT' },
  // Stamped by the server from the proxy header. The one field on this object
  // the client neither supplies nor can lie about.
  { name: 'ipAddress', label: 'IP Address', type: 'TEXT' },
];

const RELATION = {
  name: 'actor',
  label: 'Actor',
  target: 'workspaceMember',
  targetFieldLabel: 'Audit Events',
  targetFieldIcon: 'IconShieldLock',
  icon: 'IconUser',
};

const log = [];
const rec = (kind, name, status, detail = '') => {
  log.push({ kind, name, status, detail });
  console.log(`  [${status}] ${kind}: ${name}${detail ? ' — ' + detail : ''}`);
};

async function provisionPermissions(auditObjectId) {
  const { getRoles: roles } = await gql(`query { getRoles {
    id label canUpdateAllSettings
    objectPermissions { objectMetadataId canReadObjectRecords canUpdateObjectRecords canSoftDeleteObjectRecords canDestroyObjectRecords }
  } }`);

  for (const role of roles) {
    // Everything except the audit entry. Re-sending this list is load-bearing
    // in both branches below: the server DELETES any object permission for the
    // role that the payload omits.
    const existing = (role.objectPermissions ?? [])
      .filter((p) => p.objectMetadataId !== auditObjectId)
      .map((p) => ({
        objectMetadataId: p.objectMetadataId,
        canReadObjectRecords: p.canReadObjectRecords,
        canUpdateObjectRecords: p.canUpdateObjectRecords,
        canSoftDeleteObjectRecords: p.canSoftDeleteObjectRecords,
        canDestroyObjectRecords: p.canDestroyObjectRecords,
      }));

    const hasAuditEntry = (role.objectPermissions ?? []).some(
      (p) => p.objectMetadataId === auditObjectId,
    );

    if (isAdminRole(role)) {
      // An earlier run of this script may have denied a role that only later
      // became (or was only later recognised as) an admin role. Leaving that
      // deny in place would lock the actual administrators out of the audit
      // screen, so clear it by omitting it from the payload.
      if (!hasAuditEntry) {
        rec('permission', role.label, 'skip', 'admin role — keeps read access');
        continue;
      }
      try {
        await gql(
          `mutation($i:UpsertObjectPermissionsInput!){ upsertObjectPermissions(upsertObjectPermissionsInput:$i){ objectMetadataId } }`,
          { i: { roleId: role.id, objectPermissions: existing } },
        );
        rec('permission', role.label, 'created', 'admin role — removed stale deny');
      } catch (e) {
        rec('permission', role.label, 'FAIL', e.message);
      }
      continue;
    }

    // Explicit deny on all four. Writes do not need a grant: they come from
    // the server endpoint, which bypasses permissions entirely.
    const desired = {
      objectMetadataId: auditObjectId,
      canReadObjectRecords: false,
      canUpdateObjectRecords: false,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    };

    try {
      await gql(
        `mutation($i:UpsertObjectPermissionsInput!){ upsertObjectPermissions(upsertObjectPermissionsInput:$i){ objectMetadataId canReadObjectRecords canUpdateObjectRecords } }`,
        {
          i: {
            roleId: role.id,
            objectPermissions: [...existing, desired],
          },
        },
      );
      rec('permission', role.label, 'created', 'denied read/write (server writes with bypass)');
    } catch (e) {
      rec('permission', role.label, 'FAIL', e.message);
    }
  }
}

async function main() {
  await login();
  console.log('authenticated.\n');
  let objs = await fetchObjects();

  console.log('== object ==');
  if (objs[OBJECT.nameSingular]) {
    rec('object', OBJECT.nameSingular, 'skip', 'exists');
  } else {
    try {
      const o = await createObject(OBJECT);
      rec('object', o.nameSingular, 'created', o.id);
    } catch (e) {
      rec('object', OBJECT.nameSingular, 'FAIL', e.message);
    }
  }
  objs = await fetchObjects();

  const audit = objs[OBJECT.nameSingular];
  if (!audit) {
    console.error('FATAL: auditEvent object missing after create; aborting.');
    process.exit(1);
  }

  console.log('\n== fields ==');
  for (const f of FIELDS) {
    if (audit.fields.has(f.name)) {
      rec('field', `auditEvent.${f.name}`, 'skip', 'exists');
      continue;
    }
    try {
      await createField({ objectMetadataId: audit.id, ...f });
      rec('field', `auditEvent.${f.name}`, 'created');
    } catch (e) {
      rec('field', `auditEvent.${f.name}`, 'FAIL', e.message);
    }
  }

  console.log('\n== relation ==');
  objs = await fetchObjects();
  const src = objs[OBJECT.nameSingular];
  const tgt = objs[RELATION.target];
  if (src.fields.has(RELATION.name)) {
    rec('relation', `auditEvent.${RELATION.name}`, 'skip', 'exists');
  } else if (!tgt) {
    rec('relation', `auditEvent.${RELATION.name}`, 'FAIL', 'workspaceMember missing');
  } else {
    try {
      await createField({
        objectMetadataId: src.id,
        name: RELATION.name,
        label: RELATION.label,
        type: 'RELATION',
        icon: RELATION.icon,
        relationCreationPayload: {
          type: 'MANY_TO_ONE',
          targetObjectMetadataId: tgt.id,
          targetFieldLabel: RELATION.targetFieldLabel,
          targetFieldIcon: RELATION.targetFieldIcon,
        },
      });
      rec('relation', `auditEvent.${RELATION.name} -> workspaceMember`, 'created');
    } catch (e) {
      rec('relation', `auditEvent.${RELATION.name}`, 'FAIL', e.message);
    }
  }

  console.log('\n== permissions ==');
  await provisionPermissions(audit.id);

  const fails = log.filter((l) => l.status === 'FAIL');
  console.log(
    `\n==== SUMMARY: ${log.filter((l) => l.status === 'created').length} created, ` +
      `${log.filter((l) => l.status === 'skip').length} skipped, ${fails.length} failed ====`,
  );
  if (fails.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
