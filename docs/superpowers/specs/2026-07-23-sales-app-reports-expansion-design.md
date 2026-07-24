# Sales App — Comprehensive Reports Expansion — Design

Date: 2026-07-23
Status: Draft, awaiting user review
Branch: `worktree-feature+sales-reports-expansion` (isolated worktree)

## Goal

Expand the Sales App Reports page (`packages/twenty-sales-app/src/views/ReportsView.tsx`)
from its current single scroll of lead-funnel cards into a comprehensive,
multi-section reporting surface covering **sellers, marketers, products, and
activity**, plus a proper conversion/win-loss view. Keeps the existing
me/team scope and week/month/quarter period controls.

## Current state (baseline)

Reports today has: 4 KPIs (leads registered, tasks done, active customers,
open pipeline value), a registrations trend bar chart, breakdowns by
stage/source/temperature/marketer, and a seller leaderboard (team scope only).
`ReportsView.tsx` is already 406 lines — over the 300-line convention — so new
work must extract, not inline.

## Approach (approved)

Introduce a **sub-tab bar inside Reports**: `Overview · Sellers · Marketers ·
Products · Activity`. `ReportsView.tsx` becomes a thin shell that owns the
period/scope/tab state and renders one section component per tab. Each section
component owns its own data fetch (lazy, keyed by tab+scope+period via
`useCached`) so switching tabs doesn't over-fetch, and each stays well under
the file-size convention.

Shared chart primitives (`Bars`, `BreakdownRows`) move out of `ReportsView`
into `components/reports/ReportPrimitives.tsx` so every section reuses them.

### File layout

```
components/reports/
  ReportPrimitives.tsx     // Bars, BreakdownRows, extracted from ReportsView
  OverviewReport.tsx       // KPIs + trend + stage/source/temp + funnel/win-loss
  ConversionFunnel.tsx     // stage funnel + win rate + won/lost + source conversion
  MarketerLeaderboard.tsx  // NEW section
  ProductPerformance.tsx   // NEW section
  ActivityReport.tsx       // NEW section
components/SellerLeaderboard.tsx   // exists, reused as the Sellers tab body
views/ReportsView.tsx      // slimmed to shell: toolbar + tab bar + <section switch>
```

## Sections

### 1. Overview (default tab)

Existing cards (KPIs, registrations trend, byStage, bySource, byTemperature,
byMarketer) **plus** a new **Conversion funnel + win/loss** block:

- **Funnel**: leads counted at each pipeline stage in order (`STAGES`),
  rendered as descending `BreakdownRows`, so drop-off between stages is visible.
- **Win rate**: won (`ACTIVE_CUSTOMER`) ÷ closed (won + `LOST_MISSED`), shown as
  a headline percent with won/lost counts.
- **Source conversion**: per `leadSource`, won ÷ registered as a rate (not just
  the raw counts already shown in `bySource`), so we can see which channels
  actually convert.

All computed client-side from the already-fetched lead set — no new query.

### 2. Sellers tab

The existing `SellerLeaderboard` (leads registered, won, win rate, open
pipeline value, tasks done), moved to its own tab. Team scope only; in `me`
scope this tab shows the current seller's own single row. No data-model change.

### 3. Marketers tab (NEW)

