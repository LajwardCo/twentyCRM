# Discount & Bundle Rules — Design Spec

Date: 2026-07-04
Status: Approved for implementation (second of the six-part decomposition — see
[Pricing & Package Model spec](2026-07-03-pricing-package-model-design.md) for
the full breakdown and where this fits).
Environment: build on branch `feature/discount-bundle-rules` (off `main`,
which already has Phases 1-4 + the Package/Pricing Version model live on
production).

## Where this fits

Depends on the Package/Pricing Version model (already live). This spec covers
subsystem #2 of six: **Discount & Bundle Rules**. Still deferred after this:
Contract entity, Payment model, Lead Overview tab, Opportunity→Lead rename.

## Goal, from the original ask

> we set specific scenarios for the discount so the seller can only select
> from those and if that does not match the rule, does not allow using it...
> for the discount we can have rules and even bundles, like if user purchases
> 10 opd, we get this amount or percentage discount, or if purchases opd will
> have the prescription too

Today, `DealProduct.discountPercent` is a free-typed number, only checked
against a ceiling (`Product.maxDiscountPercent`) after the fact. This spec
replaces "type any number under the ceiling" with "pick one of a curated list
of pre-approved discount scenarios" — a seller can no longer invent a
discount; they select a **Discount Rule**, and the system rejects the
selection outright if its condition isn't actually met.

## Key modeling decision: bundles are a special case of discount rules, not a separate concept

A "bundle" ("buy OPD, get Prescription free") and a "volume discount" ("10+
OPD units, 15% off") are the same shape: **a rule with a condition, offered on
a specific Product, that grants a discount when the condition holds.** The
only difference is what the condition checks:

- Volume discount: condition = "this line's own quantity is at least N."
- Bundle: condition = "a sibling Deal Product for a specific OTHER Product
  already exists on this same Lead."

Modeling both as one `DiscountRule` object with a `conditionType` avoids
inventing a second, redundant "Bundle" object — a bundle is just a Discount
Rule on Product B whose condition happens to reference Product A, typically
with a generous (e.g. 100%) discount value.

## New object: Discount Rule

| Field | Type | Notes |
|---|---|---|
| `name` | TEXT | e.g. "10% off 10+ OPD units", "Free Prescription with OPD" |
| `status` | SELECT | `ACTIVE` / `ARCHIVED` — same deactivate-not-delete convention as Package; old rules stay visible on historical Deal Products but can't be newly selected |
| `appliesToProduct` | RELATION → Product | which Product this rule can be selected on — a rule for OPD can't be picked on a Pharmacy line |
| `conditionType` | SELECT | `ALWAYS` / `MIN_QUANTITY` / `SIBLING_PRODUCT_PURCHASED` |
| `conditionMinQuantity` | NUMBER, nullable | used when `conditionType = MIN_QUANTITY` |
| `conditionSiblingProduct` | RELATION → Product, nullable | used when `conditionType = SIBLING_PRODUCT_PURCHASED` — the OTHER product that must already be on the same Lead |
| `discountType` | SELECT | `PERCENTAGE` / `FIXED_AMOUNT` |
| `discountPercentValue` | NUMBER, nullable | used when `discountType = PERCENTAGE` |
| `discountFixedAmount` | CURRENCY, nullable | used when `discountType = FIXED_AMOUNT` |
| `notes` | TEXT | free text |

Exactly one of `conditionMinQuantity` / `conditionSiblingProduct` is set,
matching `conditionType`; exactly one of `discountPercentValue` /
`discountFixedAmount` is set, matching `discountType`. Not enforced at the
metadata layer (Twenty has no cross-field constraints) — enforced by the
validation service below, same as how `pricingVersion` validation already
works for the Package model.

## Deal Product — extended (existing object)

One new field, nullable, fully additive:

| Field | Type | Notes |
|---|---|---|
| `discountRule` | RELATION → Discount Rule | which rule this line's discount comes from; null means the existing free-typed `discountPercent` path (unchanged, for backward compatibility with any line not using a curated rule) |

## Validation: "if that does not match the rule, does not allow using it"

When `discountRule` is set on a Deal Product create/update, reject unless ALL
of:

1. The rule's `status` is `ACTIVE`.
2. The rule's `appliesToProduct` matches the Deal Product's own `product`.
3. The condition holds:
   - `ALWAYS` — always passes.
   - `MIN_QUANTITY` — the Deal Product's plain `quantity` field (the same
     field that's existed since Phase 1, independent of which pricing path —
     Pricing Version, legacy `PER_FACTOR`, or `FLAT` — is used) is
     `>= conditionMinQuantity`. Deliberately not `factorQuantities` (e.g.
     doctor/employee counts) — "buy 10 units" is about how many of this
     Product line, not any one pricing factor within it.
   - `SIBLING_PRODUCT_PURCHASED` — at least one other (non-deleted) Deal
     Product exists on the SAME Lead (Opportunity) whose `product` is
     `conditionSiblingProduct`.

