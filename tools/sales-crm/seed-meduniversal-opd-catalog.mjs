// tools/sales-crm/seed-meduniversal-opd-catalog.mjs
//
// Seeds the real MedUniversal OPD catalog entry:
//
//   Product "MedUniversal OPD" (PER_FACTOR, AFN)
//     metric doctor    500 AFN / month
//     metric employee   70 AFN / year
//
//   Package "OPD Doctor Tiers" -> active Pricing Version tiering ONLY doctors:
//     1-4    -> 2000 AFN/month flat
//     5-9    ->  400 AFN/month per doctor
//     10-20  ->  300 AFN/month per doctor
//     21+    ->  250 AFN/month per doctor
//
// The employee metric is deliberately NOT in the tier schedule: metrics are
// independent price lines, so every metric a package does not tier stays at
// the product's own rate and is billed on top (server-side
// mergeProductFactorsIntoTierSchedule). Adding employees to the tier table
// here would double-bill them.
//
// Unlike the provision-*.mjs scripts this writes RECORDS, not metadata, so it
// talks to /graphql (core API), not /metadata. Idempotent: matches by name and
// updates in place; re-running never creates a second product/package, and it
// only creates a new Pricing Version when the active one differs.
//
// Auth: TWENTY_TOKEN (an API key from Settings > APIs -- what prod uses) or
// TWENTY_EMAIL/TWENTY_PASSWORD (dev default).

const API = process.env.TWENTY_API ?? 'http://localhost:3010/graphql';
const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';

const PRODUCT_NAME = 'MedUniversal OPD';
const PACKAGE_NAME = 'OPD Doctor Tiers';
const CURRENCY = 'AFN';

const PRICING_FACTORS = [
  { name: 'doctor', unitPrice: 500, billingFrequency: 'MONTHLY' },
  { name: 'employee', unitPrice: 70, billingFrequency: 'ANNUAL' },
];

const TIER_SCHEDULE = [
  {
    factor: 'doctor',
    billingFrequency: 'MONTHLY',
    bands: [
      { minQty: 1, maxQty: 4, mode: 'FLAT', amount: 2000 },
      { minQty: 5, maxQty: 9, mode: 'PER_UNIT', amount: 400 },
      { minQty: 10, maxQty: 20, mode: 'PER_UNIT', amount: 300 },
      { minQty: 21, maxQty: null, mode: 'PER_UNIT', amount: 250 },
    ],
  },
];

let TOKEN = process.env.TWENTY_TOKEN ?? null;

