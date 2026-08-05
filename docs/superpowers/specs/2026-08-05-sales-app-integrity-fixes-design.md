# Sales App integrity fixes — design

Date: 2026-08-05
Branch: `feat/sales-app-integrity-fixes`

Seven reported problems in the mobile sales app (`packages/twenty-sales-app`,
served at `crm.hamagan.com/sales/`). Five have root causes confirmed in code;
two are missing features. They are grouped here because four of them share one
underlying theme: the app trades correctness for brevity when it displays or
aggregates data.

## 1. Duplicate prevention

### Problem

`registerLead` (`api/records.ts`) creates a Company, a Person and an
Opportunity unconditionally. Nothing checks whether that company already
exists. Field sellers re-register leads they visited before, and the same
company arrives from more than one seller.

Twenty has a native `findDuplicates` resolver, but
`workspace-resolver-builder.service.ts` only builds it for objects whose
metadata carries `duplicateCriteria`. Opportunity has none, and its criteria
would be exact-match anyway — useless against "شرکت نور" vs "نور ltd". So
duplicate detection is built in the app.

### Design

`lib/duplicates.ts` — pure, unit-testable:

- `normalizeName(raw)`: Persian/Arabic digits to Latin, unify `ی`/`ي` and
  `ک`/`ك`, strip ZWNJ and diacritics, lowercase, collapse whitespace, drop
  generic company words (`شرکت`, `کمپنی`, `تولیدی`, `مرکز`, `ltd`, `co`,
  `llc`).
- `phoneKey(raw)`: reuses the existing `normalizePhone` to a single
  `+93XXXXXXXXX` string.
- `nameSimilarity(a, b)`: normalized token-set overlap combined with a
  Levenshtein ratio, returning 0..1.
- `classifyMatch(score, exactPhone)`: `'exact' | 'strong' | 'weak'`. An exact
  phone or email match is always `'exact'`; name score ≥ 0.85 is `'strong'`;
  ≥ 0.6 is `'weak'`.

`api/duplicates.ts`:

- `findLeadDuplicates({ companyName, phone, email })` runs in parallel:
  - `companies(filter: { name: { ilike } }, first: 20)` on the longest
    normalized token;
  - `opportunities(filter: { name: { ilike } }, first: 20)`;
  - `globalSearch(phone)` and `globalSearch(email)` — Twenty's search vector
    indexes person phones and emails, so this reaches contacts without needing
    a composite-field filter.
- Returns `DuplicateMatch[]`: `{ kind, id, label, sub, score, level, route }`,
  deduplicated by route and sorted by level then score.

UI:

- `components/DuplicateWarning.tsx` — inline banner listing matches, each
  linking to its record.
- `components/ConfirmDialog.tsx` — a general confirm modal, reused by the
  delete flow (section 4).
- `NewLeadView` checks on a 500 ms debounce as the seller types the company
  name or phone, showing the banner. On submit, if unacknowledged `exact` or
  `strong` matches exist, a dialog blocks: *open the existing lead* or
  *register anyway*. Acknowledgement is keyed on a fingerprint of the current
  company name + phone, so it does not re-prompt for unchanged input but does
  re-prompt if the seller edits the name afterwards.
- Adding a product line already present on the lead (`DealLinePricingEditor`
  call sites in `NewLeadView` and `LeadPanels`) asks for confirmation instead
  of silently creating a second line.

Out of scope by decision: notes, follow-up tasks, quick tasks, competitors,
catalog products. Those are not where real duplicates come from, and a dialog
on every note would be in the seller's way.

## 2. Minimize should return to the previous page

### Problem

`Shell.minimizePage()` ends with `navigate('/today')`. Minimizing a lead always
lands on the dashboard, even when the seller arrived from the leads list.

### Design

Call `goBack()` (already in `lib/router.ts`) instead. `goBack` falls back to
`/today` when `history.length <= 1`. One extra guard: capture the hash before
calling back and, after 120 ms, if the hash is unchanged, navigate to `/today`
— covers the deep-link case where history length lies.

## 3. Lead value displays the wrong number

### Problem

`formatMoney` → `abbreviateAmount`:

```
if (value >= 1_000) return `${toPersianDigits(Math.round(value / 1_000))}هزار`;
```

