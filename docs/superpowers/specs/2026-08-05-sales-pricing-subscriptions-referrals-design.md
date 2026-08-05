# Sales pricing, subscriptions and referrals — design

Date: 2026-08-05
Branch: `feat/sales-pricing-subscriptions-referrals`

Six changes to the sales CRM and the mobile sales app
(`packages/twenty-sales-app`, served at `crm.hamagan.com/sales/`). They are
grouped because five of the six describe the same gap from different angles:
the CRM records what a lead *is* today, but not how it got there — what was
offered before the price was agreed, who else deserves credit for it, and what
the customer keeps paying after the deal closes.

Model vocabulary, unchanged from Phase 1: **opportunity** is a lead,
**partner** is a referrer/marketer, **dealProduct** is one product line on a
lead.

## 1. Per-metric discounts

### Problem

A metric on a PER_FACTOR product carries one `unitPrice`. The business
routinely grants a standing concession on a single metric — "the doctor rate
is always 10% off" — and today the only way to record that is to bake it into
`unitPrice`, which destroys the list rate. Nothing then shows the customer
what they were given, and reports cannot separate list revenue from
concessions.

This is distinct from the two discount mechanisms that already exist:

- **Discount rules** (`discountRule`) are conditional — they fire when a
  quantity threshold or a sibling purchase is met.
- **Line price overrides** (`dealProduct.priceOverrides`) are what one seller
  restated during one negotiation.

A per-metric discount is neither: it is unconditional and catalog-level.

### Design

`Product.pricingFactors` rows gain two optional keys, alongside the existing
`name` / `unitPrice` / `billingFrequency`:

```json
{ "name": "doctor", "unitPrice": 400, "billingFrequency": "MONTHLY",
  "discountType": "PERCENTAGE", "discountValue": 10 }
```

`discountType` reuses the existing `PERCENTAGE` / `FIXED_AMOUNT` vocabulary of
discount rules rather than inventing a second spelling. Both keys are optional
and absent on every row saved before this change — a row with neither, with a
type but no value, or with a value of zero or less, is priced exactly as
before. That is what makes this change backward compatible without a data
migration.

**No provisioning is required for this feature.** `pricingFactors` is already
a `RAW_JSON` field, so the new keys need no metadata change.

Server (`utils/pricing-tier-schedule.util.ts`):

- `FactorDiscount` / `DiscountType` types, and `productFactorDiscount(factor)`
  which reads the two keys and returns a discount only when it is real.
- `applyFactorDiscount(subtotal, discount)` — clamped to `[0, subtotal]`, so a
  discount can never turn a charge into a credit and a percentage entered past
  100 is treated as the data-entry slip it is rather than an instruction to
  pay the customer.
- `productFactorToTierSchedule` carries the discount onto the generated
  schedule, so a product metric keeps its discount when it is merged into a
  package's tier schedule.
- `FactorBreakdownEntry` gains `grossSubtotal` and `discountAmount` next to
  the existing (now net) `subtotal`, so a quote can show list, concession and
  charge as three numbers.

The discount applies to the metric's band subtotal **before** the cadence
buckets, so a discounted annual metric discounts the annual total and nothing
else. No cadence is ever converted into another.

`product-fixed-plus-metrics-price.util.ts` drops its inline schedule builder
and calls `productFactorToTierSchedule`, which is what makes product metrics
pick up discounts at all.