const post = async (endpoint, query, variables) => {
  const res = await fetch(endpoint, {
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
};

const gql = (query, variables) => post(API, query, variables);

const login = async () => {
  const a = await post(
    META,
    `mutation($e:String!,$p:String!,$o:String!){getLoginTokenFromCredentials(email:$e,password:$p,origin:$o){loginToken{token}}}`,
    { e: EMAIL, p: PASSWORD, o: ORIGIN },
  );
  const loginToken = a.getLoginTokenFromCredentials.loginToken.token;
  const b = await post(
    META,
    `mutation($t:String!,$o:String!){getAuthTokensFromLoginToken(loginToken:$t,origin:$o){tokens{accessOrWorkspaceAgnosticToken{token}}}}`,
    { t: loginToken, o: ORIGIN },
  );
  TOKEN = b.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;
};

const toMicros = (amount) => ({
  amountMicros: Math.round(amount * 1_000_000),
  currencyCode: CURRENCY,
});

// ---------- product ----------

const PRODUCT_FIELDS = `
  id name pricingModel pricingFactors maxDiscountPercent isSellable
  baseInstallPrice { amountMicros currencyCode }
  baseAnnualPrice { amountMicros currencyCode }
`;

const findProduct = async () => {
  const d = await gql(
    `query($name:String!){ products(filter:{name:{eq:$name}}, first:1){ edges { node { ${PRODUCT_FIELDS} } } } }`,
    { name: PRODUCT_NAME },
  );
  return d.products.edges[0]?.node;
};

const upsertProduct = async () => {
  // baseInstallPrice carries the currency for the per-metric path even at zero
  // -- without it the server falls back to USD. Zero amount = no fixed fee on
  // top of the metrics.
  const payload = {
    name: PRODUCT_NAME,
    pricingModel: 'PER_FACTOR',
    pricingFactors: PRICING_FACTORS,
    baseInstallPrice: toMicros(0),
    baseAnnualPrice: toMicros(0),
    isSellable: true,
  };

  const existing = await findProduct();

  if (existing) {
    const d = await gql(
      `mutation($id:UUID!,$data:ProductUpdateInput!){ updateProduct(id:$id, data:$data){ id } }`,
      { id: existing.id, data: payload },
    );
    console.log(`product   updated  ${PRODUCT_NAME} (${d.updateProduct.id})`);
    return d.updateProduct.id;
  }

  const d = await gql(
    `mutation($data:ProductCreateInput!){ createProduct(data:$data){ id } }`,
    { data: payload },
  );
  console.log(`product   created  ${PRODUCT_NAME} (${d.createProduct.id})`);
  return d.createProduct.id;
};

// ---------- package ----------

const upsertPackage = async (productId) => {
  const d = await gql(
    `query($name:String!,$productId:UUID!){ packages(filter:{name:{eq:$name}, productId:{eq:$productId}}, first:1){ edges { node { id name status } } } }`,
    { name: PACKAGE_NAME, productId },
  );
  const existing = d.packages.edges[0]?.node;

  if (existing) {
    console.log(`package   exists   ${PACKAGE_NAME} (${existing.id})`);
    return existing.id;
  }

  const created = await gql(
    `mutation($data:PackageCreateInput!){ createPackage(data:$data){ id } }`,
    {
      data: {
        name: PACKAGE_NAME,
        productId,
        status: 'ACTIVE',
        allowsCustomPricing: false,
        notes: 'Doctor-count tiers. Employees are billed on top at the product rate (70 AFN/year).',
      },
    },
  );
  console.log(`package   created  ${PACKAGE_NAME} (${created.createPackage.id})`);
  return created.createPackage.id;
};

// ---------- pricing version ----------

const upsertPricingVersion = async (packageId) => {
  const d = await gql(
    `query($packageId:UUID!){ pricingVersions(filter:{packageId:{eq:$packageId}}, first:100, orderBy:[{versionNumber:DescNullsLast}]){ edges { node { id versionNumber isActive currencyCode tierSchedule } } } }`,
    { packageId },
  );
  const active = d.pricingVersions.edges.map((e) => e.node).find((v) => v.isActive);

  if (
    active &&
    active.currencyCode === CURRENCY &&
    JSON.stringify(active.tierSchedule) === JSON.stringify(TIER_SCHEDULE)
  ) {
    console.log(`version   current  v${active.versionNumber} already matches (${active.id})`);
    return active.id;
  }

  // versionNumber is assigned server-side; creating an active version
  // deactivates whichever one was active before -- old versions are kept.
  const created = await gql(
    `mutation($data:PricingVersionCreateInput!){ createPricingVersion(data:$data){ id versionNumber } }`,
    {
      data: {
        packageId,
        isActive: true,
        effectiveFrom: new Date().toISOString(),
        currencyCode: CURRENCY,
        tierSchedule: TIER_SCHEDULE,
      },
    },
  );
  const node = created.createPricingVersion;
  console.log(
    `version   created  v${node.versionNumber} (${node.id})${active ? ` -- superseded v${active.versionNumber}` : ''}`,
  );
  return node.id;
};

// ---------- verify ----------

const verify = async (productId, packageId) => {
  const product = await findProduct();
  const d = await gql(
    `query($packageId:UUID!){ pricingVersions(filter:{packageId:{eq:$packageId}, isActive:{eq:true}}, first:1){ edges { node { versionNumber currencyCode tierSchedule } } } }`,
    { packageId },
  );
  const version = d.pricingVersions.edges[0]?.node;

  console.log('\n--- read-back ---');
  console.log(`product ${productId}`);
  console.log(`  pricingModel   ${product?.pricingModel}`);
  console.log(`  currency       ${product?.baseInstallPrice?.currencyCode}`);
  for (const metric of product?.pricingFactors ?? []) {
    console.log(`  metric         ${metric.name} ${metric.unitPrice} ${metric.billingFrequency}`);
  }
  console.log(`package ${packageId} -- active v${version?.versionNumber} (${version?.currencyCode})`);
  for (const factor of version?.tierSchedule ?? []) {
    for (const band of factor.bands) {
      console.log(
        `  tier           ${factor.factor} ${band.minQty}-${band.maxQty ?? '∞'} ${band.mode} ${band.amount} (${factor.billingFrequency})`,
      );
    }
  }
  const untiered = (product?.pricingFactors ?? []).filter(
    (metric) => !(version?.tierSchedule ?? []).some((factor) => factor.factor === metric.name),
  );
  console.log(
    `  billed on top  ${untiered.map((m) => `${m.name} ${m.unitPrice} ${m.billingFrequency}`).join(', ') || '(none)'}`,
  );
};

const main = async () => {
  if (!TOKEN) {
    await login();
  }
  const productId = await upsertProduct();
  const packageId = await upsertPackage(productId);
  await upsertPricingVersion(packageId);
  await verify(productId, packageId);
};

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
