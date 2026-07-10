# Sales App Daily Report + Performance Reports — Design

Date: 2026-07-09
Status: Approved, ready for implementation plan

## Goal

Two related additions to the Sales App (`packages/twenty-sales-app`):

1. **Daily Report** — an end-of-day ritual for sellers: what they did today,
   what they plan tomorrow, submitted so a team lead can read it.
2. **Performance Reports** — extend the existing Reports page so admins/team
   leads can see seller performance and marketer performance, not just lead
   funnel stats.

## Scope decisions (from clarification round)

- **"Market" = the existing `marketer` SELECT field** (Alavi/Shabab/Noorzai),
  not a geographic region. No new field needed for that dimension.
- **No team hierarchy yet.** There's no team-lead-to-seller grouping in the
  data model today — just Twenty's Admin/Member roles. Team leads/admins see
  the whole company's data, same as the existing `team` scope toggle in
  Reports. A real team-grouping model is an explicit future add-on, not part
  of this pass.
- **Out of scope for v1**: read/reviewed receipts on daily reports; commission
  / referrer-partner performance (a different entity than `marketer`).

## A. Daily Report

New nav tab "گزارش روزانه", new `views/DailyReportView.tsx`. Internal scope
toggle mirroring the existing Reports page: `من` (mine) / `تیم` (team).

### من (mine)

- Auto-drafted textarea for "what I did today", pre-filled from today's
  completed tasks (`fetchMyDoneTasksSince(sellerId, startOfToday)` — already
  exists) as a bullet list of titles. Freely editable before submit.
- Auto-drafted textarea for "tomorrow's plan", pre-filled from tasks already
  due tomorrow (`fetchMyOpenTasks(sellerId, { dueAfter: endOfToday, dueBefore:
  endOfTomorrow })`) as a bullet list. Freely editable — sellers can add plans
  that aren't yet tasks in the system.
- Submit button **upserts** today's report: if a `dailyReport` already exists
  for this seller + today's `reportDate`, update it; otherwise create it.
  Editable all day — resubmitting just updates `summary`/`tomorrowPlan`/
  `submittedAt`. Button label switches between "ثبت گزارش" and "بروزرسانی
  گزارش" depending on whether today's report already exists.
- Below the form: a collapsed list of the seller's own last 14 days of
  reports (date + tasks-done badge + preview), expandable to read in full.

### تیم (team)

- Date picker, defaults to today (Jalali display, ISO under the hood).
- Feed of every submitted `dailyReport` for that date: seller name/avatar,
  `tasksDoneCount` badge, truncated summary + tomorrow's plan, click to
  expand full text.
- **Not-yet-submitted list**: cross-reference `fetchMembers()` against the
  day's submitted reports and surface sellers who haven't submitted yet
  (only meaningful/shown for today, not past dates).

### New backend: `dailyReport` custom object

Provisioned via a new script `tools/sales-crm/provision-daily-report-object.mjs`,
following the exact pattern of `provision-contact-request-object.mjs`
(idempotent create-if-missing for object/fields/relation, authenticated via
`TWENTY_META`/`TWENTY_ORIGIN`/credentials env vars, run manually against
local then production).

| field | type | notes |
|---|---|---|
| `reportDate` | DATE_TIME | the day being reported, stored at midnight UTC (not `createdAt`, which doesn't change on update); this codebase's provisioning scripts only ever use `DATE_TIME`, never a plain `DATE` type, so we follow that convention |
| `summary` | TEXT | "what I did today", editable draft |
| `tomorrowPlan` | TEXT | "tomorrow's plan", editable draft |
| `tasksDoneCount` | NUMBER | cached snapshot at submit time, so the team feed doesn't need to reopen each report to show a count |
| `submittedAt` | DATE_TIME | set/updated on every submit |
| `seller` | RELATION → workspaceMember (MANY_TO_ONE) | same shape as `task.assignee` |

One row per seller per day, enforced client-side (query by `seller` +
`reportDate` before create; update if found — no DB-level unique constraint
available through the metadata API for composite keys).

### New API module: `api/dailyReports.ts`

```ts
fetchMyDailyReportForDate(sellerId, reportDateIso): Promise<DailyReport | null>
fetchMyDailyReports(sellerId, limit): Promise<DailyReport[]>          // history, desc by reportDate
fetchTeamDailyReports(reportDateIso): Promise<DailyReport[]>          // all sellers, one date
upsertDailyReport(input: { id?, sellerId, reportDate, summary, tomorrowPlan, tasksDoneCount }): Promise<string>
```

## B. Performance Reports (extend `views/ReportsView.tsx`)

Two additions to the existing team-scope view, reusing established patterns
so `ReportsView.tsx` doesn't blow past the file-size convention:

### Marketer breakdown (new card, team scope only)

Leads/value grouped by the `marketer` field, rendered with the existing
`BreakdownRows` component (same as `byStage`/`bySource`/`byTemp`). Fetched
defensively — `marketer` is a production-only ad hoc field (per
`fetchLeadMarketer`'s existing try/catch precedent), so this is a separate
bulk query wrapped in try/catch that simply omits the card if the field
doesn't exist in the current environment (e.g. local dev).

### Seller leaderboard (upgrade of the existing `byOwner` card)

Extracted into a new small `components/SellerLeaderboard.tsx`. Per seller,
in the selected period:
- leads registered
- won (stage `ACTIVE_CUSTOMER`)
- win rate % (won / registered)
- open pipeline value
- tasks done (**new** — requires generalizing `fetchMyDoneTasksSince` into
  `fetchDoneTasksSince(sinceIso, assigneeId?)`: same query, `assigneeId`
  filter becomes optional, and the returned type gains an `assignee` field so
  results can be grouped client-side by seller when no filter is applied)

## Nav / routing

- `components/Shell.tsx`: add `{ key: 'daily-report', label: 'گزارش روزانه', icon: IconNotes }` (or similar) to `NAV`, plus a `routeDockDefaults` entry.
- `App.tsx`: add `section === 'daily-report'` → `<DailyReportView user={user} />`.
- `lib/strings.ts`: new Dari strings for the daily report form (submit/update labels, section headers, "not yet submitted" list, etc.), following the existing `T`/`T2` style.

## Testing

- Component/unit tests for the upsert logic (create vs. update path) and for
  the auto-draft generation (bullet-listing today's done tasks / tomorrow's
  tasks) in `DailyReportView`.
- Unit test for `fetchDoneTasksSince` grouping logic in `SellerLeaderboard`.
- Manual E2E verification against local dev (per this app's existing
  practice — no automated E2E harness for this package): submit a report as
  one seller, confirm it appears in the team feed and in "not yet submitted"
  disappears; confirm the marketer/seller leaderboard cards render with real
  data.

## Deploy

Same two-step pattern as prior sales-app work: verify locally first: local
dev DB doesn't have the `marketer` field, so the marketer breakdown card must
be confirmed to gracefully no-op there, and confirmed to actually render once
the object/field provisioning script and this code ship to production
(`crm.hamagan.com`) — both **explicitly gated on Rashid's approval**, per
existing practice for this package (see `sales-app-spa` memory).