$2,500 renders as `$۳هزار`. Every amount between 1,000 and 1,000,000 is
rounded to the nearest thousand — a 20% error at $2,500, and it is the number
sellers quote to customers. Lead 4b18ee9a-2a6e-4649-871f-8b88bb680912 is one
instance of a bug affecting every money display in the app.

### Design

- `formatMoney(micros, code)` becomes exact: group with the Persian thousands
  separator `٬`, show decimals only when non-zero, keep the existing `$` prefix
  / `؋` suffix placement. `$۲٬۵۰۰`, `۳۰۰٬۰۰۰ ؋`.
- `formatMoneyCompact(micros, code)` keeps abbreviation for chart bar labels
  and other genuinely tight spots, but at one decimal (`۲٫۵هزار`) so it is
  never off by more than ~5%.
- `formatAfn` stays as the AFN wrapper over `formatMoney`.
- Every current call site uses the exact form except `ReportPrimitives` bar
  labels.

## 4. Soft delete with a reason

### Problem

Two independent causes. The Seller role is provisioned with
`canSoftDeleteObjectRecords: false` for every object
(`tools/sales-crm/provision-permissions.mjs:88`), so the server rejects any
delete a seller attempts. And the sales app has no delete UI at all.

Hard delete is already impossible: the role has
`canDestroyObjectRecords: false` and `canDestroyAllObjectRecords: false`, and
no `destroy*` mutation appears anywhere in the app.

### Design

Permissions (`provision-permissions.mjs`): introduce an explicit
`softDeletable` list — `opportunity`, `task`, `note`, `dealProduct`,
`quotation` — granted `canSoftDeleteObjectRecords: true`. `person`, `company`
and `dailyReport` keep soft-delete off (deleting a company would orphan leads).
`canDestroyObjectRecords` stays `false` for every object.

New `tools/sales-crm/provision-deletion-reason.mjs`, following the API-key auth
pattern of the existing provisioning scripts: adds a `deletionReason` TEXT
field to Opportunity, Task and Note.

`api/records.ts`:

- `softDeleteLead(id, reason)` — best-effort `updateOpportunity({
  deletionReason })`, then `deleteOpportunity(id)`. If the field is absent on
  the instance (the established `missingProductFieldFromError` pattern), fall
  back to creating a Note carrying the reason before deleting, so the reason is
  never lost.
- `softDeleteTask(id, reason)`, `softDeleteNote(id, reason)` — same shape; no
  note fallback (a deleted note cannot hold its own reason), the reason is
  simply skipped if the field is missing.
- A comment marks the module as delete-only, and a unit test asserts that no
  `destroy` mutation string appears in `src/api/`.

UI: `components/DeleteWithReasonDialog.tsx` — textarea, reason required at ≥ 3
characters, destructive confirm. Wired into `LeadDetailView` (deal-info card),
`TaskView` and `NoteView`. On success: invalidate the relevant cache prefixes
and navigate back to the parent list. Restoring is done from the CRM's trash
view — the sales app does not surface it.

## 5. Edit and view for tasks and notes on a lead

### Problem

`LeadDetailView`'s timeline renders tasks and notes as plain `<div>`s with no
affordance. `/task/:id` and `/note/:id` routes exist but nothing links to them,
so a truncated note body is unreadable. `NoteView` is read-only; `TaskView`
only autosaves the body.

### Design

- Timeline rows and open-task rows become clickable, routing to `/task/:id` or
  `/note/:id`.
- Each row gains a pencil button opening
  `components/RecordEditModal.tsx` — a quick edit that does not leave the lead:
  task (title, type, due date, body), note (title, body). Saves via
  `updateTask` / a new `updateNote`, then refreshes the lead.
- `NoteView`: inline edit of title and body, plus delete-with-reason.
- `TaskView`: an edit row for title / task type / due date next to the existing
  body autosave, plus delete-with-reason.

## 5b. The referrer row cannot be changed

Reported while the work was in progress: the معرف (referrer) field on the lead
detail page does nothing when edited.

### Problem

Three independent causes in `EditableMetaRow` (`components/LeadPanels.tsx`),
all of which also affect the source and marketer rows:

1. `onBlur={() => setEditing(false)}` unmounted the `<select>` on blur. Mobile
   browsers fire blur on a select when the native option picker opens, so the
   control disappeared before the seller could choose — the edit looked like it
   simply did nothing.
