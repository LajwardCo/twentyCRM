// Adds a `taskType` SELECT field to the Task object (CALL / MEETING / DEMO /
// VISIT / OTHER) for the sales-app task workflow. Idempotent.
//
// Auth: TWENTY_TOKEN bearer (API key) or TWENTY_EMAIL/TWENTY_PASSWORD.
// Target: TWENTY_META (default http://localhost:3010/metadata).

const META = process.env.TWENTY_META || 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN || 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL || 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD || 'tim@apple.dev';

let TOKEN = null;

async function gql(url, query, variables) {
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

async function login() {
  if (process.env.TWENTY_TOKEN) {
    TOKEN = process.env.TWENTY_TOKEN.trim();
    return;
  }
  const a = await gql(META, `mutation($e:String!,$p:String!,$o:String!){getLoginTokenFromCredentials(email:$e,password:$p,origin:$o){loginToken{token}}}`, { e: EMAIL, p: PASSWORD, o: ORIGIN });
  const b = await gql(META, `mutation($t:String!,$o:String!){getAuthTokensFromLoginToken(loginToken:$t,origin:$o){tokens{accessOrWorkspaceAgnosticToken{token}}}}`, { t: a.getLoginTokenFromCredentials.loginToken.token, o: ORIGIN });
  TOKEN = b.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;
}

const opt = (value, label, position, color) => ({ value, label, position, color });

async function main() {
  console.log('-> login');
  await login();

  console.log('-> find task object');
  const d = await gql(META, `query {
    objects(paging:{first:500}) { edges { node {
      id nameSingular isSystem
      fields(paging:{first:500}) { edges { node { name } } }
    } } }
  }`);
  const task = d.objects.edges.map((e) => e.node).find((n) => n.nameSingular === 'task');
  if (!task) throw new Error('task object not found');

  const existing = task.fields.edges.map((e) => e.node.name);
  if (existing.includes('taskType')) {
    console.log('taskType already exists — nothing to do');
    return;
  }

  console.log('-> createOneField task.taskType');
  const created = await gql(META,
    `mutation($input:CreateOneFieldMetadataInput!){createOneField(input:$input){id name}}`,
    {
      input: {
        field: {
          objectMetadataId: task.id,
          name: 'taskType',
          label: 'Task Type',
          type: 'SELECT',
          icon: 'IconListCheck',
          options: [
            opt('CALL', 'تماس', 0, 'blue'),
            opt('MEETING', 'جلسه', 1, 'purple'),
            opt('DEMO', 'دمو', 2, 'green'),
            opt('VISIT', 'بازدید', 3, 'orange'),
            opt('OTHER', 'دیگر', 4, 'gray'),
          ],
        },
      },
    },
  );
  console.log('created:', created.createOneField.id);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
