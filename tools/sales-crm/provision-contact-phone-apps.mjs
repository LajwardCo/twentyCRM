// tools/sales-crm/provision-contact-phone-apps.mjs
// Per-number messaging-app availability on the Person object:
//   person.phoneApps — TEXT, a JSON map of canonical number -> messaging apps,
//                      e.g. {"+93790123456":["WHATSAPP","TELEGRAM"]}.
//
// WHY A SIDE FIELD, NOT THE PHONES COMPOSITE
//
// A contact's numbers already live in Twenty's PHONES composite: one primary
// plus an `additionalPhones` array. That composite's shape is fixed by
// twenty-shared (number / countryCode / callingCode) and is read by the call
// matching pipeline (PhoneIndexService), so adding a subfield to it would mean
// forking a shared type that several other systems parse. The app tags ride
// alongside instead.
//
// WHY KEYED BY e164, NOT BY POSITION
//
// Sellers reorder numbers, promote a second number to primary, and edit
// contacts from the main CRM where this field is invisible. Keying the map by
// the canonical e164 form (the same key PhoneIndexService matches on) means
// none of that can silently move "is on WhatsApp" from one number to another.
// A key that no longer matches any number is simply ignored on read.
//
// The Sales App degrades gracefully without this field: numbers still save and
// the UI says the app tags are unavailable. Running this turns the tags on.
//
// Idempotent: skips the field if it already exists. Safe to re-run.
//
// Auth: set TWENTY_TOKEN to a workspace API key (Settings > APIs & Webhooks) to
// skip the password login entirely -- preferable against production, where you
// don't want an admin password in your shell history. Otherwise it logs in with
// TWENTY_EMAIL / TWENTY_PASSWORD (local dev defaults below).
//
//   TWENTY_META=https://crm.hamagan.com/metadata \
//   TWENTY_ORIGIN=https://crm.hamagan.com \
//   TWENTY_TOKEN=... node tools/sales-crm/provision-contact-phone-apps.mjs
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

const FIELD = {
  name: 'phoneApps',
  label: 'Phone apps',
  type: 'TEXT',
  icon: 'IconBrandWhatsapp',
  description:
    'Which messaging apps answer on each of this contact\'s numbers. JSON map of canonical number to app list, e.g. {"+93790123456":["WHATSAPP","TELEGRAM"]}. Written by the Sales App; edit there rather than by hand.',
};

async function main() {
  if (TOKEN) {
    console.log('using TWENTY_TOKEN (API key).\n');
  } else {
    await login();
    console.log(`authenticated as ${EMAIL}.\n`);
  }

  const d = await gql(`query {
    objects(paging:{first:500}){ edges { node {
      id nameSingular
      fields(paging:{first:500}){ edges { node { name } } }
    } } }
  }`);

  const person = d.objects.edges
    .map((e) => e.node)
    .find((o) => o.nameSingular === 'person');
  if (!person) throw new Error('person object not found');

  const existing = new Set(person.fields.edges.map((e) => e.node.name));

  if (existing.has(FIELD.name)) {
    console.log(`[skip]  field: person.${FIELD.name} — exists`);
  } else {
    await gql(
      `mutation($input:CreateOneFieldMetadataInput!){createOneField(input:$input){id name}}`,
      { input: { field: { objectMetadataId: person.id, ...FIELD } } },
    );
    console.log(`[created] field: person.${FIELD.name}`);
  }

  console.log('\ndone.');
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