A **marketer leaderboard** grouped by the `marketer` field
(Alavi/Shabab/Noorzai), team scope. Per marketer, in the selected period:
leads brought, won, conversion %, open pipeline value. Same table style as the
seller leaderboard. Data via the existing `fetchLeadsMarketers(leadIds)` map
joined to the period lead set. Because `marketer` is a production-only ad-hoc
field (per `fetchLeadMarketer`'s try/catch precedent), the whole tab degrades
gracefully to an empty state when the field is absent (local dev). Retains the
existing simple `byMarketer` count breakdown below the leaderboard.

### 4. Products tab (NEW)

Analytics over `dealProduct` rows created in the period. Needs one new API:

```ts
// api/records.ts
export type DealProductStat = {
  id: string;
  name: string;
  quantity: number | null;
  discountPercent: number | null;
  installPrice: { amountMicros: number | null } | null;
  annualPrice: { amountMicros: number | null } | null;
  product: { id: string; name: string } | null;
  createdAt: string;
};
fetchDealProductsSince(sinceIso: string): Promise<DealProductStat[]>
```

Query: `dealProducts(filter: { createdAt: { gte } }, first: 200,
orderBy createdAt Desc)`. Wrapped in try/catch → `[]` (same defensive
precedent as `fetchLeadPricing`), so the tab no-ops where the object isn't
provisioned.

Rendered as:
- **Top products by units** — `BreakdownRows` of summed `quantity` per product.
- **Top products by revenue** — summed (`installPrice` + `annualPrice`) per
  product, formatted with `formatAfn`.
- **KPIs**: total deal-lines in period, total install revenue, total annual
  (recurring) revenue, average discount %.

Grouping is by `product.id` (falling back to the line `name` when `product` is
null), client-side.

### 5. Activity tab (NEW)

Team + per-seller **task activity by type** (call/meeting/demo/visit/other).
Requires extending the existing done-tasks query to carry `taskType`:

- `DoneTask` gains `taskType: TaskType | null`.
- `fetchDoneTasksSince` selects `taskType` (additive; existing callers
  unaffected).

Rendered as:
- **Activity mix** — `BreakdownRows` of done tasks grouped by `taskType`.
- **Per-seller activity** (team scope) — a small table: seller × total done,
  with a per-type breakdown column set (calls/meetings/demos/visits). In `me`
  scope, just the current seller's mix.

## Strings / i18n

All new labels added to `lib/strings.ts` `T2` in Dari, following the existing
style (section titles, tab labels, table headers, product/activity terms,
`TASK_TYPE_LABELS`). No English fallback UI — this app is Dari-only like the
rest of the sales app.

## Scope decisions

- **No new backend objects.** Products reuses the existing `dealProduct`
  object; activity reuses `task.taskType`; marketer reuses the existing field.
  Nothing needs a provisioning script or migration — unlike the daily-report
  work, this is read-only analytics over data that already exists.
- **Referrer/partner commission report is out of scope** for this pass (kept
  out per the prior reports spec; can be a follow-up now that `referrer` is on
  `LeadSummary`).
- **Per-tab lazy fetch**, not one mega-query, so the page stays responsive and
  each section fails independently.
- **`fetchLeads` limit stays 300**; funnel/leaderboards operate on that set,
  consistent with the current view. If real data outgrows 300 in a period,
  raising the limit / server-side aggregation is a separate follow-up.

## Testing

- Unit tests (Vitest, matching `calendarGrid.test.ts` / `jalali.test.ts`):
  - product grouping/aggregation (units, revenue, avg discount) in
    `ProductPerformance` logic (extract pure helpers).
  - marketer leaderboard grouping + conversion math.
  - funnel/win-rate/source-conversion computation.
  - activity grouping by task type.
- Extract the aggregation logic into pure functions so it's testable without
  rendering, then thin components call them.
- Manual verification against local dev: Overview/Sellers/Activity render with
  local data; Marketers/Products degrade to empty states where the
  field/object is absent locally, and are confirmed to render once shipped to
  production (`crm.hamagan.com`) where `marketer` and `dealProduct` data exist.

## Deploy

Same gated pattern as prior sales-app work: verify locally (build + typecheck +
unit tests + manual smoke of the tabs that have local data), then **deploy
gated on Rashid's approval**. No DB provisioning step this time — pure
frontend/read-only, so shipping is just building and publishing the sales-app
bundle.

## Integration / cleanup

Work happens in the `feature/sales-reports-expansion` worktree to stay isolated
from the other agent on this repo. On completion: run lint/typecheck/tests,
commit, then merge back to `main` and remove the worktree.
