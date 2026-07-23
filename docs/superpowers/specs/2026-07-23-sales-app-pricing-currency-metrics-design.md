# Sales-app pricing: currency, metrics editor, metric-based discounts

Date: 2026-07-23
Status: Approved
Worktree/branch: `feature/sales-pricing-currency-metrics`

## Problem

Three gaps in the sales-app catalog (`packages/twenty-sales-app`) and the
`sales-crm` server module:

1. Product base prices are always stored/rendered as AFN — the seller cannot
   choose USD, even though the underlying CURRENCY fields already carry a
   `currencyCode`.
2. "Based on metrics" pricing (`pricingModel: 'PER_FACTOR'`, backed by
   `Product.pricingFactors`) is wired end-to-end in the backend but has **no
   UI** to define the metrics and their per-unit fees.
3. Discount rules can only threshold on a line's whole `quantity`
   (`MIN_QUANTITY`). There is no way to say "if Inventory ≥ 2, apply this
   discount" — a discount driven by a specific pricing metric.

## Existing architecture (unchanged foundations)

- `Product`, `Package`, `PricingVersion`, `DiscountRule` are custom workspace
  objects created via the metadata API. Money fields are CURRENCY composites
  `{amountMicros, currencyCode}`. `pricingFactors` and `tierSchedule` are
  RAW_JSON fields (schema-flexible — extending their contents needs no
  migration).
- Deal price is computed in `deal-product-create-one.pre-query.hook.ts`:
  - `pricingVersionId` set → `calculateFromPricingVersion` (package tier table,
    via `computePriceFromTierSchedule`).
  - else `factorQuantities` present → `calculateInstallPrice`
    (`Product.pricingFactors`).
- Discounts validated by `DealProductDiscountRuleValidationService` using
  `evaluateDiscountRuleCondition` (shared, unit-tested).

## Design

### 1. Per-product currency (AFN or USD) — frontend only

- `api/catalog.ts`: `toAmount(amount, currencyCode)`; add
  `currencyCode: 'AFN' | 'USD'` to `CatalogProductInput` (default `'AFN'`) and
  to `CatalogProduct` (read from `baseInstallPrice.currencyCode`).
- `lib/format.ts`: new `formatMoney(amountMicros, currencyCode)` rendering `؋`
  for AFN and `$` for USD; keep `formatAfn` as a thin AFN wrapper for
  callers that are always AFN.
- Product forms (`CatalogView` new-product + `CatalogDetailViews` edit): AFN/USD
  `<select>`; symbol shown beside amount inputs.
- One currency per product: the product's metric fees and any discount
  fixed-amount inherit that product's `currencyCode`.
- No server change — `currencyCode` is already persisted and read.

### 2. Product metrics editor + HOURLY bucket

- `pricingFactors` shape extends `{name, unitPrice}` →
  `{name, unitPrice, billingFrequency: 'MONTHLY' | 'HOURLY' | 'ANNUAL'}`.
  Legacy rows without `billingFrequency` are treated as MONTHLY.
- New `components/ProductMetricsEditor.tsx` (mirrors `TierScheduleEditor`'s
  structural-builder pattern): rows of metric name + per-unit fee + frequency.
  Rendered in the product form only when `pricingModel === 'PER_FACTOR'`.
- `api/catalog.ts`: include `pricingFactors` in `PRODUCT_FIELDS`, input type,
  and save payload.
- Server `pricing-tier-schedule.util.ts`: add `'HOURLY'` to `BillingFrequency`
  and a `totalHourly` output alongside `totalMonthly`/`totalAnnual` (separate
  bucket, **no** hours→months conversion — avoids hardcoding a business
  assumption).
- `deal-product-price-calculation.service.ts` `calculateInstallPrice`: map
  `pricingFactors` into a degenerate single-band per-unit `FactorTierSchedule[]`
  and reuse `computePriceFromTierSchedule` (one pricing engine). Monthly →
  `installPrice`, Annual → `annualPrice`, Hourly surfaced in the snapshot.
- Bonus: `TierScheduleEditor` billing-frequency select also offers HOURLY now
  that the util supports it.

### 3. Metric-based group discount

- Metadata: one new field `conditionMetric` (TEXT) on the `DiscountRule` object,
  created by the metadata-API provisioning script. New `conditionType` value
  `'MIN_METRIC_QUANTITY'`.
- `discount-rule-condition.util.ts`: add `MIN_METRIC_QUANTITY`; facts gain
  `factorQuantities`; evaluate
  `factorQuantities[conditionMetric] >= conditionMinQuantity`. New failure
  reasons `MISSING_METRIC_CONFIG` / `BELOW_METRIC_MIN_QUANTITY`.
- `DealProductDiscountRuleValidationService`: pass the line's `factorQuantities`
  and the rule's `conditionMetric` into the evaluation.
- Frontend discount form (`CatalogView` DiscountRulesTab): new condition type;
  when selected, a metric `<select>` **auto-populated from the applies-to
  product's `pricingFactors`** plus a threshold (reuses `conditionMinQuantity`).
- Labels + `LeadPanels` hint updated.

## Testing

- Extend `discount-rule-condition.util.spec.ts` with MIN_METRIC_QUANTITY cases
  (missing config, below threshold, met).
- Add a unit test for the `pricingFactors` → schedule mapping / HOURLY bucketing.
- `typecheck` + `lint:diff-with-main` for both packages; browser-verify the
  catalog forms.

## Backward compatibility

- Legacy `pricingFactors` rows default to MONTHLY.
- Existing discount rules unaffected (new condition type is additive).
- Currency defaults to AFN, preserving current behavior.
