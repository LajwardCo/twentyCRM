// Adds a `fileType` SELECT field to the Attachment object so the sales app can
// tag every uploaded file (call recording, contract, photo, ...) and filter on
// it in the Files manager. Options mirror FILE_TYPE_OPTIONS in
// packages/twenty-sales-app/src/lib/fileType.ts. Idempotent.
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

const OPTIONS = [
  opt('CALL_RECORDING', 'ضبط تماس', 0, 'blue'),
  opt('VOICE_NOTE', 'یادداشت صوتی', 1, 'sky'),
  opt('MEETING_RECORDING', 'ضبط جلسه', 2, 'purple'),
  opt('PHOTO', 'عکس', 3, 'green'),
  opt('DOCUMENT', 'سند', 4, 'gray'),
  opt('CONTRACT', 'قرارداد', 5, 'orange'),
  opt('QUOTE', 'پیش‌فاکتور', 6, 'yellow'),
  opt('OTHER', 'دیگر', 7, 'gray'),
];

async function main() {
  console.log('-> login');
  await login();

  console.log('-> find attachment object');
  const d = await gql(META, `query {
    objects(paging:{first:500}) { edges { node {
      id nameSingular isSystem
      fields(paging:{first:500}) { edges { node { name } } }
    } } }
  }`);
  const attachment = d.objects.edges.map((e) => e.node).find((n) => n.nameSingular === 'attachment');
  if (!attachment) throw new Error('attachment object not found');

  const existing = attachment.fields.edges.map((e) => e.node.name);
  if (existing.includes('fileType')) {
    console.log('fileType already exists — nothing to do');
    return;
  }

  console.log('-> createOneField attachment.fileType');
  const created = await gql(META,
    `mutation($input:CreateOneFieldMetadataInput!){createOneField(input:$input){id name}}`,
    {
      input: {
        field: {
          objectMetadataId: attachment.id,
          name: 'fileType',
          label: 'File Type',
          type: 'SELECT',
          icon: 'IconFileDescription',
          isNullable: true,
          options: OPTIONS,
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
