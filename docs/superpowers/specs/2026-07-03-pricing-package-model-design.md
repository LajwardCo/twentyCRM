# Pricing & Package Model — Design Spec

Date: 2026-07-03
Status: Approved for implementation (first of a 6-part decomposition of the
broader pricing/contracts/payments request — see "Where this fits" below).
Environment: build in local fork first (`/Users/rashid/Development/twentyCRM`),
same pattern as the original [Sales CRM design](2026-07-01-twenty-sales-crm-design.md).

## Where this fits

The original ask (products, pricing factors, packages, discounts/bundles,
contracts, subscriptions tied to contracts, payments, lead-level profit
overview, activity log, soft delete) is six independent subsystems. This spec
covers only the first and most foundational one — everything else reads
prices from what's built here:

1. **→ this spec: Pricing & Package model**
2. Discount & bundle rules (depends on 1)
3. Contract entity + Quotation → Contract → Subscription rewire
4. Payment model
5. Lead Overview tab (profit calc, permission-gated)
6. Terminology: Opportunity → "Lead" rename throughout

Two items from the original ask are **not separate subsystems** — Twenty
already provides them for every object, custom or standard, with no extra
work: a per-record **activity timeline** (auto-attached to all custom
objects) and **soft delete** (default for all record deletes). Confirm both
still hold once Package/Pricing Version exist, but no design work needed.

## Goal

Replace the current flat, non-versioned `Product.pricingFactors` rate table
with a proper **Package** (a named, sellable pricing plan for one Product)
and **Pricing Version** (a versioned, banded rate table under that package)
model — so:

