# Competitor Intelligence — Design

Date: 2026-07-06
Status: Approved, ready for implementation plan

## Goal

Give the sales team a structured place to record competitors, their products,
pricing, demos, strengths/weaknesses, a running feed of updates about each
competitor, and which of our own leads currently use a competitor's product.
The data model is designed so that a later AI phase can read it to draft pitches,
battlecards, and objection-handling scripts. This build delivers the data model,
relations, and daily-use views only — the AI generator is deferred.

## Approach

Follow the established sales-crm pattern: an idempotent provisioning script that
creates custom objects, fields, and relations through the metadata GraphQL API,
mirroring `tools/sales-crm/provision-whatsapp.mjs`. Views are provisioned via the
metadata API following `tools/sales-crm/provision-views.mjs`. The provisioning
script is itself the production deploy vehicle — run against prod with
`TWENTY_META` / `TWENTY_ORIGIN` / `TWENTY_EMAIL` / `TWENTY_PASSWORD` env vars; it
is idempotent (skips objects/fields/relations that already exist). Documented in
`tools/sales-crm/DEPLOY-TO-PRODUCTION.md`.

No changes to `twenty-server` entity code and therefore no instance/upgrade
command are required — these are runtime custom objects created via the metadata
API, consistent with how the WhatsApp Message, Contact Request, Pricing, and
Discount Rule objects were provisioned in this fork.

## Objects

### 1. Competitor

The company we compete with.

| Field | Type | Notes |
|---|---|---|
| name | TEXT | label / identifier field |
| website | LINKS | fall back to TEXT if the metadata API rejects LINKS |
| description | TEXT | |
| tier | SELECT | Leader / Challenger / Niche / Emerging |
| threatLevel | SELECT | High / Medium / Low |
| status | SELECT | Actively Tracking / Watching / Dormant |
| strengths | TEXT | overall, multiline |
| weaknesses | TEXT | overall, multiline |

Relations: one-to-many → Competitor Product, Competitor Update, Competitor Usage
(created as MANY_TO_ONE fields on the child objects; see below).

### 2. Competitor Product

A specific product/offering. A competitor can have several.

| Field | Type | Notes |
|---|---|---|
| name | TEXT | label |
| competitor | RELATION | MANY_TO_ONE → Competitor |
| category | SELECT | editable option list |
| description | TEXT | |
| demoUrl | LINKS | link to the competitor's demo (fallback TEXT) |
| pricingModel | SELECT | Subscription / One-time / Usage-based / Freemium / Custom |
| startingPrice | CURRENCY | |
| pricingSummary | TEXT | tiers / details as free text |
| strengths | TEXT | per-product |
| weaknesses | TEXT | per-product |

### 3. Competitor Update

Dated feed of news / changes per competitor.

| Field | Type | Notes |
|---|---|---|
| title | TEXT | label |
| competitor | RELATION | MANY_TO_ONE → Competitor |
| product | RELATION | MANY_TO_ONE → Competitor Product (optional) |
| type | SELECT | Product Update / Pricing Change / News / Win / Loss / Funding |
| date | DATE_TIME | |
| body | TEXT | |
| source | LINKS | article / post link (fallback TEXT) |

### 4. Competitor Usage

Links one of our leads (a Person and/or an Opportunity) to a competitor product.

| Field | Type | Notes |
|---|---|---|
| name | TEXT | label — short descriptor |
| person | RELATION | MANY_TO_ONE → Person (optional) |
| opportunity | RELATION | MANY_TO_ONE → Opportunity (optional) |
| competitor | RELATION | MANY_TO_ONE → Competitor |
| product | RELATION | MANY_TO_ONE → Competitor Product |
| status | SELECT | Current User / Evaluating / Former User |
| satisfaction | SELECT | Happy / Neutral / Unhappy |
| switchingSignal | SELECT | None / Interested / Actively Looking / Committed |
| renewalDate | DATE_TIME | contract renewal date — a sales trigger |
| notes | TEXT | |

## Views

Provisioned via the metadata API (`provision-views.mjs` pattern):

- **Competitors** — table sorted by threatLevel; Kanban grouped by status.
- **Competitor Products** — table.
- **Competitor Updates** — table sorted by date descending (the "what's new" feed).
- **Competitor Usage** — table; plus a filtered view **"Switching signals"**
  (`switchingSignal ≠ None`) — the actionable list for the sales team.

## Deliverables

1. `tools/sales-crm/provision-competitor-intel.mjs` — idempotent creation of the 4
   objects, their fields, and relations. Structured like provision-whatsapp.mjs
   (OBJECTS / FIELDS / RELATIONS arrays, per-item skip-if-exists, summary + non-zero
   exit on failure). Includes the network-retry `gql` wrapper from provision-views.mjs.
2. View provisioning for the 4 views above (either appended to the same script or a
   sibling `provision-competitor-views.mjs`, decided in the plan).
3. `tools/sales-crm/DEPLOY-TO-PRODUCTION.md` updated with the run step for prod.
4. `tools/sales-crm/README.md` updated to list the new script.

## Deferred (Phase 2 — not in this build)

AI pitch / script generator: a record action on Competitor that gathers the
competitor + its products + recent updates + our own product data and drafts a
battlecard / objection-handling script. The schema above is intentionally shaped to
feed it (structured strengths/weaknesses, per-product pricing, dated update feed,
lead-usage signals).

## Open points

- **LINKS vs TEXT** for website/demoUrl/source: prefer LINKS (richer UI); fall back
  to TEXT at implementation time if the metadata API in this version rejects it.
  Confirm empirically during provisioning against the local instance.
- **Competitor Usage label**: junction objects need a scalar label field; using a
  free-text `name`. Acceptable; users can leave a short note. Revisit only if it
  proves awkward in daily use.
