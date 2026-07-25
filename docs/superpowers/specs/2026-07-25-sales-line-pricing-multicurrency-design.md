# Deal-line rate overrides + multi-currency product prices

Date: 2026-07-25
Scope: `twenty-sales-app` (Sales UI) + `twenty-server` sales-crm pricing hooks + one provisioning script.

## Problem

Three gaps reported from the field:

1. **Lead detail** — picking a product only lets the seller type metric *quantities*. The
   suggested base price and the per-metric unit prices are invisible and unchangeable, so a
   deal negotiated at a different rate can't be recorded.
2. **New lead** — the registration form has no product step at all; the seller has to save the
   lead, open it, then add the product.
3. **Product detail** — a product's fixed install/annual price is a single CURRENCY composite,
   so a product is priced in AFN *or* USD, never both.

## Data model

Two new RAW_JSON fields, both optional, both absent-safe (the UI degrades to today's behavior
when an instance hasn't been provisioned — same fallback pattern as `product.brand`).

### `product.priceBook` (RAW_JSON)

```json
{ "AFN": { "install": 15000, "annual": 7000 },
  "USD": { "install": 200,   "annual": 100  } }
```

Amounts in major units (؋/$), not micros. Only fixed (install/annual) amounts are per-currency;
metric unit prices stay in the product's primary currency and are covered per-line by the rate
override below. The **primary currency** remains whatever `baseInstallPrice.currencyCode` says,
and `baseInstallPrice`/`baseAnnualPrice` are kept in sync with `priceBook[primary]` on every
save so existing reports, the Twenty CRM table views, and already-created deal lines keep
working unchanged.

### `dealProduct.priceOverrides` (RAW_JSON)

```json
{ "currencyCode": "USD", "fixedInstall": 200, "fixedAnnual": 100,
  "factorRates": { "Doctors": 12, "Employees": 3 } }
```

Every key optional. An absent field, or an empty object, prices exactly as today. `factorRates`
are per-unit prices in the line's currency, keyed by metric name (same keys as
`factorQuantities`).

## Server pricing

`deal-product-price-calculation.service.ts` gains an override step in both paths:

- **Product path** (`calculateInstallPrice`) — the line currency is
  `priceOverrides.currencyCode ?? product primary`; fixed amounts come from
  `priceOverrides.fixed*`, else `priceBook[currency]`, else the `base*` composite fields;
  each factor's `unitPrice` is replaced by `factorRates[name]` when present.
- **Pricing-version path** (`calculateFromPricingVersion`) — an overridden factor's tier bands
  are replaced by a single `PER_UNIT` band at the override rate, so a negotiated rate wins over
  the package's volume tiers instead of silently losing to them.

Pure helpers live in `sales-crm/utils/deal-line-price-overrides.util.ts` so both paths and the
create/update hooks share one implementation and it is unit-testable without a workspace.

**Max-discount guard.** An override that prices the line *below* the catalog price by more than
`product.maxDiscountPercent` is rejected, mirroring the existing `discountPercent` validation —
otherwise the new field is a hole in a rule the catalog already models. Overrides *above*
catalog price are always allowed.

## Sales UI

### `DealLinePricingEditor` (new shared component)

One component, used by both the lead-detail pricing card and the new-lead form:

- product picker (grouped by category, as today)
- currency picker — only the currencies the product actually has a price for
- package picker + active pricing version (lead detail behavior, unchanged)
- line quantity
- one row per metric: **name · unit price (prefilled from the catalog, editable) · quantity**
- fixed install / fixed annual amounts, prefilled from `priceBook[currency]`, editable
- live estimate, computed client-side from the *effective* (overridden) rates
- discount rule picker

Prefill rule: catalog rates prefill when the line currency equals the product's primary
currency. On a different currency the metric rate boxes start empty — the metric table is
single-currency by design, so the seller states the rate rather than being shown a wrong one.

Only values the seller actually changed are sent as `priceOverrides`; an untouched form sends
nothing, so the existing server calculation stays the source of truth for normal deals.

### New lead

An optional final section ("محصول و قیمت") holding the same editor. On submit the lead is
registered first, then the deal line is created against the returned `opportunityId` — a failure
there surfaces as an error on the (already saved) lead rather than losing the registration.

### Product detail / catalog editor

`ProductPricingFields` renders a fixed-price row per currency (AFN and USD) plus a primary-
currency selector. The metrics editor keeps using the primary currency.

## Provisioning

`tools/sales-crm/provision-line-pricing-multicurrency.mjs` — idempotent, same login/ensureField
pattern as the other scripts; adds `product.priceBook` and `dealProduct.priceOverrides`.
Until it runs, the UI hides the second currency column and stops sending `priceOverrides`
(detected by the same "unknown field" error fallback used for `brand`/`category`).

## Testing

- Server: unit tests for the override utils (rate replacement, tier-band replacement, currency
  resolution, max-discount guard) alongside the existing `*.spec.ts` files.
- Sales app: unit tests for the effective-rate resolution and estimate math in
  `lib/productPricing.test.ts`, and for the override payload builder.
- Not covered: live browser verification needs a running backend with the fields provisioned.