- Sellers pick a Package instead of hand-entering rates (matches how this
  business actually sells: "we usually don't let users select the prices...
  we give them packages").
- Volume/banded pricing is expressible (e.g. 1-4 doctors flat, 5-9 doctors
  at a per-doctor rate, 10-20 at a lower per-doctor rate, 21+ at a lower
  rate still) — today's model only supports one flat unit rate per factor.
- Old pricing is **deactivated, never deleted**, and every Deal Product line
  freezes a full snapshot of the exact rate table it was priced against, so
  editing a Package later can never rewrite historical prices.

## Current state (for reference)

`Product.pricingModel` (`FLAT`/`PER_FACTOR`) + `Product.pricingFactors`
(JSON: `[{name, unitPrice}]`) + `DealProduct.factorQuantities` (JSON:
`{name: qty}`), auto-multiplied and summed by
`DealProductPriceCalculationService`. One flat rate per factor, no tiers, no
history. Full detail: [`docs/sales-crm/PROJECT-STATUS.md`](../../sales-crm/PROJECT-STATUS.md).

**This is kept, unchanged, as the "custom / no package" pricing path** — see
Backward Compatibility below. Nothing about it is removed or migrated.

## New objects

### Package (custom object)

A named, sellable pricing plan scoped to exactly one Product (e.g. "OPD
Package" under the OPD Product). Cross-product bundles (e.g. "OPD +
Prescription") are explicitly out of scope here — that's bundle/discount
territory (subsystem #2), not packaging.

| Field | Type | Notes |
|---|---|---|
| `name` | TEXT | e.g. "OPD Package" |
| `product` | RELATION → Product | one Product has many Packages |
| `status` | SELECT | `ACTIVE` / `ARCHIVED` |
| `allowsCustomPricing` | BOOLEAN | if true, a seller may still hand-enter `factorQuantities` for factors outside this package's tier schedule on a given Deal Product line (escape hatch for negotiated deals); the discount ceiling still applies regardless |
| `notes` | TEXT | free text |

### Pricing Version (custom object)

A single versioned, banded rate table under a Package. This is the entity
that actually gets deactivated-not-deleted.

| Field | Type | Notes |
|---|---|---|
| `package` | RELATION → Package | |
| `versionNumber` | NUMBER | auto-incrementing per package, set by the create hook |
| `isActive` | BOOLEAN | exactly one active version per package at a time (enforced — see below) |
| `effectiveFrom` | DATE_TIME | |
| `deactivatedAt` | DATE_TIME | nullable; stamped automatically when superseded |
| `currencyCode` | TEXT | ISO code all `tierSchedule` amounts are denominated in (they're plain numbers, not currency composites — same reason `Product.pricingFactors.unitPrice` is a plain number today); falls back to the Product's `baseInstallPrice.currencyCode` if unset, same as the existing legacy calculation |
| `tierSchedule` | RAW_JSON | see format below |

**`tierSchedule` format** — an array, one entry per pricing factor, each with
its own billing frequency and ordered bands:

```json
[
  {
    "factor": "doctor",
    "billingFrequency": "MONTHLY",
    "bands": [
      { "minQty": 1,  "maxQty": 4,    "mode": "FLAT",     "amount": 2000 },
      { "minQty": 5,  "maxQty": 9,    "mode": "PER_UNIT",  "amount": 400 },
      { "minQty": 10, "maxQty": 20,   "mode": "PER_UNIT",  "amount": 300 },
      { "minQty": 21, "maxQty": null, "mode": "PER_UNIT",  "amount": 250 }
    ]
  },
  {
    "factor": "employee",
    "billingFrequency": "ANNUAL",
    "bands": [
      { "minQty": 1,   "maxQty": 99,   "mode": "PER_UNIT", "amount": 0.90 },
      { "minQty": 100, "maxQty": 199,  "mode": "PER_UNIT", "amount": 0.70 },
      { "minQty": 200, "maxQty": 299,  "mode": "PER_UNIT", "amount": 0.60 },
      { "minQty": 300, "maxQty": null, "mode": "PER_UNIT", "amount": 0.50 }
    ]
  }
]
```

`maxQty: null` means unbounded (the top band).

## Tiering model: volume/threshold, not graduated

**Assumption, flagged for review**: bands are **volume/threshold** pricing —
the customer's total quantity for a factor picks ONE band, and that band's
rate applies to the *entire* quantity. This is not graduated/marginal
bracket pricing (like income tax brackets, where each unit is priced at its
own bracket's rate). Read directly from the numbers given: "5-9 doctors: 400
AFN **per doctor**" describes one flat per-doctor rate for the whole
9-doctor case, not "4 doctors at the 1-4 rate + 1-5 more doctors at 400."

Two band `mode`s:
- **`FLAT`** — the band's `amount` is the total charge for the whole factor,
  regardless of quantity within the band (the 1-4 doctor case: 2000 AFN flat
  whether it's 1 doctor or 4).
- **`PER_UNIT`** — `amount × quantity` is the charge (the 5+ doctor case, and
  all employee bands).

**Assumption, flagged for review**: the employee bracket "300 and more
employees 0.50 per employee **per month**" is treated as a typo for **per
year** — every other employee band in the same example is annual, and the
per-unit rate keeps decreasing with volume (0.90 → 0.70 → 0.60 → 0.50); a
sudden switch to monthly billing at the top band would be a ~12x price
*increase* at the highest volume tier, which contradicts the whole point of
volume pricing. `billingFrequency` is stored per-factor precisely so this is
a one-field data fix later, not a design change, if this reading is wrong.

## Deal Product — extended (existing object)

Two new fields, both nullable, fully additive:

| Field | Type | Notes |
|---|---|---|
| `pricingVersion` | RELATION → Pricing Version | which package version this line was priced against; **null** means the legacy `product.pricingModel`-driven path (unchanged) |
| `priceSnapshot` | RAW_JSON | frozen computation — see below |

**`priceSnapshot` format**, written by the calculation service every time it
computes a price from a `pricingVersion`:

```json
{
  "packageId": "...",
  "packageName": "OPD Package",
  "pricingVersionId": "...",
  "versionNumber": 3,
  "evaluatedAt": "2026-07-03T12:00:00Z",
  "breakdown": [
    { "factor": "doctor", "quantity": 5, "matchedBand": { "minQty": 5, "maxQty": 9, "mode": "PER_UNIT", "amount": 400 }, "subtotal": 2000, "billingFrequency": "MONTHLY" },
    { "factor": "employee", "quantity": 150, "matchedBand": { "minQty": 100, "maxQty": 199, "mode": "PER_UNIT", "amount": 0.70 }, "subtotal": 105, "billingFrequency": "ANNUAL" }
  ],
  "totalMonthly": 2000,
  "totalAnnual": 105
}
```

This makes every historical Deal Product price fully reconstructible and
auditable without depending on the Package/Pricing Version rows still
existing in their original state.

## Calculation service

Extend `DealProductPriceCalculationService` (existing file:
`packages/twenty-server/src/modules/sales-crm/services/deal-product-price-calculation.service.ts`):

1. If `dealProduct.pricingVersion` is set:
   - Load the Pricing Version; reject if not found.
   - Require it to belong to a Package whose `product` matches the Deal
     Product's `product` (can't attach an OPD package's version to a
     Pharmacy line).
   - For each factor in `tierSchedule`, find the band where
     `minQty <= factorQuantities[factor] <= (maxQty ?? Infinity)`. If no
     `factorQuantities` entry exists for a factor, skip it (not charged).
   - Compute each band's subtotal per its `mode`, group by
     `billingFrequency` into `totalMonthly` / `totalAnnual`.
   - Write `installPrice = totalMonthly`, `annualPrice = totalAnnual` (as
     `{amountMicros, currencyCode}` composites, reusing the existing
     currency-fallback logic from the Product's `baseInstallPrice`), and
     write the full `priceSnapshot`.
2. Else, fall through to the existing `pricingModel === 'PER_FACTOR'` logic,
   completely unchanged.

## Validation

Extend `DealProductDiscountValidationService` (or add a sibling check in the
same pre-query hooks):

- Existing discount-ceiling check (`discountPercent <=
  product.maxDiscountPercent`) is unchanged and applies regardless of
  whether a package is used.
- **New**: if `pricingVersion` is set, it must be `isActive` at write time
  and must belong to a Package on the same `product` as the Deal Product.
  Reject with a clear error otherwise — this is the "sellers can't sell
  something else by mistake" guarantee for the package path.

## Versioning mechanics (deactivate, never delete)

A PRE-create hook on Pricing Version: when a new version is created with
`isActive: true`, it finds any other `isActive: true` version under the same
`package` and flips it to `isActive: false` + stamps `deactivatedAt`. This
is the entire "new pricing supersedes old, old pricing is kept but
deactivated" mechanism — no manual bookkeeping, no destructive writes,
matches the same PRE-hook pattern already used for discount enforcement.

## Backward compatibility

Fully additive. Two new objects, two new nullable fields on Deal Product.
Every existing Product/Deal Product using the Phase 3 flat `pricingFactors`
path keeps working exactly as today — nothing is migrated or removed. A
Product simply may or may not have Packages under it; Deal Products simply
may or may not reference a Pricing Version.

## Provisioning

New idempotent script `tools/sales-crm/provision-pricing-package-model.mjs`,
following the exact pattern of the existing `provision-phase1.mjs` /
`provision-phase2-objects.mjs` / `provision-pricing-fields.mjs`: creates the
`package` and `pricingVersion` objects, their fields, and the three new
relations (`package.product`, `pricingVersion.package`,
`dealProduct.pricingVersion`).

## Testing

- Unit tests for the tier-matching + aggregation logic in the calculation
  service (band boundaries, `FLAT` vs `PER_UNIT`, mixed billing frequencies,
  missing factor quantities, multiple factors).
- Unit tests for the validation hook (wrong product, inactive version,
  missing version).
- Reuse the same "create real records, assert computed price, clean up"
  verification pattern documented in `PROJECT-STATUS.md` for a live check
  once deployed.

## Open assumptions to revisit (flagged, not blocking)

1. Volume/threshold tiering (not graduated) — see above.
2. "300+ employees ... per month" read as a typo for "per year" — see above.
3. Package is single-Product only; cross-product bundling deferred to
   subsystem #2 (Discount & Bundle rules).
4. Quotation/Contract validation against pricing rules is enforced at the
   Deal Product layer (where price is already computed/stored), since
   Quotation/Contract don't yet carry their own line items — revisit once
   the Contract subsystem (#3) is designed, in case that changes.
