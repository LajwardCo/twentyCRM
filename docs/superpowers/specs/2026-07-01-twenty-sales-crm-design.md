# Twenty as a Sales-Management CRM — Design Spec

Date: 2026-07-01
Status: Phase 1 approved (config foundation). Phases 2–3 outlined.
Environment: build in local fork first (`/Users/rashid/Development/twentyCRM`), deploy to a server later as one reviewed step.

## Goal

Replace Excel with Twenty as a full sales-management tool for a subscription-software
sales team: lead intake from multiple channels → follow-ups → demo → negotiation →
contract → deposit/payment → training → active subscriber, with per-seller and
per-product reporting, quotation/contract/subscription lifecycles, dynamic pricing with
discount limits, referral/commission tracking, and hardened permissions.

## Guiding principle: two axes, never one field

- **Stage** = where a deal is in the process (drives the Kanban board).
- **Temperature** (Hot/Warm/Cold) = how engaged/likely the lead is — a separate field.
- **Missed/Lost** = an exit outcome captured via a terminal stage + Lost Reason, so
  "missed" leads stay filterable and recoverable for re-engagement.

## Build sequencing

1. **Phase 1 — Config foundation (no code):** objects, fields, pipeline, Products,
   Deal Products, Partners, roles, saved views/dashboards. Applied via Twenty's metadata
   GraphQL API against the local fork. Reversible.
2. **Phase 2 — Native automation (workflows):** lead auto-assignment (round-robin),
   quotation expiry alarms, subscription renewal reminders. Quotation / Contract /
   Subscription objects created here.
3. **Phase 3 — Real code (the hard 20%):** dynamic per-factor pricing engine,
   discount-floor / catalog enforcement, external API sync to provision the sold system.
   Needs capability verification (serverless functions, field-level permissions) before
   promises.

---

## Phase 1 — Data model (config only)

### Objects

| Object | Type | Role |
|---|---|---|
| Company | standard | Client org (hospital / business) — deals anchor here (B2B) |
| Person | standard | Individual contact |
| Opportunity | standard | The deal — one per client engagement; moves across the pipeline |
| Deal Product | custom | Line item — one per distinct product on a deal |
| Product | custom | Catalog + base prices + discount limits |
| Partner / Referrer | custom | Who introduced the lead, for commission tracking |

### Pipeline (Opportunity `stage`)

```
New Lead → Following Up → Demo Scheduled → Demo & Negotiation →
Contract Sent → Signed (Awaiting Payment) → Paid (Awaiting Training) →
In Training → Active Customer            ⟂ Lost / Missed
```

### Fields

**Opportunity**: stage · temperature (Hot/Warm/Cold) · leadSource (Field / WhatsApp /
Telegram / Facebook / Referral / Other) · lostReason (No Answer / Went Silent /
Not Interested / Chose Competitor / No Budget) · depositAmount (currency) ·
priceLockedUntil (date) · referrer (→ Partner) · owner (seller / workspace member) ·
expectedClose (date).

**Deal Product**: product (→ Product) · quantity (number) · installPrice (currency) ·
annualPrice (currency) · discountPercent (number) · lineStatus (Quoted / Contracted /
Paid / Delivered) · opportunity (→ parent Opportunity).

**Product**: name · baseInstallPrice (currency) · baseAnnualPrice (currency) ·
maxDiscountPercent (number) · pricingModel (Flat / Per-factor) · pricingFactorNotes
(text) · isActive (boolean).

**Partner / Referrer**: name · type (Marketer / Seller / Partner) · commissionPercent
(number) · linkedMember (→ workspace member, optional).

**Person**: preferredContactMethod (Phone / WhatsApp / Telegram / Facebook / Email /
In-person).

### Relationships

- Opportunity → Company (many-to-one)
- Opportunity → Person (point of contact)
- Opportunity → Partner (referrer, many-to-one)
- Deal Product → Opportunity (many-to-one)  ← the order/line-item pattern
- Deal Product → Product (many-to-one)

### Roles (Phase 1 baseline)

- **Seller**: read/write own Opportunities, People, Deal Products, Tasks; read-only
  Product catalog; cannot see other sellers' pipelines.
- **Team Lead**: full visibility, reassigns owners, manages Product catalog.
- **Admin**: full.

Field-level permission granularity (e.g. hide price fields from sellers) is UNVERIFIED
in this Twenty version — to confirm before promising.

### Confirmed design decisions

1. Deposit is captured as **fields** (depositAmount + priceLockedUntil), not a rigid
   stage — it can happen at different points and a linear Kanban cannot.
2. "Wanted 20, paid 1" = one Deal Product line per distinct product, each with a
   quantity + lineStatus; partial fulfillment shown via line status.
3. Deals anchor to **Company** (B2B).
4. Commission % lives on the **Partner** (fixed per introducer).

These are approved for now; revisit if reality differs (user: "later we will apply if
anything needs changes").

---

## Reporting (built on Phase 1 model)

- **My Tasks — Today**: Tasks view, Assignee = Me, Due = Today (one shared view, resolves
  per-user). Table for a checklist; Calendar for scheduled meetings.
- **Pipeline by Owner**: Opportunities grouped by owner → deals per seller by stage.
- **By Lead Source / by Product**: grouped views feeding "which channel / product converts".
- **Dashboards**: bar/line/pie/number widgets (analytics flag may need enabling — self-hosted).
- **Export**: CSV from any view (no native PDF; browser print for the end-of-day report).

---

## Phase 2 — Automation (outline)

- **Lead auto-assignment**: workflow on Person/Opportunity created → FIND_RECORDS members
  → CODE round-robin → UPDATE_RECORD owner. (No pre-built round-robin; ~10 lines JS.)
- **Quotation** object: validity date, agreed price, linked deal, status → CRON workflow
  alerts before expiry.
- **Subscription** object: start/end, renewal date, price, API link → CRON renewal
  reminders + price-increase prompts.

## Phase 3 — Real code (outline, needs verification)

- **Dynamic per-factor pricing** (OPD = per doctor + employee; accounting = per employee +
  user + inventory): no native conditional-formula fields → code-driven calculator.
- **Discount-floor / catalog enforcement** ("can't sign below floor / can't sell what we
  don't have"): no native save-blocking validation → workflow guard or custom logic.
- **External API sync**: provision the sold system via HTTP_REQUEST action or companion service.
