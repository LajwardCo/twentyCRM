# Sales App — Product/Pricing/Discount Catalog Management — Design Spec

Date: 2026-07-09
Status: Approved for implementation.
Environment: `packages/twenty-sales-app` (mobile-first sales SPA), backend at
`packages/twenty-server/src/modules/sales-crm` (Package/Pricing Version model
and Discount Rule model — already provisioned in local dev, live on prod).

## Goal

The sales app currently has no UI for the Package/Pricing Version/Discount
Rule model at all — its only pricing UI is a bare product+quantity dropdown
in `LeadPanels.tsx` (the legacy flat/per-factor path). This spec adds
full CRUD management screens for the catalog itself: **Product**,
**Package**, **Pricing Version** (including its tiered rate table), and
**Discount Rule**. It does not touch the seller's deal-line picker in
`LeadPanels.tsx` — that upgrade (picking a Package/Pricing Version/Discount
Rule when adding a line to a lead) is explicitly out of scope, deferred to a
future spec.

## Navigation & routes

New nav item **"کاتالوگ"** (Catalog) in `Shell.tsx`'s `NAV` array, same
level as "رقبا"/"کاربران". Routes (added to `App.tsx`'s route dispatch):

- `/catalog` — `CatalogView`: two sections, **Products** and **Discount
  Rules**, each with its own list + inline create/edit form (mirrors
  `CompetitorsView.tsx`).
- `/catalog/product/:id` — `ProductCatalogDetailView`: the Product's own
  fields (edit form) + its Packages list below (+ New Package).
- `/catalog/package/:id` — `PackageCatalogDetailView`: the Package's fields
  (edit form) + its Pricing Versions list (newest first, Active badge) + New
  Version (opens the tier-schedule builder).

Rejected alternatives: a single accordion page holding all 4 entities
(too large, breaks the 300-line component convention once the tier-schedule
builder is included), and a generic schema-driven CRUD component shared
across entities (over-engineered for 4 entities with materially different
shapes — no other view in this app uses that pattern).

## API layer

New `packages/twenty-sales-app/src/api/catalog.ts`, following the exact
`coreQuery` + `createX`/`updateX` mutation pattern already used in
`admin.ts` (`saveCompetitor`) and `records.ts` (`addProductToLead`):

- `fetchCatalogProducts()` / `saveCatalogProduct(input, id?)` — full Product
  fields: `name`, `baseInstallPrice`, `baseAnnualPrice`, `maxDiscountPercent`,
  `pricingModel`, `pricingFactorNotes`, `isSellable`.
- `fetchPackagesForProduct(productId)` / `savePackage(input, id?)` —
  `name`, `productId`, `status`, `allowsCustomPricing`, `notes`.
- `fetchPricingVersionsForPackage(packageId)` / `savePricingVersion(input,
  id?)` — `packageId`, `isActive`, `effectiveFrom`, `currencyCode`,
  `tierSchedule`. **`versionNumber` is never sent** — it's assigned
  server-side by `PricingVersionCreateOnePreQueryHook`, which also
  auto-deactivates the previously active version when a new one is created
  with `isActive: true`. The form defaults `isActive` to `true` on create and
  shows a note that this supersedes the package's current active version.
- `fetchDiscountRules()` / `saveDiscountRule(input, id?)` — `name`, `status`,
  `appliesToProductId`, `conditionType`, `conditionMinQuantity`,
  `conditionSiblingProductId`, `discountType`, `discountPercentValue`,
  `discountFixedAmount`, `notes`.
- Reuses the existing `fetchProducts()` from `records.ts` for the product
  picker in Package/Discount Rule forms (id/name is all that's needed there).

All mutations use the workspace `/graphql` endpoint via `coreQuery`, mutation
names `create<Singular>`/`update<Singular>` (confirmed convention: see
`createCompetitor`/`createDealProduct` — no `createOne` prefix at this
layer, that's the metadata-API naming used only by the provisioning
scripts).

## Tier-schedule editor

The `tierSchedule` RAW_JSON field is the one genuinely complex piece:

```ts
type TierBand = { minQty: number; maxQty: number | null; mode: 'FLAT' | 'PER_UNIT'; amount: number };
type FactorTierSchedule = { factor: string; billingFrequency: 'MONTHLY' | 'ANNUAL'; bands: TierBand[] };
```

Built as a structured form, not a raw JSON textarea (this is the data that
directly drives every deal's price — a typo in hand-written JSON is a real
risk):

- A list of factor rows: free-text factor name (must match whatever name the
  seller later enters in `DealProduct.factorQuantities` — same convention as
  `Product.pricingFactorNotes` today), a billing-frequency select
  (Monthly/Annual).
- Each factor has a nested list of band rows: min quantity (number), max
  quantity (number, or a checkbox for "بدون سقف" / unbounded → `null`), a
  mode select (Flat total / Per-unit), amount (number).
- "+ Add band" / remove band per factor; "+ Add factor" / remove factor.
- No live price calculator in this pass (YAGNI) — verification is done by
  creating a real test Deal Product against the version, same pattern
  documented for every other Phase 3 feature.
- On submit, the rows assemble into the `FactorTierSchedule[]` shape and are
  sent as `tierSchedule`.

## Discount Rule form

Conditional fields shown based on the two independent selects, matching
`discount-rule-condition.util.ts`'s exact three condition types and two
discount types:

- `conditionType = ALWAYS` — no extra field.
- `conditionType = MIN_QUANTITY` — show `conditionMinQuantity` (number).
- `conditionType = SIBLING_PRODUCT_PURCHASED` — show
  `conditionSiblingProduct` (product picker, reusing `fetchProducts()`).
- `discountType = PERCENTAGE` — show `discountPercentValue` (number).
- `discountType = FIXED_AMOUNT` — show `discountFixedAmount` (currency
  amount input, same pattern as other CURRENCY fields in this app).

`appliesToProduct` is always a product picker (required).

## Error handling

Same pattern as every existing form in this app (`CompetitorsView`,
`AdminView`): a local `error` state, `try/catch` around the mutation
showing `err.message` in an `.error-banner`, `busy` state disabling the
submit button mid-flight. No client-side permission gating — Twenty's own
object/field-level permissions (the "Seller" role already hides
`Product.maxDiscountPercent`, see `sales-crm-build` history) are enforced
server-side; a Seller without create/update rights on these objects simply
gets a rejected mutation surfaced through the same error banner, exactly
like `AdminView` already does for its own permission-gated data.

## Testing / verification

No automated frontend test suite exists for this app (Vite SPA, npm-managed
outside the yarn workspace) — every prior feature here was verified by
manual E2E against local dev plus API read-back. Same plan here: `npx tsc
--noEmit` clean, then in the running dev server create a test Product, a
Package under it, a Pricing Version with a small tier schedule, and a
Discount Rule, editing each once, confirming the list views reflect it and
that the backend's own validation (e.g. rejecting an inactive Pricing
Version, wrong-product Discount Rule) still works unaffected since none of
that validation logic is touched by this frontend-only change.

## Backward compatibility

Purely additive: one new API file, four new view files/routes, one new nav
item. Nothing in `LeadPanels.tsx`, the existing add-product-to-lead flow, or
any backend service is modified.
