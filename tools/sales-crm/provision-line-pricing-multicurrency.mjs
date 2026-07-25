// tools/sales-crm/provision-line-pricing-multicurrency.mjs
// Two RAW_JSON fields behind "price a deal line in the currency and at the
// rates the seller actually negotiated":
//
//   product.priceBook         — fixed install/annual amounts per currency:
//                               {"AFN":{"install":15000,"annual":7000},
//                                "USD":{"install":200,"annual":100}}
//                               Real, separately-entered amounts — no exchange
//                               rate is ever applied. baseInstallPrice /
//                               baseAnnualPrice stay in sync with the primary
//                               currency's entry, so CRM table views, reports
//                               and already-created deal lines are unaffected.
//
//   dealProduct.priceOverrides — what the seller restated on ONE line:
//                               {"currencyCode":"USD","fixedInstall":200,
//                                "fixedAnnual":100,
//                                "factorRates":{"Doctors":12}}
//                               All keys optional; an absent field prices
//                               exactly from the catalog, as before.
//
// RAW_JSON rather than typed fields for the same reason pricingFactors and
// tierSchedule are: the shape is a small map keyed by currency / metric name,
// and metrics differ per product, so no fixed column set fits.
//
// The Sales UI degrades gracefully until this runs (it detects the unknown
// field and stops asking for it), so running this is safe at any time but
// nothing breaks before it does.
//
// Idempotent: skips a field that already exists. Safe to re-run.
//
//   TWENTY_META=https://crm.hamagan.com/metadata \
//   TWENTY_ORIGIN=https://crm.hamagan.com \
//   TWENTY_EMAIL=... TWENTY_PASSWORD=... node tools/sales-crm/provision-line-pricing-multicurrency.mjs
const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';

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

const FIELDS = [
  {
    object: 'product',
    name: 'priceBook',
    label: 'Price Book',
    type: 'RAW_JSON',
    icon: 'IconCurrency',
    description:
      'Fixed install/annual amounts per currency, e.g. {"AFN":{"install":15000,"annual":7000},"USD":{"install":200,"annual":100}}. Amounts are in major units. The primary currency entry mirrors baseInstallPrice/baseAnnualPrice.',
  },
  {
    object: 'dealProduct',
    name: 'priceOverrides',
    label: 'Price Overrides',
    type: 'RAW_JSON',
    icon: 'IconEdit',
    description:
      'Rates the seller restated on this line, e.g. {"currencyCode":"USD","fixedInstall":200,"factorRates":{"Doctors":12}}. Every key optional; empty means price from the catalog. Restating below catalog price is held to the product\'s maxDiscountPercent.',
  },
];

async function main() {
  await login();
  console.log('authenticated.\n');

  const d = await gql(`query {
    objects(paging:{first:500}){ edges { node {
      id nameSingular
      fields(paging:{first:500}){ edges { node { name } } }
    } } }
  }`);

  const objects = d.objects.edges.map((e) => e.node);

  for (const field of FIELDS) {
    const object = objects.find((o) => o.nameSingular === field.object);
    if (!object) throw new Error(`object not found: ${field.object}`);

    const existing = object.fields.edges.map((e) => e.node.name);
    if (existing.includes(field.name)) {
      console.log(`[skip]  field: ${field.object}.${field.name} — exists`);
      continue;
    }

    await gql(
      `mutation($input:CreateOneFieldMetadataInput!){createOneField(input:$input){id name}}`,
      {
        input: {
          field: {
            objectMetadataId: object.id,
            name: field.name,
            label: field.label,
            type: field.type,
            icon: field.icon,
            description: field.description,
          },
        },
      },
    );
    console.log(`[created] field: ${field.object}.${field.name}`);
  }

  console.log('\ndone.');
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
