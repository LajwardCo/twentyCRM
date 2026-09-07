# Report library (Sales app)

**Last updated:** 2026-09-07 · **Status: live on production** (`crm.hamagan.com/sales/#/reports`)

`#/reports` used to be a single dashboard — five tabs of aggregate tiles that
answered "how are we doing" and nothing else. Anyone who wanted the rows behind
a number (which leads are stalled, what a partner is owed, who filed no daily
report) had to leave and rebuild it by hand from the lists.

It is now a catalogue of **17 reports** grouped by what they answer. The old
dashboard is still there, as one entry: `#/reports/dashboard`.

## Where things live

| Path | What it is |
|---|---|
| `src/lib/reports/types.ts` | `ReportDefinition` — the contract every report implements |
| `src/lib/reports/engine.ts` | The generic half: cells, formatting, sort, group, filter derivation, CSV |
| `src/lib/reports/{pipeline,performance,revenue,activity}Reports.ts` | The 17 definitions |
| `src/lib/reports/shared.ts` | Lead vocabulary shared by the lead-shaped reports |
| `src/lib/reports/strings.ts` | `RT` — Dari text, kept out of `lib/strings.ts` so the catalogue can grow |
| `src/api/reportsData.ts` | Dataset fetchers (paginated, degrade where an object isn't provisioned) |
| `src/views/ReportRunnerView.tsx` | The one screen that renders **every** report |
| `src/views/ReportsCatalogView.tsx` | The library index |

## The idea

A report is a **declaration, not a screen**: it says which datasets it needs,
how to turn them into rows, and what its columns mean. One runner renders all
of them. That is what makes period, scope, filters, grouping, sorting and CSV
export behave identically everywhere — and what makes the next report a
~30-line addition rather than a new page.

## Adding a report

1. Add a `ReportDefinition` to the matching category file:

```ts
const myReport: ReportDefinition = {
  id: 'my-report',                    // the URL: #/reports/my-report
  title: RT.rMyTitle,
  description: RT.rMyDesc,
  category: 'pipeline',
  needs: ['leads'],                   // only these datasets are fetched
  scoped: true,                       // show the me/team switch
  defaultSort: { key: 'value', dir: 'desc' },
  groupBy: ['stage', 'owner'],
  chart: { groupBy: 'stage', value: 'value' },
  columns: [
    { key: 'lead',  label: RT.colLead,  kind: 'text',  filter: 'text' },
    { key: 'value', label: RT.colValue, kind: 'money', filter: 'range' },
  ],
  build: (data, ctx) => data.leads.map((lead) => ({
    id: lead.id,
    href: `/lead/${lead.id}`,         // clicking the row opens the record
    cells: { lead: textCell(lead.name), value: amountCell(...) },
  })),
  kpis: (rows) => [countKpi(RT.kOpenLeads, rows.length)],
};
```

2. Add its strings to `RT` in `lib/reports/strings.ts`.
3. Export it from the file's `*_REPORTS` array. It appears in the library, the
   sidebar sub-menu and ⌘K automatically.

`reportDefs.test.ts` then checks it for free: unique id, a `defaultSort` on a
column that exists, `groupBy`/`chart` keys that exist, and — against a dataset
that reaches every report — that no row is missing a declared column.

## Rules worth not re-learning

**Money is per-currency, always.** The team quotes in AFN *and* USD; one summed
number would describe neither. Build money cells with `moneyCell(totals)` /
`amountCell(micros, code)` and the engine keeps the currencies apart through
grouping, KPI totals and the exported file. `value` on a money cell is only the
largest single bucket, used for ranking — it is never claimed to be a total.

**A missing value is not zero.** `null` sorts last in *both* directions and
renders as `—`. A deal line with no discount recorded is not a 0% discount:
averaging the absent ones in would understate every real concession.

**Filters run in the browser, by design.** The interesting columns (days in
stage, win rate, commission due) are derived — there is no server-side column to
filter on. Rows are fully loaded before filtering, so this is correct rather
than a shortcut. Filter state serializes into the URL: a filtered report is a
link you can send.

**Charts on aggregate reports need `chart.count`.** A leaderboard row *is* a
group, so counting rows draws a bar of `1` next to every name. Name a numeric
column instead (`count: 'leads'`).

**The runner is keyed on the report id** (`App.tsx`). Filters, grouping and sort
are per-report state; without the remount they follow you from one report to the
next — which is exactly what happened, and it silently emptied reports.

**Paginate through the cursor.** `first:` is not clamped, so an oversized page
silently truncates — a report that stops at one page reads exactly like a
complete one. Everything in `reportsData.ts` goes through `fetchAllPages`, and
surfaces `truncated` rather than swallowing it.

## Production schema

Verified against prod on 2026-09-07 (`core.objectMetadata` / `core.fieldMetadata`
on `twenty-db-1`): all 11 objects the reports read are active, and every field
they select exists — including `opportunity.stageChangedAt`, so the ageing and
sales-cycle reports use real stage-change timestamps rather than the
registration-date fallback.

Note the record API (`/graphql`) builds its schema **per workspace from the
caller's token**, so an unauthenticated probe reports *everything* as missing —
including fields that plainly exist. Check the metadata tables on the box
instead, and always include a known-good control field in any probe.
