// tools/sales-crm/provision-metric-pricing.mjs
// Metadata for metric-based group discounts:
//   1. New TEXT field discountRule.conditionMetric (which pricing metric the
//      MIN_METRIC_QUANTITY condition thresholds on).
//   2. Appends the MIN_METRIC_QUANTITY option to the existing
//      discountRule.conditionType SELECT (preserving existing options).
// See docs/superpowers/specs/2026-07-23-sales-app-pricing-currency-metrics-design.md.
//
// pricingModel (FLAT/PER_FACTOR) and pricingFactors (RAW_JSON) already exist,
// and metric billingFrequency lives inside that JSON -- so no schema change is
// needed for the "based on metrics" product editor.
//
// Idempotent: skips the field if it exists; only appends the SELECT option if
// missing. Safe to re-run.
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

const opt = (value, label, position, color) => ({ value, label, position, color });

async function main() {
  await login();
  console.log('authenticated.\n');

  const d = await gql(`query {
    objects(paging:{first:500}){ edges { node {
      id nameSingular
      fields(paging:{first:500}){ edges { node { id name type options } } }
    } } }
  }`);

  const discountRule = d.objects.edges
    .map((e) => e.node)
    .find((o) => o.nameSingular === 'discountRule');
  if (!discountRule) throw new Error('discountRule object not found -- run provision-discount-bundle-rules.mjs first');

  const fields = discountRule.fields.edges.map((e) => e.node);

  // 1) conditionMetric TEXT field
  if (fields.some((f) => f.name === 'conditionMetric')) {
    console.log('[skip]  field: discountRule.conditionMetric — exists');
  } else {
    await gql(
      `mutation($input:CreateOneFieldMetadataInput!){createOneField(input:$input){id name}}`,
      {
        input: {
          field: {
            objectMetadataId: discountRule.id,
            name: 'conditionMetric',
            label: 'Condition: Metric',
            type: 'TEXT',
            description:
              'The pricing metric name (matches a Product pricingFactors entry) that MIN_METRIC_QUANTITY thresholds on.',
          },
        },
      },
    );
    console.log('[created] field: discountRule.conditionMetric');
  }

  // 2) append MIN_METRIC_QUANTITY to conditionType SELECT
  const conditionType = fields.find((f) => f.name === 'conditionType');
  if (!conditionType) throw new Error('discountRule.conditionType field not found');

  const existing = conditionType.options ?? [];
  if (existing.some((o) => o.value === 'MIN_METRIC_QUANTITY')) {
    console.log('[skip]  option: conditionType.MIN_METRIC_QUANTITY — exists');
  } else {
    // Insert after MIN_QUANTITY so related conditions sit together; renumber
    // positions to stay contiguous.
    const merged = [
      ...existing.map(({ value, label, position, color }) => ({ value, label, position, color })),
      opt('MIN_METRIC_QUANTITY', 'Minimum Metric Quantity', existing.length, 'turquoise'),
    ]
      .sort((a, b) => a.position - b.position)
      .map((o, i) => ({ ...o, position: i }));

    const updated = await gql(
      `mutation($id:UUID!,$u:UpdateFieldInput!){updateOneField(input:{id:$id,update:$u}){id options}}`,
      { id: conditionType.id, u: { options: merged } },
    );
    console.log(
      '[updated] conditionType options ->',
      updated.updateOneField.options.map((o) => o.value).join(', '),
    );
  }

  console.log('\ndone.');
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
