# Fixed price + metrics pricing (Sales UI)

Date: 2026-07-25

## Problem

A product's pricing was either flat **or** metric-based, never both. The
catalog editor showed base-price inputs for `FLAT` and the metrics editor for
`PER_FACTOR`, and `saveCatalogProduct` nulled `pricingFactors` outside
`PER_FACTOR`. Real products often carry a fixed one-time install fee *plus*
per-metric recurring fees.

A second, related gap: the deal-line form only rendered metric quantity inputs
from a Package pricing version's `tierSchedule`, and only sent
`factorQuantities` when an active version existed — so a product's own
`pricingFactors` never reached the server hook and product-level metric
pricing never computed.

## Approach

No metadata or schema change. `pricingModel = 'PER_FACTOR'` is redefined from
"priced by metrics" to "priced by metrics, optionally plus fixed amounts",
combining three fields that already exist:

| Field | Role | Optional |
|---|---|---|
| `baseInstallPrice` | fixed one-time amount (install/setup fee) | yes |
| `baseAnnualPrice` | fixed recurring amount, billed annually | yes |
| `pricingFactors` | per-metric rates (monthly/hourly/annual) | yes |

Blank fixed amounts reproduce the previous pure-metrics behaviour; an empty
metric table reproduces flat pricing. Rejected alternatives: a third SELECT
option (`FIXED + METRICS`), which needs a metadata provisioning run with
workspace-admin credentials on prod; and folding the fixed fee into the metric
table as a quantity-1 row, which conflates two different concepts in the UI.

Known limitation: a fixed **monthly** recurring amount is not expressible —
only one-time and annual. `FLAT` products already had this limit.

## Implementation

**Server**

- `utils/product-fixed-plus-metrics-price.util.ts` (new, unit-tested):
  `computeFixedPlusMetricsPrice` returns
  `installMicros = baseInstall + Σ(monthly + hourly metrics)` and
  `annualMicros = baseAnnual + Σ(annual metrics)`. Metrics still run through
  `computePriceFromTierSchedule` as degenerate single-band per-unit schedules,
  so product-level and package-tier pricing share one engine and no cadence is
  converted into another.
- `deal-product-price-calculation.service.ts`: `calculateInstallPrice` uses the
  new util. The early return on missing `factorQuantities` moved after the
  `PER_FACTOR` check so a fixed-only product still prices; it now returns
  `undefined` only when there is nothing to price off at all (no fixed amount
  and no quantities), which keeps a manually-set `installPrice` from being
  overwritten with 0. Currency falls back `baseInstallPrice` →
  `baseAnnualPrice` → USD. The `pricingVersionId` path is untouched.

**Sales app**

- `lib/productPricing.ts` (new, unit-tested): client mirror of the server
  formula, in major units, so the seller's preview matches what the server
  stores.
- `components/ProductPricingFields.tsx` (new): the fixed-amounts + metrics half
  of the product editor, shared by `CatalogView` and `CatalogDetailViews`
  (previously duplicated). Fixed inputs always render; the metrics editor
  renders additionally for `PER_FACTOR`, with a hint that the two add up.
- Product detail read view lists fixed rows and metric rows together.
- `api/records.ts`: `ProductOption` gains `pricingModel` + `pricingFactors`.
- `components/LeadPanels.tsx`: metric quantity inputs fall back to the
  product's own metric table when no active package version exists; the
  `activeVersion &&` gate on sending `factorQuantities` is removed; a price
  preview shows install/annual totals with a per-part breakdown.

## Verification

- 8 server unit tests (`product-fixed-plus-metrics-price.util.spec.ts`); full
  `sales-crm` server suite 51 passed.
- 9 sales-app unit tests (`productPricing.test.ts`); full suite 54 passed.
- `tsc --noEmit` clean for twenty-sales-app; `vite build` clean.
- `nx lint:diff-with-main twenty-server` clean.

## Rollout note

Base prices were hidden for `PER_FACTOR` products before this change, so a
product could carry a stale non-zero base amount that will now be added to its
computed price. Audit prod before deploying:

```graphql
query { products(filter: { pricingModel: { eq: "PER_FACTOR" } }, first: 200) {
  edges { node { name baseInstallPrice { amountMicros } baseAnnualPrice { amountMicros } } } } }
```

Clear any base amount that was not meant as a fixed fee.