Client mirror in `lib/productPricing.ts` (`metricDiscountAmount`) so the
seller sees the same number before saving that the server computes after.
`ProductMetricsEditor` gains a discount type select (defaulting to "no
discount") and a value input that appears only once a type is chosen; clearing
the type clears the value, so a stale amount can never resurface.

## 2. Offer history and agreed price

### Problem

A lead carries a single `amount`. Negotiation overwrites it. When a deal is
signed nobody can answer what was first quoted, how far the price moved, or
who moved it — the information sellers most need when negotiating the *next*
deal with a similar customer, and the information management needs to see
whether discounting is disciplined.

### Design

A new object rather than a JSON blob: offers are rows people want to sort,
filter and report on, and they accumulate without bound.

**`leadOffer`** — one offer made on one lead:

| field | type | meaning |
| --- | --- | --- |
| `opportunity` | relation → opportunity | the lead |
| `offeredAt` | `DATE_TIME` | when it was put to the customer |
| `amount` | `CURRENCY` | what was offered |
| `offerStatus` | `SELECT` | `PROPOSED` / `ACCEPTED` / `REJECTED` / `SUPERSEDED` |
| `offeredBy` | relation → workspaceMember | who made it |
| `note` | `TEXT` | why this number |

On **`opportunity`**:

| field | type | meaning |
| --- | --- | --- |
| `agreedPrice` | `CURRENCY` | the number both sides settled on |
| `agreedAt` | `DATE_TIME` | when it was settled |

`agreedPrice` is stored rather than derived from "the accepted offer" because
a deal is sometimes agreed verbally without a matching offer row, and because
reports must not have to walk a relation to answer the most common question
about a lead. Accepting an offer in the UI writes both: it sets that offer to
`ACCEPTED`, every other `PROPOSED` offer on the lead to `SUPERSEDED`, and
copies the amount to `agreedPrice`/`agreedAt`.

## 3. Multiple referrers

### Problem

`opportunity.referrer` is a single relation to `partner`. Real deals arrive
through more than one person — a marketer who found it and a partner who
introduced the decision-maker — and each is owed a different commission share.
Today the second one is uncredited.

### Design

Twenty has no many-to-many, and a bare many-to-many would not carry the
per-referrer commission this feature exists for. So: a join object.

**`leadReferrer`**:

| field | type | meaning |
| --- | --- | --- |
| `opportunity` | relation → opportunity | the lead |
| `partner` | relation → partner | the referrer |
| `commissionPercent` | `NUMBER` | this referrer's share of this deal |
| `referrerRole` | `SELECT` | `FINDER` / `INTRODUCER` / `CLOSER` / `OTHER` |
| `note` | `TEXT` | what they actually did |

`commissionPercent` lives on the join row, not on the partner: the partner's
own `commissionPercent` is their default rate, and what they are owed on a
*particular* deal is negotiated per deal.

The existing `opportunity.referrer` field is **kept and keeps working**. It is
the primary referrer, it is what the CRM's own table views and the existing
reports read, and removing it would silently break both. Registering a lead
still sets it. The join rows are additive credit on top.

## 4. Subscriptions and lead conversion

### Problem

The CRM stops at the won deal. What the customer is actually paying for now —
which products, from when, until when, renewing or not — lives outside the
system, so nobody can see whose renewal is due or what recurring revenue
exists.

### Design

**`subscription`**:

| field | type | meaning |
| --- | --- | --- |
| `company` | relation → company | the customer |
| `opportunity` | relation → opportunity | the lead it was converted from |
| `product` | relation → product | what they subscribe to |
| `startDate` | `DATE_TIME` | |
| `endDate` | `DATE_TIME` | when the current term expires |
| `subscriptionStatus` | `SELECT` | `PENDING` / `ACTIVE` / `EXPIRED` / `CANCELLED` |
| `billingPeriod` | `SELECT` | `MONTHLY` / `ANNUAL` |
| `recurringAmount` | `CURRENCY` | charged each period |
| `autoRenew` | `BOOLEAN` | |
| `note` | `TEXT` | |

Both `company` and `opportunity` are kept: the company is who pays and
survives the lead, the opportunity is the audit trail of where the
subscription came from. A subscription created by hand for an existing
customer simply has no opportunity.

**Conversion** turns a won lead into subscriptions: for a lead in a won stage,
the app offers one draft subscription per `dealProduct` line, pre-filled from
that line (product, recurring amount from the line's annual price, billing
period, start date today), which the seller edits before saving. It is
deliberately a reviewed action rather than an automatic trigger on stage
change — the annual price on a line is not always the recurring price, and a
wrong subscription is worse than a missing one.

## 5. Admin: lead owner and lead age

### Problem

Two gaps. Leads stay assigned to sellers who have left or been reassigned, and
there is no way to move them. And nothing surfaces a lead going stale: a lead
sitting in one stage for two months looks the same as one that moved
yesterday.

### Design

**Owner reassignment** needs no new field — `opportunity.owner` already
exists. It needs the admin UI (in `AdminView`) to pick a lead and set a new
owner, restricted to admins by the existing role check.

**Lead age** is two different numbers, and the useful one is not the one
already available:

- *Total age* — `now - createdAt`. Already derivable; no field needed.
- *Age in current stage* — the number that identifies a stalling lead, and not
  derivable today because nothing records when the stage last moved.

So one new field on `opportunity`:

| field | type | meaning |
| --- | --- | --- |
| `stageChangedAt` | `DATE_TIME` | when the stage last changed |

Written by the app whenever it changes a stage. Rows that predate this field
have it null, and the UI falls back to `createdAt` for those — an
over-estimate of stage age, but never a wrong "moved recently" claim. Both
ages render as a badge on the lead list and detail, turning amber past 14 days
in stage and red past 30.

## Provisioning

`tools/sales-crm/provision-subscriptions-referrals-offers.mjs` creates the
three new objects, their fields and their relations, following the existing
script conventions: idempotent (skips anything that exists, safe to re-run),
`TWENTY_TOKEN` API-key auth preferred over a password login against
production.

```bash
TWENTY_META=https://crm.hamagan.com/metadata \
TWENTY_ORIGIN=https://crm.hamagan.com \
TWENTY_TOKEN=... node tools/sales-crm/provision-subscriptions-referrals-offers.mjs
```

Feature 1 needs no provisioning. The app degrades gracefully until the script
runs: each new section detects the unknown field or object and hides itself,
so deploying the UI before provisioning breaks nothing.