2. `handleChange` had `try/finally` with no `catch`, so a rejected save
   (permission, validation) produced an unhandled rejection and no UI change —
   indistinguishable from cause 1.
3. `editable={canEdit && referrers.length > 0}` made the row silently
   read-only whenever the bounded partner query returned nothing, and a lead
   whose referrer was absent from that list opened the select showing "—",
   where a stray change would clear a referrer nobody meant to touch.

### Design

The select no longer closes on blur — selecting commits, Escape cancels. A
failed save is caught and shown inline. The lead's current referrer is added to
the options when the fetched list lacks it, and the row stays editable whenever
there is anything to choose, including clearing an existing value.

## 6. Reports truncate at 300 records

### Problem

`ReportsView` calls `fetchLeads({ limit: 300 })` — one page, no pagination.
`common-find-many-query-runner.service.ts:155` honours `first` as given, so the
server returns exactly 300 and the report silently describes a subset. The same
single-page cap applies to `fetchDoneTasksSince` (200), `fetchDealProductsSince`
(200), `fetchMyOpenTasks` (200 in `TasksView`) and `fetchLeads` (200 in
`TodayView`, `CompetitorUsageSection`).

### Design

`api/records.ts` gains a `fetchAllPages` helper: cursor pagination over
`pageInfo { hasNextPage endCursor }` at `QUERY_MAX_RECORDS` (200) per page,
with a hard safety cap of 10,000 records / 50 pages so a runaway query cannot
exhaust the 100 req/60 s rate limit. When the cap is hit it is reported to the
caller rather than silently truncating — the report shows a "partial data"
banner.

Applied to leads, done-tasks, deal-products and open-tasks. Where the period
already bounds the data, the `createdAt`/`updatedAt` filter moves server-side
so pagination fetches only what the report uses.

## 7. Report accuracy

### Problem

`sumAmountMicros` reduces `amount.amountMicros` over leads, ignoring
`amount.currencyCode`, and the result is rendered by `formatAfn`. A lead worth
$2,500 adds 2,500,000,000 micros to a total labelled ؋. Since the multi-currency
work landed (commit efda9f84), this affects: Overview's open-pipeline KPI, every
`BreakdownRows` value, the conversion funnel, `SellerLeaderboard.pipelineValue`
and `computeMarketerLeaderboard.pipelineValue`. `computeProductStats` sums
install + annual price micros across currencies the same way.

### Design

- `lib/format.ts`: `sumByCurrency(records)` returns
  `Record<CurrencyCode, number>` keyed by currency code, treating a missing
  code as AFN (matching how the CRM stores legacy rows).
- `formatMoneyTotals(totals)` renders each non-zero currency joined by ` + `:
  `۱٫۲م ؋ + $۳٬۴۰۰`. A single-currency total reads exactly as it does today.
- `BreakdownRow.value` becomes `Record<string, number>`; `ReportPrimitives`,
  `OverviewReport`, `ConversionFunnel`, `SellerLeaderboard`,
  `MarketerLeaderboard` and `ProductPerformance` render via
  `formatMoneyTotals`.
- `computeProductStats` keeps install and annual revenue per currency.
- `reportAggregations.test.ts` gains cases proving AFN and USD never merge.

## Testing

- Unit: `duplicates.test.ts` (normalization, similarity, classification),
  `format.test.ts` (2,500 USD renders 2,500 — the reported bug as a regression
  test; per-currency summation), `reportAggregations.test.ts` (mixed-currency
  funnel and leaderboards), `records.test.ts` (pagination follows cursors and
  stops at the cap; no `destroy` mutations in `api/`).
- Manual against prod after deploy: the reported lead shows $2,500; reports
  show the full lead count; minimize returns to the previous page; a test lead
  deletes with a reason and reappears in the CRM trash.

## Deployment

1. Merge to `main` — the SPA auto-deploys via `deploy-hamagan-sales-app.yaml`.
2. Run `provision-deletion-reason.mjs` against prod (API key).
3. Re-run `provision-permissions.mjs` against prod to grant soft-delete.

Steps 2 and 3 are required before delete works in production. Until then the
delete dialog surfaces the server's permission error rather than failing
silently.