Each failure gets a distinct, clear `CommonQueryRunnerException` (technical +
`userFriendlyMessage`), matching the existing `DealProductPricingVersionValidationService`
pattern.

## Applying the discount

When a Deal Product's `discountRule` passes validation:

- `discountType = PERCENTAGE` — set `discountPercent = discountPercentValue`.
  This value is then run through the EXISTING
  `DealProductDiscountValidationService.validate()` unchanged — the
  `maxDiscountPercent` ceiling still applies as a defense-in-depth check even
  though rules are curated (an admin could misconfigure a rule above the
  ceiling; the existing check still catches it).
- `discountType = FIXED_AMOUNT` — subtract `discountFixedAmount` from the
  line's computed `installPrice` (floor at 0, never negative), independent of
  `discountPercent`. This runs AFTER whichever price-calculation path
  (Pricing Version or legacy `PER_FACTOR`/`FLAT`) already set `installPrice`
  for this create/update.

## Backward compatibility

Fully additive. One new object, one new nullable field on Deal Product.
Every Deal Product not using `discountRule` keeps using the existing
free-typed `discountPercent` + ceiling-check path exactly as today — nothing
migrated, nothing removed.

## Provisioning

New idempotent script `tools/sales-crm/provision-discount-bundle-rules.mjs`,
following the exact pattern of `provision-pricing-package-model.mjs`.

## Testing

- Unit tests for the condition-evaluation logic (mirrors
  `pricing-tier-schedule.util.ts`'s pure-function pattern): a pure function
  taking `{conditionType, conditionMinQuantity, conditionSiblingProduct}` +
  the relevant facts (this line's `quantity`, sibling product IDs) and returning
  pass/fail, unit tested exhaustively (no DB, no NestJS DI).
- Live functional verification (once deployed): create an `ALWAYS` rule, a
  `MIN_QUANTITY` rule (verify both a passing and a failing quantity), and a
  `SIBLING_PRODUCT_PURCHASED` rule (verify both with and without the sibling
  line present), for both `PERCENTAGE` and `FIXED_AMOUNT` discount types.

## Open assumptions to revisit (flagged, not blocking)

1. `SIBLING_PRODUCT_PURCHASED` only checks for EXISTENCE of a sibling line,
   not its quantity/status (e.g. a `QUOTED` vs `PAID` sibling both count).
   Revisit if "the bundle should only kick in once the OPD line is actually
   paid" turns out to matter — not stated in the original ask, so not built.
2. Only one `discountRule` per Deal Product line (no stacking multiple
   rules). If "10+ units AND bundle" needs to combine, that's new scope.
3. Bundling doesn't auto-create the companion Deal Product line — a seller
   still manually adds the second line (e.g. Prescription) and then selects
   the rule on it. Auto-creating a sibling record as a side effect of
   selecting a discount rule was considered and deliberately scoped out —
   it's a bigger, riskier change (a rule that writes new records, not just
   validates/computes) for a benefit not explicitly requested.
