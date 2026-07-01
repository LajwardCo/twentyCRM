// Rename the Opportunity pipeline stages to the sales-team process.
// Portable: looks up the opportunity object by name (no hardcoded ids).
// Idempotent-ish: re-running just re-applies the same options.
const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';
let TOKEN = null;
async function gql(query, variables) {
  const res = await fetch(META, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) }, body: JSON.stringify({ query, variables }) });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors.map((e) => e.message)));
  return json.data;
}
async function login() {
  const a = await gql(`mutation($e:String!,$p:String!,$o:String!){getLoginTokenFromCredentials(email:$e,password:$p,origin:$o){loginToken{token}}}`, { e: EMAIL, p: PASSWORD, o: ORIGIN });
  const b = await gql(`mutation($t:String!,$o:String!){getAuthTokensFromLoginToken(loginToken:$t,origin:$o){tokens{accessOrWorkspaceAgnosticToken{token}}}}`, { t: a.getLoginTokenFromCredentials.loginToken.token, o: ORIGIN });
  TOKEN = b.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;
}
const opt = (value, label, position, color) => ({ value, label, position, color });
const STAGES = [
  opt('NEW_LEAD', 'New Lead', 0, 'gray'),
  opt('FOLLOWING_UP', 'Following Up', 1, 'yellow'),
  opt('DEMO_SCHEDULED', 'Demo Scheduled', 2, 'sky'),
  opt('DEMO_NEGOTIATION', 'Demo & Negotiation', 3, 'blue'),
  opt('CONTRACT_SENT', 'Contract Sent', 4, 'purple'),
  opt('SIGNED_AWAITING_PAYMENT', 'Signed (Awaiting Payment)', 5, 'pink'),
  opt('PAID_AWAITING_TRAINING', 'Paid (Awaiting Training)', 6, 'orange'),
  opt('IN_TRAINING', 'In Training', 7, 'turquoise'),
  opt('ACTIVE_CUSTOMER', 'Active Customer', 8, 'green'),
  opt('LOST_MISSED', 'Lost / Missed', 9, 'red'),
];
async function main() {
  await login();
  const d = await gql(`query { objects(paging:{first:500}){ edges { node { nameSingular fields(paging:{first:500}){ edges { node { id name type } } } } } } }`);
  const opp = d.objects.edges.find((e) => e.node.nameSingular === 'opportunity')?.node;
  if (!opp) throw new Error('opportunity object not found');
  const stage = opp.fields.edges.map((e) => e.node).find((f) => f.name === 'stage');
  if (!stage) throw new Error('stage field not found');
  const updated = await gql(
    `mutation($id:UUID!,$u:UpdateFieldInput!){updateOneField(input:{id:$id,update:$u}){id options defaultValue}}`,
    { id: stage.id, u: { options: STAGES, defaultValue: "'NEW_LEAD'" } },
  );
  console.log('stage pipeline ->', updated.updateOneField.options.map((o) => o.label).join(' -> '));
  console.log('default:', updated.updateOneField.defaultValue);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
