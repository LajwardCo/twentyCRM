// Lead reminders: two DATE_TIME fields on Task plus a REMINDER task type.
//
//   task.remindAt             when the assignee should be notified
//   task.reminderDismissedAt  set when the seller dismisses a fired reminder
//                             (or completes the task) so it does not re-alert
//                             on every device and refresh; snooze clears it
//   task.taskType += REMINDER the default type for "remind me about this lead"
//
// A reminder is a task, not a new object: the sales app's calendar, Today page
// and lead timeline already render tasks, so a reminder shows up everywhere
// for free. See docs/superpowers/specs/2026-09-12-lead-reminders-design.md.
//
// Idempotent: each step is skipped when already present; existing taskType
// options are written back unchanged (ids included, so saved views and filters
// that reference an option keep pointing at it).
//
// Auth: TWENTY_TOKEN bearer (API key) or TWENTY_EMAIL/TWENTY_PASSWORD.
// Target: TWENTY_META (default http://localhost:3010/metadata).
const META = process.env.TWENTY_META || 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN || 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL || 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD || 'tim@apple.dev';

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
  if (json.errors) {
    throw new Error(JSON.stringify(json.errors.map((e) => e.message)));
  }
  return json.data;
}
async function login() {
  if (process.env.TWENTY_TOKEN) {
    TOKEN = process.env.TWENTY_TOKEN.trim();
    return;
  }
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

async function fetchTaskObject() {
  const data = await gql(`query {
    objects(paging:{first:500}) { edges { node {
      id nameSingular
      fields(paging:{first:500}) { edges { node { id name type options } } }
    } } }
  }`);
  const task = data.objects.edges
    .map((edge) => edge.node)
    .find((node) => node.nameSingular === 'task');
  if (!task) throw new Error('task object not found');
  return {
    id: task.id,
    fields: new Map(task.fields.edges.map((edge) => [edge.node.name, edge.node])),
  };
}

async function ensureDateTimeField(task, spec) {
  if (task.fields.has(spec.name)) {
    console.log(`task.${spec.name} already present — skipping`);
    return;
  }
  console.log(`-> createOneField task.${spec.name}`);
  const created = await gql(
    `mutation($input:CreateOneFieldMetadataInput!){createOneField(input:$input){id name}}`,
    {
      input: {
        field: {
          objectMetadataId: task.id,
          name: spec.name,
          label: spec.label,
          type: 'DATE_TIME',
          icon: spec.icon,
          description: spec.description,
        },
      },
    },
  );
  console.log('created:', created.createOneField.id);
}

async function ensureReminderTaskType(task) {
  const field = task.fields.get('taskType');
  if (!field) {
    throw new Error('task.taskType not found -- run provision-task-type.mjs first');
  }
  const existing = field.options ?? [];
  if (existing.some((option) => option.value === 'REMINDER')) {
    console.log('taskType REMINDER already present — skipping');
    return;
  }
  const options = [
    ...existing.map((option) => ({
      id: option.id,
      value: option.value,
      label: option.label,
      position: option.position,
      color: option.color,
    })),
    { value: 'REMINDER', label: 'یادآوری', position: existing.length, color: 'yellow' },
  ];
  console.log('-> updateOneField task.taskType (+REMINDER)');
  const updated = await gql(
    `mutation($id:UUID!,$u:UpdateFieldInput!){updateOneField(input:{id:$id,update:$u}){id options}}`,
    { id: field.id, u: { options } },
  );
  console.log('taskType ->', updated.updateOneField.options.map((o) => o.value).join(' | '));
}

async function main() {
  console.log('-> login');
  await login();

  console.log('-> find task object');
  const task = await fetchTaskObject();

  await ensureDateTimeField(task, {
    name: 'remindAt',
    label: 'Remind At',
    icon: 'IconBell',
    description: 'When the assignee should be notified about this task',
  });
  await ensureDateTimeField(task, {
    name: 'reminderDismissedAt',
    label: 'Reminder Dismissed At',
    icon: 'IconBellOff',
    description: 'Set when the assignee dismissed the fired reminder; snooze clears it',
  });
  await ensureReminderTaskType(task);

  console.log('done');
}

main().catch((error) => {
  console.error('FATAL:', error.message);
  process.exit(1);
});
