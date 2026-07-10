# Sales App Daily Report + Performance Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an end-of-day "Daily Report" flow for sellers (what they did today + tomorrow's plan, submitted for their team lead) and extend the existing Reports page with seller and marketer performance breakdowns, inside `packages/twenty-sales-app`.

**Architecture:** A new `dailyReport` custom object (provisioned via metadata API script, same pattern as `contactRequest`/`competitor`) backs a new `DailyReportView` with a `من`/`تیم` scope toggle mirroring the existing Reports page. Performance reporting extends the existing `ReportsView` with a marketer breakdown card and a new `SellerLeaderboard` component, reusing already-fetched lead data and a generalized done-tasks query.

**Tech Stack:** React 19 + TypeScript + Vite (standalone package, not in the yarn workspace), hand-rolled GraphQL calls against Twenty's `/graphql` and `/metadata` endpoints, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-09-sales-app-reports-design.md`

**Verification note:** `twenty-sales-app` has no test runner configured (confirmed: no jest/vitest config, no `.test.` files, package sits outside the yarn/nx workspace). This plan follows the package's established practice — `npx tsc --noEmit` for fast type-error feedback after each task, and a manual browser walkthrough (via the preview tools) as the final task, exactly as prior features in this package (calendar, competitor intel, etc.) were verified.

---

### Task 1: Provision the `dailyReport` custom object

**Files:**
- Create: `tools/sales-crm/provision-daily-report-object.mjs`

- [ ] **Step 1: Write the provisioning script**

```js
// Daily Report: end-of-day seller report (what I did today + tomorrow's
// plan), submitted so a team lead can read it. Same pattern/idempotency as
// provision-contact-request-object.mjs. See
// docs/superpowers/specs/2026-07-09-sales-app-reports-design.md.
const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';

let TOKEN = null;
async function gql(query, variables) {
  const res = await fetch(META, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors.map((e) => e.message)));
  return json.data;
}
async function login() {
  const a = await gql(`mutation($e:String!,$p:String!,$o:String!){getLoginTokenFromCredentials(email:$e,password:$p,origin:$o){loginToken{token}}}`, { e: EMAIL, p: PASSWORD, o: ORIGIN });
  const b = await gql(`mutation($t:String!,$o:String!){getAuthTokensFromLoginToken(loginToken:$t,origin:$o){tokens{accessOrWorkspaceAgnosticToken{token}}}}`, { t: a.getLoginTokenFromCredentials.loginToken.token, o: ORIGIN });
  TOKEN = b.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;
}
async function fetchObjects() {
  const d = await gql(`query { objects(paging:{first:500}) { edges { node {
    id nameSingular isSystem
    fields(paging:{first:500}) { edges { node { id name } } }
  } } } }`);
  const map = {};
  for (const { node } of d.objects.edges) {
    map[node.nameSingular] = { id: node.id, fields: new Map(node.fields.edges.map((e) => [e.node.name, e.node.id])) };
  }
  return map;
}
async function createObject(spec) {
  const d = await gql(`mutation($input:CreateOneObjectInput!){createOneObject(input:$input){id nameSingular}}`, { input: { object: spec } });
  return d.createOneObject;
}
async function createField(input) {
  const d = await gql(`mutation($input:CreateOneFieldMetadataInput!){createOneField(input:$input){id name}}`, { input: { field: input } });
  return d.createOneField;
}

const OBJECTS = [
  { nameSingular: 'dailyReport', namePlural: 'dailyReports', labelSingular: 'Daily Report', labelPlural: 'Daily Reports', icon: 'IconNotes', description: "A seller's end-of-day report: what they did today + tomorrow's plan" },
];

const FIELDS = {
  dailyReport: [
    { name: 'reportDate', label: 'Report Date', type: 'DATE_TIME' },
    { name: 'summary', label: 'Summary', type: 'TEXT' },
    { name: 'tomorrowPlan', label: 'Tomorrow Plan', type: 'TEXT' },
    { name: 'tasksDoneCount', label: 'Tasks Done Count', type: 'NUMBER' },
    { name: 'submittedAt', label: 'Submitted At', type: 'DATE_TIME' },
  ],
};

const RELATIONS = [
  { source: 'dailyReport', name: 'seller', label: 'Seller', target: 'workspaceMember', targetFieldLabel: 'Daily Reports', targetFieldIcon: 'IconNotes', icon: 'IconUser' },
];

const log = [];
const rec = (kind, name, status, detail = '') => { log.push({ kind, name, status, detail }); console.log(`  [${status}] ${kind}: ${name}${detail ? ' — ' + detail : ''}`); };

async function main() {
  await login();
  console.log('authenticated.\n');
  let objs = await fetchObjects();

  console.log('== objects ==');
  for (const spec of OBJECTS) {
    if (objs[spec.nameSingular]) { rec('object', spec.nameSingular, 'skip', 'exists'); continue; }
    try { const o = await createObject(spec); rec('object', o.nameSingular, 'created', o.id); }
    catch (e) { rec('object', spec.nameSingular, 'FAIL', e.message); }
  }
  objs = await fetchObjects();

  console.log('\n== fields ==');
  for (const [objName, fields] of Object.entries(FIELDS)) {
    const obj = objs[objName];
    if (!obj) { rec('field', objName + '.*', 'FAIL', 'object missing'); continue; }
    for (const f of fields) {
      if (obj.fields.has(f.name)) { rec('field', `${objName}.${f.name}`, 'skip', 'exists'); continue; }
      try { await createField({ objectMetadataId: obj.id, ...f }); rec('field', `${objName}.${f.name}`, 'created'); }
      catch (e) { rec('field', `${objName}.${f.name}`, 'FAIL', e.message); }
    }
  }
  objs = await fetchObjects();

  console.log('\n== relations ==');
  for (const r of RELATIONS) {
    const src = objs[r.source], tgt = objs[r.target];
    if (!src || !tgt) { rec('relation', `${r.source}.${r.name}`, 'FAIL', 'src/tgt missing'); continue; }
    if (src.fields.has(r.name)) { rec('relation', `${r.source}.${r.name}`, 'skip', 'exists'); continue; }
    try {
      await createField({
        objectMetadataId: src.id, name: r.name, label: r.label, type: 'RELATION', icon: r.icon,
        relationCreationPayload: { type: 'MANY_TO_ONE', targetObjectMetadataId: tgt.id, targetFieldLabel: r.targetFieldLabel, targetFieldIcon: r.targetFieldIcon },
      });
      rec('relation', `${r.source}.${r.name} -> ${r.target}`, 'created');
    } catch (e) { rec('relation', `${r.source}.${r.name}`, 'FAIL', e.message); }
  }

  const fails = log.filter((l) => l.status === 'FAIL');
  console.log(`\n==== SUMMARY: ${log.filter(l=>l.status==='created').length} created, ${log.filter(l=>l.status==='skip').length} skipped, ${fails.length} failed ====`);
  if (fails.length) process.exitCode = 1;
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
```

- [ ] **Step 2: Run it against local dev**

Ensure the `twenty-server` dev server is running on port 3010 first (`npx nx start twenty-server`, or the `twenty-server` launch config). Then:

Run: `node tools/sales-crm/provision-daily-report-object.mjs`
Expected: `SUMMARY: 7 created, 0 skipped, 0 failed` on first run (1 object + 5 fields + 1 relation). Re-running immediately should print `SUMMARY: 0 created, 7 skipped, 0 failed` (idempotency check).

- [ ] **Step 3: Commit**

```bash
git add tools/sales-crm/provision-daily-report-object.mjs
git commit -m "feat(sales-app): provision dailyReport custom object"
```

---

### Task 2: Generalize done-tasks fetch + add marketer breakdown fetch (`api/records.ts`)

**Files:**
- Modify: `packages/twenty-sales-app/src/api/records.ts:832-863` (the `reports` section) and near `fetchLeadMarketer` (~line 693-708)

- [ ] **Step 1: Replace `fetchMyDoneTasksSince` with a generalized `fetchDoneTasksSince`**

Find this block (the whole `---------- reports ----------` section):

```ts
// ---------- reports ----------

export type DoneTask = {
  id: string;
  title: string;
  updatedAt: string;
};

export const fetchMyDoneTasksSince = async (
  assigneeId: string,
  sinceIso: string,
): Promise<DoneTask[]> => {
  const data = await coreQuery<{
    tasks: { edges: { node: DoneTask }[] };
  }>(
    `query MyDoneTasks($filter: TaskFilterInput) {
      tasks(filter: $filter, first: 200, orderBy: [{ updatedAt: DescNullsLast }]) {
        edges { node { id title updatedAt } }
      }
    }`,
    {
      filter: {
        and: [
          { assigneeId: { eq: assigneeId } },
          { status: { eq: 'DONE' } },
          { updatedAt: { gte: sinceIso } },
        ],
      },
    },
  );
  return data.tasks.edges.map((e) => e.node);
};
```

Replace it with:

```ts
// ---------- reports ----------

export type DoneTask = {
  id: string;
  title: string;
  updatedAt: string;
  bodyV2: { markdown: string | null } | null;
  assignee: { id: string; name: { firstName: string; lastName: string } } | null;
};

// assigneeId omitted = every seller's done tasks since sinceIso (used for
// team-wide reporting); passed = one seller's (used for "my" reports).
export const fetchDoneTasksSince = async (
  sinceIso: string,
  assigneeId?: string,
): Promise<DoneTask[]> => {
  const filters: Record<string, unknown>[] = [
    { status: { eq: 'DONE' } },
    { updatedAt: { gte: sinceIso } },
  ];
  if (assigneeId) {
    filters.push({ assigneeId: { eq: assigneeId } });
  }

  const data = await coreQuery<{
    tasks: { edges: { node: DoneTask }[] };
  }>(
    `query DoneTasksSince($filter: TaskFilterInput) {
      tasks(filter: $filter, first: 200, orderBy: [{ updatedAt: DescNullsLast }]) {
        edges {
          node {
            id
            title
            updatedAt
            bodyV2 { markdown }
            assignee { id name { firstName lastName } }
          }
        }
      }
    }`,
    { filter: { and: filters } },
  );
  return data.tasks.edges.map((e) => e.node);
};
```

- [ ] **Step 2: Add the marketer breakdown fetch**

Find `fetchLeadMarketer` (single-lead marketer lookup):

```ts
// Marketer is a production-only SELECT field on Opportunity.
export const fetchLeadMarketer = async (
  opportunityId: string,
): Promise<string | null> => {
  try {
    const data = await coreQuery<{ opportunity: { marketer: string | null } }>(
      `query LeadMarketer($id: UUID!) {
        opportunity(filter: { id: { eq: $id } }) { marketer }
      }`,
      { id: opportunityId },
    );
    return data.opportunity.marketer;
  } catch {
    return null;
  }
};
```

Add a bulk variant directly below it:

```ts
// Bulk variant for reports: one marketer per lead id, in a single request.
// Same defensive try/catch as fetchLeadMarketer — the field doesn't exist on
// every environment (e.g. local dev), so callers must treat {} as "no data".
export const fetchLeadsMarketers = async (
  ids: string[],
): Promise<Record<string, string | null>> => {
  if (ids.length === 0) return {};
  try {
    const data = await coreQuery<{
      opportunities: { edges: { node: { id: string; marketer: string | null } }[] };
    }>(
      `query LeadsMarketers($ids: [UUID!]!, $limit: Int!) {
        opportunities(filter: { id: { in: $ids } }, first: $limit) {
          edges { node { id marketer } }
        }
      }`,
      { ids, limit: ids.length },
    );
    return Object.fromEntries(
      data.opportunities.edges.map((e) => [e.node.id, e.node.marketer]),
    );
  } catch {
    return {};
  }
};
```

- [ ] **Step 3: Type-check**

Run: `cd packages/twenty-sales-app && npx tsc --noEmit`
Expected: errors pointing at `ReportsView.tsx`'s now-broken `fetchMyDoneTasksSince` import — expected at this point, fixed in Task 9.

- [ ] **Step 4: Commit**

```bash
git add packages/twenty-sales-app/src/api/records.ts
git commit -m "feat(sales-app): generalize done-tasks fetch, add bulk marketer fetch"
```

---

### Task 3: `api/dailyReports.ts`

**Files:**
- Create: `packages/twenty-sales-app/src/api/dailyReports.ts`

- [ ] **Step 1: Write the module**

```ts
import { coreQuery } from './client';

export type DailyReport = {
  id: string;
  reportDate: string;
  summary: string | null;
  tomorrowPlan: string | null;
  tasksDoneCount: number | null;
  submittedAt: string;
  seller: { id: string; name: { firstName: string; lastName: string } } | null;
};

const DAILY_REPORT_FIELDS = `
  id
  reportDate
  summary
  tomorrowPlan
  tasksDoneCount
  submittedAt
  seller { id name { firstName lastName } }
`;

// Normalizes any date to local midnight ISO, so "today's report" always
// resolves to the same reportDate value on write and on read.
export const reportDateKeyFor = (date: Date): string => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export const fetchMyDailyReportForDate = async (
  sellerId: string,
  reportDateIso: string,
): Promise<DailyReport | null> => {
  const data = await coreQuery<{
    dailyReports: { edges: { node: DailyReport }[] };
  }>(
    `query MyDailyReportForDate($filter: DailyReportFilterInput) {
      dailyReports(filter: $filter, first: 1) {
        edges { node { ${DAILY_REPORT_FIELDS} } }
      }
    }`,
    {
      filter: {
        and: [
          { sellerId: { eq: sellerId } },
          { reportDate: { eq: reportDateIso } },
        ],
      },
    },
  );
  return data.dailyReports.edges[0]?.node ?? null;
};

export const fetchMyDailyReports = async (
  sellerId: string,
  limit = 14,
): Promise<DailyReport[]> => {
  const data = await coreQuery<{
    dailyReports: { edges: { node: DailyReport }[] };
  }>(
    `query MyDailyReports($filter: DailyReportFilterInput, $limit: Int) {
      dailyReports(filter: $filter, first: $limit, orderBy: [{ reportDate: DescNullsLast }]) {
        edges { node { ${DAILY_REPORT_FIELDS} } }
      }
    }`,
    {
      filter: { sellerId: { eq: sellerId } },
      limit,
    },
  );
  return data.dailyReports.edges.map((e) => e.node);
};

export const fetchTeamDailyReports = async (
  reportDateIso: string,
): Promise<DailyReport[]> => {
  const data = await coreQuery<{
    dailyReports: { edges: { node: DailyReport }[] };
  }>(
    `query TeamDailyReports($filter: DailyReportFilterInput) {
      dailyReports(filter: $filter, first: 100, orderBy: [{ submittedAt: DescNullsLast }]) {
        edges { node { ${DAILY_REPORT_FIELDS} } }
      }
    }`,
    { filter: { reportDate: { eq: reportDateIso } } },
  );
  return data.dailyReports.edges.map((e) => e.node);
};

export const upsertDailyReport = async (input: {
  id?: string;
  sellerId: string;
  reportDate: string;
  summary: string;
  tomorrowPlan: string;
  tasksDoneCount: number;
}): Promise<string> => {
  const payload = {
    summary: input.summary,
    tomorrowPlan: input.tomorrowPlan,
    tasksDoneCount: input.tasksDoneCount,
    submittedAt: new Date().toISOString(),
  };
  if (input.id) {
    await coreQuery(
      `mutation UpdateDailyReport($id: UUID!, $data: DailyReportUpdateInput!) {
        updateDailyReport(id: $id, data: $data) { id }
      }`,
      { id: input.id, data: payload },
    );
    return input.id;
  }
  const created = await coreQuery<{ createDailyReport: { id: string } }>(
    `mutation CreateDailyReport($data: DailyReportCreateInput!) {
      createDailyReport(data: $data) { id }
    }`,
    {
      data: {
        ...payload,
        sellerId: input.sellerId,
        reportDate: input.reportDate,
      },
    },
  );
  return created.createDailyReport.id;
};
```

- [ ] **Step 2: Type-check**

Run: `cd packages/twenty-sales-app && npx tsc --noEmit`
Expected: no new errors from this file (the pre-existing `ReportsView.tsx` error from Task 2 still present, unrelated).

- [ ] **Step 3: Commit**

```bash
git add packages/twenty-sales-app/src/api/dailyReports.ts
git commit -m "feat(sales-app): add dailyReports API module"
```

---

### Task 4: `endOfTomorrow` helper + draft generators

**Files:**
- Modify: `packages/twenty-sales-app/src/lib/format.ts`
- Create: `packages/twenty-sales-app/src/lib/dailyReportDraft.ts`

- [ ] **Step 1: Add `endOfTomorrow` to `format.ts`**

Find:

```ts
export const endOfToday = (): Date => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};
```

Replace with:

```ts
export const endOfToday = (): Date => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};

export const endOfTomorrow = (): Date => {
  const d = endOfToday();
  d.setDate(d.getDate() + 1);
  return d;
};
```

- [ ] **Step 2: Write the draft generators**

```ts
import { type DoneTask, type Task } from '../api/records';

// Bullet-list draft of what a seller did today, from their completed tasks.
// The seller edits this before submitting — it's a starting point, not a
// final answer, so keep it terse (title + first line of the result note).
export const draftSummaryFromDoneTasks = (tasks: DoneTask[]): string => {
  if (tasks.length === 0) return '';
  return tasks
    .map((task) => {
      const firstLine = task.bodyV2?.markdown?.trim().split('\n')[0]?.slice(0, 120);
      return firstLine ? `- ${task.title} — ${firstLine}` : `- ${task.title}`;
    })
    .join('\n');
};

// Bullet-list draft of tomorrow's plan, from tasks already scheduled for
// tomorrow. The seller can add plans that aren't tasks yet.
export const draftPlanFromUpcomingTasks = (tasks: Task[]): string => {
  if (tasks.length === 0) return '';
  return tasks.map((task) => `- ${task.title}`).join('\n');
};
```

Save as `packages/twenty-sales-app/src/lib/dailyReportDraft.ts`.

- [ ] **Step 3: Sanity-check the pure functions manually**

Run: `cd packages/twenty-sales-app && npx tsx -e "
import { draftSummaryFromDoneTasks, draftPlanFromUpcomingTasks } from './src/lib/dailyReportDraft';
console.log(draftSummaryFromDoneTasks([{ id: '1', title: 'تماس با شرکت الف', updatedAt: '', bodyV2: { markdown: 'دمو تایید شد' }, assignee: null }]));
console.log(draftPlanFromUpcomingTasks([{ id: '2', title: 'پیگیری شرکت ب', status: 'TODO', taskType: null, dueAt: null, createdAt: '', bodyV2: null }]));
"`

Expected output:
```
- تماس با شرکت الف — دمو تایید شد
- پیگیری شرکت ب
```

(If `tsx` isn't available, `npx --yes tsx@latest` will fetch it for this one-off check — no permanent dependency added.)

- [ ] **Step 4: Type-check**

Run: `cd packages/twenty-sales-app && npx tsc --noEmit`
Expected: same single pre-existing `ReportsView.tsx` error, nothing new.

- [ ] **Step 5: Commit**

```bash
git add packages/twenty-sales-app/src/lib/format.ts packages/twenty-sales-app/src/lib/dailyReportDraft.ts
git commit -m "feat(sales-app): add endOfTomorrow helper and daily report draft generators"
```

---

### Task 5: Strings + icon

**Files:**
- Modify: `packages/twenty-sales-app/src/lib/strings.ts`
- Modify: `packages/twenty-sales-app/src/components/icons.tsx`

- [ ] **Step 1: Add `T3` (daily report strings) to `strings.ts`**

Append at the end of the file, after `QUOTE_STATUS_LABELS`:

```ts

// daily report (added with the daily-report + performance-reports build)
export const T3 = {
  dailyReport: 'گزارش روزانه',
  mine: 'من',
  team: 'تیم',
  whatIDidToday: 'امروز چه کار کردید؟',
  whatIDidTodayHint: 'به صورت خودکار از وظایف امروز شما پر شده — ویرایش کنید',
  tomorrowPlanLabel: 'برنامهٔ فردا',
  tomorrowPlanHint: 'به صورت خودکار از وظایف فردا پر شده — ویرایش کنید',
  regenerateDraft: 'بازتولید از وظایف',
  submitReport: 'ثبت گزارش',
  updateReport: 'بروزرسانی گزارش',
  submitting: 'در حال ثبت…',
  reportSubmitFailed: 'ثبت گزارش ناموفق بود',
  reportSubmitted: 'گزارش امروز ثبت شد ✓',
  lastUpdated: 'آخرین بروزرسانی',
  myReportHistory: 'گزارش‌های پیشین من',
  noReportsYet: 'هنوز گزارشی ثبت نکرده‌اید',
  notSubmittedYet: 'هنوز ثبت نکرده‌اند',
  everyoneSubmitted: 'همه ثبت کردند ✓',
  noReportsForDate: 'برای این تاریخ گزارشی ثبت نشده',
  tasksDoneBadge: 'وظیفه',
};
```

- [ ] **Step 2: Add seller/marketer performance labels to `T2`**

Find the end of the `T2` object:

```ts
  noPricing: 'هنوز محصول یا پیشنهاد قیمتی ثبت نشده',
  total: 'مجموع',
};
```

Replace with:

```ts
  noPricing: 'هنوز محصول یا پیشنهاد قیمتی ثبت نشده',
  total: 'مجموع',

  sellerPerformance: 'عملکرد فروشندگان',
  byMarketer: 'به تفکیک بازاریاب',
  wonLbl: 'برنده شده',
  winRateLbl: 'نرخ موفقیت',
};
```

- [ ] **Step 3: Add `IconDailyReport` to `icons.tsx`**

Append at the end of the file:

```tsx

export const IconDailyReport = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="7" y1="14" x2="17" y2="14" />
    <line x1="7" y1="18" x2="13" y2="18" />
  </svg>
);
```

- [ ] **Step 4: Type-check**

Run: `cd packages/twenty-sales-app && npx tsc --noEmit`
Expected: same single pre-existing `ReportsView.tsx` error, nothing new.

- [ ] **Step 5: Commit**

```bash
git add packages/twenty-sales-app/src/lib/strings.ts packages/twenty-sales-app/src/components/icons.tsx
git commit -m "feat(sales-app): add daily report strings and nav icon"
```

---

### Task 6: `views/DailyReportView.tsx` — "من" (mine) tab

**Files:**
- Create: `packages/twenty-sales-app/src/views/DailyReportView.tsx`

This task builds the full view with a scope toggle, but only wires up the "mine" tab. The "تیم" tab renders a placeholder until Task 7.

- [ ] **Step 1: Write the view**

```tsx
import { useMemo, useState } from 'react';

import { type CurrentUser } from '../api/auth';
import {
  fetchMyDailyReportForDate,
  fetchMyDailyReports,
  reportDateKeyFor,
  upsertDailyReport,
} from '../api/dailyReports';
import { fetchDoneTasksSince, fetchMyOpenTasks } from '../api/records';
import { invalidateCache, useCached } from '../lib/cache';
import {
  draftPlanFromUpcomingTasks,
  draftSummaryFromDoneTasks,
} from '../lib/dailyReportDraft';
import { endOfToday, endOfTomorrow, startOfToday } from '../lib/format';
import { formatJalaliDate, formatJalaliDateTime, toPersianDigits } from '../lib/jalali';
import { T3 } from '../lib/strings';

type DailyReportViewProps = {
  user: CurrentUser;
};

type Scope = 'mine' | 'team';

const fetchMineData = async (sellerId: string) => {
  const todayKey = reportDateKeyFor(new Date());
  const [existing, doneToday, upcomingTomorrow, history] = await Promise.all([
    fetchMyDailyReportForDate(sellerId, todayKey),
    fetchDoneTasksSince(startOfToday().toISOString(), sellerId),
    fetchMyOpenTasks(sellerId, {
      dueAfter: endOfToday().toISOString(),
      dueBefore: endOfTomorrow().toISOString(),
    }),
    fetchMyDailyReports(sellerId, 14),
  ]);
  return { existing, doneToday, upcomingTomorrow, history, todayKey };
};

export const DailyReportView = ({ user }: DailyReportViewProps) => {
  const [scope, setScope] = useState<Scope>('mine');

  const { data, error, refresh } = useCached(
    `daily-report-mine:${user.workspaceMemberId}`,
    () => fetchMineData(user.workspaceMemberId),
  );

  const [summary, setSummary] = useState<string | null>(null);
  const [tomorrowPlan, setTomorrowPlan] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const draftSummary = useMemo(
    () => draftSummaryFromDoneTasks(data?.doneToday ?? []),
    [data?.doneToday],
  );
  const draftPlan = useMemo(
    () => draftPlanFromUpcomingTasks(data?.upcomingTomorrow ?? []),
    [data?.upcomingTomorrow],
  );

  const summaryValue = summary ?? data?.existing?.summary ?? draftSummary;
  const tomorrowPlanValue = tomorrowPlan ?? data?.existing?.tomorrowPlan ?? draftPlan;

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  };

  const submit = async () => {
    if (!data) return;
    setSaving(true);
    try {
      await upsertDailyReport({
        id: data.existing?.id,
        sellerId: user.workspaceMemberId,
        reportDate: data.todayKey,
        summary: summaryValue.trim(),
        tomorrowPlan: tomorrowPlanValue.trim(),
        tasksDoneCount: data.doneToday.length,
      });
      invalidateCache('daily-report-mine:');
      invalidateCache('daily-report-team:');
      showToast(T3.reportSubmitted);
      await refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : T3.reportSubmitFailed);
    } finally {
      setSaving(false);
    }
  };

  const regenerate = () => {
    setSummary(draftSummary);
    setTomorrowPlan(draftPlan);
  };

  const loading = data === null && error === null;

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>{T3.dailyReport}</h1>
          <div className="sub">{formatJalaliDate(new Date().toISOString())}</div>
        </div>
      </div>

      <div className="toolbar anim d1">
        <div className="seg">
          <button className={scope === 'mine' ? 'on' : ''} onClick={() => setScope('mine')}>
            {T3.mine}
          </button>
          <button className={scope === 'team' ? 'on' : ''} onClick={() => setScope('team')}>
            {T3.team}
          </button>
        </div>
      </div>

      {error !== null && <div className="error-banner">{error}</div>}

      {scope === 'team' ? (
        <div className="empty-state">{T3.team} — coming in Task 7</div>
      ) : loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="skeleton" style={{ height: 200 }} />
          <div className="skeleton" style={{ height: 160 }} />
        </div>
      ) : (
        <>
          <div className="card card-pad anim d2">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>{T3.whatIDidToday}</h3>
              <button className="btn line sm" onClick={regenerate}>
                {T3.regenerateDraft}
              </button>
            </div>
            <div className="sub" style={{ marginBottom: 8 }}>{T3.whatIDidTodayHint}</div>
            <div className="fld" style={{ marginBottom: 0 }}>
              <textarea
                style={{ minHeight: 140 }}
                value={summaryValue}
                onChange={(e) => setSummary(e.target.value)}
              />
            </div>
          </div>

          <div className="card card-pad anim d3" style={{ marginTop: 16 }}>
            <h3>{T3.tomorrowPlanLabel}</h3>
            <div className="sub" style={{ marginBottom: 8 }}>{T3.tomorrowPlanHint}</div>
            <div className="fld" style={{ marginBottom: 0 }}>
              <textarea
                style={{ minHeight: 120 }}
                value={tomorrowPlanValue}
                onChange={(e) => setTomorrowPlan(e.target.value)}
              />
            </div>
          </div>

          <button
            className="btn gold block"
            style={{ padding: 12, marginTop: 16 }}
            disabled={saving}
            onClick={submit}
          >
            {saving ? T3.submitting : data?.existing ? T3.updateReport : T3.submitReport}
          </button>
          {data?.existing && (
            <div className="sub" style={{ marginTop: 8, textAlign: 'center' }}>
              {T3.lastUpdated}: {formatJalaliDateTime(data.existing.submittedAt)}
            </div>
          )}

          <div className="card anim d4" style={{ marginTop: 16 }}>
            <div
              className="card-pad"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
              onClick={() => setHistoryOpen((open) => !open)}
            >
              <h3>{T3.myReportHistory}</h3>
              <span className="sub">{historyOpen ? '▴' : '▾'}</span>
            </div>
            {historyOpen &&
              ((data?.history.length ?? 0) === 0 ? (
                <div className="empty-state">{T3.noReportsYet}</div>
              ) : (
                data?.history.map((r) => (
                  <div className="task" key={r.id}>
                    <div className="t-main" style={{ cursor: 'default' }}>
                      <div className="t-title">{formatJalaliDate(r.reportDate)}</div>
                      <div className="t-sub" style={{ whiteSpace: 'pre-wrap' }}>
                        {(r.summary ?? '').slice(0, 140)}
                      </div>
                    </div>
                    <span className="pill stage num">
                      {toPersianDigits(r.tasksDoneCount ?? 0)} {T3.tasksDoneBadge}
                    </span>
                  </div>
                ))
              ))}
          </div>
        </>
      )}

      {toast !== null && <div className="toast">{toast}</div>}
    </main>
  );
};
```

- [ ] **Step 2: Type-check**

Run: `cd packages/twenty-sales-app && npx tsc --noEmit`
Expected: same single pre-existing `ReportsView.tsx` error, nothing new from this file.

- [ ] **Step 3: Commit**

```bash
git add packages/twenty-sales-app/src/views/DailyReportView.tsx
git commit -m "feat(sales-app): add DailyReportView mine tab"
```

---

### Task 7: `components/TeamDailyReportsFeed.tsx` — "تیم" tab

**Files:**
- Create: `packages/twenty-sales-app/src/components/TeamDailyReportsFeed.tsx`
- Modify: `packages/twenty-sales-app/src/views/DailyReportView.tsx`

- [ ] **Step 1: Write the feed component**

```tsx
import { useState } from 'react';

import { fetchMembers } from '../api/admin';
import { fetchTeamDailyReports, reportDateKeyFor } from '../api/dailyReports';
import { useCached } from '../lib/cache';
import { formatJalaliDate, formatJalaliDateTime, toPersianDigits } from '../lib/jalali';
import { T3 } from '../lib/strings';

const fetchTeamData = async (reportDateIso: string) => {
  const [reports, members] = await Promise.all([
    fetchTeamDailyReports(reportDateIso),
    fetchMembers(),
  ]);
  return { reports, members };
};

export const TeamDailyReportsFeed = () => {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const dateKey = reportDateKeyFor(selectedDate);
  const isToday = dateKey === reportDateKeyFor(new Date());

  const { data, error } = useCached(`daily-report-team:${dateKey}`, () =>
    fetchTeamData(dateKey),
  );

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reports = data?.reports ?? [];
  const submittedSellerIds = new Set(
    reports.map((r) => r.seller?.id).filter((id): id is string => Boolean(id)),
  );
  const notSubmitted = (data?.members ?? []).filter((m) => !submittedSellerIds.has(m.id));
  const loading = data === null && error === null;

  return (
    <div>
      <div className="toolbar anim d2">
        <div className="fld" style={{ marginBottom: 0, maxWidth: 220 }}>
          <input
            type="date"
            value={localDateInputValue(selectedDate)}
            onChange={(e) => setSelectedDate(new Date(`${e.target.value}T00:00:00`))}
          />
        </div>
        <span className="sub">{formatJalaliDate(selectedDate.toISOString())}</span>
      </div>

      {error !== null && <div className="error-banner">{error}</div>}

      {isToday && !loading && (
        <div className="card card-pad anim d2" style={{ marginBottom: 16 }}>
          <h3>{notSubmitted.length === 0 ? T3.everyoneSubmitted : T3.notSubmittedYet}</h3>
          {notSubmitted.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {notSubmitted.map((m) => (
                <span className="pill stage" key={m.id}>
                  {m.name.firstName} {m.name.lastName}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 64 }} />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="empty-state">{T3.noReportsForDate}</div>
      ) : (
        reports.map((r) => (
          <div
            className="card card-pad anim"
            key={r.id}
            style={{ marginBottom: 10, cursor: 'pointer' }}
            onClick={() => toggle(r.id)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="avatar av-26">{r.seller?.name.firstName.charAt(0) ?? '؟'}</span>
                <div>
                  <div style={{ fontWeight: 750 }}>
                    {r.seller ? `${r.seller.name.firstName} ${r.seller.name.lastName}` : '—'}
                  </div>
                  <div className="sub">{formatJalaliDateTime(r.submittedAt)}</div>
                </div>
              </div>
              <span className="pill stage num">
                {toPersianDigits(r.tasksDoneCount ?? 0)} {T3.tasksDoneBadge}
              </span>
            </div>
            {expanded.has(r.id) && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <div className="sub">{T3.whatIDidToday}</div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{r.summary || '—'}</div>
                </div>
                <div>
                  <div className="sub">{T3.tomorrowPlanLabel}</div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{r.tomorrowPlan || '—'}</div>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};

// Local (not UTC) YYYY-MM-DD for the date input — matches toLocalInputValue's
// convention in lib/format.ts, just date-only.
const localDateInputValue = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
```

- [ ] **Step 2: Wire the feed into `DailyReportView.tsx`**

In `packages/twenty-sales-app/src/views/DailyReportView.tsx`, add the import:

Find:

```tsx
import { type CurrentUser } from '../api/auth';
```

Replace with:

```tsx
import { type CurrentUser } from '../api/auth';
import { TeamDailyReportsFeed } from '../components/TeamDailyReportsFeed';
```

Then find the placeholder branch:

```tsx
      {scope === 'team' ? (
        <div className="empty-state">{T3.team} — coming in Task 7</div>
      ) : loading ? (
```

Replace with:

```tsx
      {scope === 'team' ? (
        <TeamDailyReportsFeed />
      ) : loading ? (
```

- [ ] **Step 3: Type-check**

Run: `cd packages/twenty-sales-app && npx tsc --noEmit`
Expected: same single pre-existing `ReportsView.tsx` error, nothing new.

- [ ] **Step 4: Commit**

```bash
git add packages/twenty-sales-app/src/components/TeamDailyReportsFeed.tsx packages/twenty-sales-app/src/views/DailyReportView.tsx
git commit -m "feat(sales-app): add team daily reports feed"
```

---

### Task 8: Nav wiring

**Files:**
- Modify: `packages/twenty-sales-app/src/components/Shell.tsx`
- Modify: `packages/twenty-sales-app/src/App.tsx`

- [ ] **Step 1: Add the nav item and dock default in `Shell.tsx`**

Find the icon imports:

```tsx
import {
  IconChart,
  IconChevronDown,
  IconDashboard,
  IconFlame,
  IconLeads,
  IconLogout,
  IconMoon,
  IconPlus,
  IconSearch,
  IconSun,
  IconTasks,
} from './icons';
```

Replace with:

```tsx
import {
  IconChart,
  IconChevronDown,
  IconDailyReport,
  IconDashboard,
  IconFlame,
  IconLeads,
  IconLogout,
  IconMoon,
  IconPlus,
  IconSearch,
  IconSun,
  IconTasks,
} from './icons';
```

Find the strings import:

```tsx
import { T, T2 } from '../lib/strings';
```

Replace with:

```tsx
import { T, T2, T3 } from '../lib/strings';
```

Find `routeDockDefaults`:

```tsx
const routeDockDefaults = (
  parts: string[],
): { label: string; kind: DockKind } => {
  const [section] = parts;
  if (section === 'lead') return { label: T.lead, kind: 'lead' };
  if (section === 'task') return { label: T.task, kind: 'task' };
  if (section === 'new') return { label: T.newLead, kind: 'new' };
  if (section === 'reports') return { label: T2.reports, kind: 'page' };
  if (section === 'leads') return { label: T.leads, kind: 'page' };
  if (section === 'tasks') return { label: 'کارها', kind: 'page' };
  return { label: T.tabToday, kind: 'page' };
};
```

Replace with:

```tsx
const routeDockDefaults = (
  parts: string[],
): { label: string; kind: DockKind } => {
  const [section] = parts;
  if (section === 'lead') return { label: T.lead, kind: 'lead' };
  if (section === 'task') return { label: T.task, kind: 'task' };
  if (section === 'new') return { label: T.newLead, kind: 'new' };
  if (section === 'reports') return { label: T2.reports, kind: 'page' };
  if (section === 'daily-report') return { label: T3.dailyReport, kind: 'page' };
  if (section === 'leads') return { label: T.leads, kind: 'page' };
  if (section === 'tasks') return { label: 'کارها', kind: 'page' };
  return { label: T.tabToday, kind: 'page' };
};
```

Find `NAV`:

```tsx
const NAV = [
  { key: 'today', label: T.tabToday, icon: IconDashboard },
  { key: 'tasks', label: 'کارها', icon: IconTasks },
  { key: 'leads', label: T.tabLeads, icon: IconLeads },
  { key: 'reports', label: T2.reports, icon: IconChart },
  { key: 'competitors', label: 'رقبا', icon: IconFlame },
  { key: 'admin', label: 'کاربران', icon: IconLeads },
] as const;
```

Replace with:

```tsx
const NAV = [
  { key: 'today', label: T.tabToday, icon: IconDashboard },
  { key: 'tasks', label: 'کارها', icon: IconTasks },
  { key: 'leads', label: T.tabLeads, icon: IconLeads },
  { key: 'reports', label: T2.reports, icon: IconChart },
  { key: 'daily-report', label: T3.dailyReport, icon: IconDailyReport },
  { key: 'competitors', label: 'رقبا', icon: IconFlame },
  { key: 'admin', label: 'کاربران', icon: IconLeads },
] as const;
```

- [ ] **Step 2: Add the route in `App.tsx`**

Find the view imports:

```tsx
import { LeadChatView } from './views/LeadChatView';
import { LeadDetailView } from './views/LeadDetailView';
import { LeadsView } from './views/LeadsView';
import { AdminView } from './views/AdminView';
import { CompetitorsView } from './views/CompetitorsView';
import { CompanyView, NoteView, PersonView } from './views/EntityViews';
import { LoginView } from './views/LoginView';
import { NewLeadView } from './views/NewLeadView';
import { ReportsView } from './views/ReportsView';
```

Replace with:

```tsx
import { LeadChatView } from './views/LeadChatView';
import { LeadDetailView } from './views/LeadDetailView';
import { LeadsView } from './views/LeadsView';
import { AdminView } from './views/AdminView';
import { CompetitorsView } from './views/CompetitorsView';
import { DailyReportView } from './views/DailyReportView';
import { CompanyView, NoteView, PersonView } from './views/EntityViews';
import { LoginView } from './views/LoginView';
import { NewLeadView } from './views/NewLeadView';
import { ReportsView } from './views/ReportsView';
```

Find the routing branch:

```tsx
  } else if (section === 'reports') {
    view = <ReportsView user={user} />;
  } else if (section === 'competitors') {
```

Replace with:

```tsx
  } else if (section === 'reports') {
    view = <ReportsView user={user} />;
  } else if (section === 'daily-report') {
    view = <DailyReportView user={user} />;
  } else if (section === 'competitors') {
```

- [ ] **Step 3: Type-check**

Run: `cd packages/twenty-sales-app && npx tsc --noEmit`
Expected: same single pre-existing `ReportsView.tsx` error, nothing new.

- [ ] **Step 4: Commit**

```bash
git add packages/twenty-sales-app/src/components/Shell.tsx packages/twenty-sales-app/src/App.tsx
git commit -m "feat(sales-app): wire Daily Report into nav and routing"
```

---

### Task 9: `components/SellerLeaderboard.tsx`

**Files:**
- Create: `packages/twenty-sales-app/src/components/SellerLeaderboard.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useMemo } from 'react';

import { fetchDoneTasksSince, type LeadSummary } from '../api/records';
import { useCached } from '../lib/cache';
import { formatAfn, sumAmountMicros } from '../lib/format';
import { toPersianDigits } from '../lib/jalali';
import { T2 } from '../lib/strings';

type SellerLeaderboardProps = {
  leads: LeadSummary[];
  periodStartIso: string;
};

type SellerRow = {
  sellerId: string;
  name: string;
  registered: number;
  won: number;
  winRate: number;
  pipelineValue: number;
  tasksDone: number;
};

export const SellerLeaderboard = ({ leads, periodStartIso }: SellerLeaderboardProps) => {
  const { data: doneTasks } = useCached(`seller-leaderboard-tasks:${periodStartIso}`, () =>
    fetchDoneTasksSince(periodStartIso),
  );

  const rows = useMemo<SellerRow[]>(() => {
    const bySeller = new Map<string, { name: string; leads: LeadSummary[] }>();
    for (const lead of leads) {
      if (!lead.owner) continue;
      const key = lead.owner.id;
      const entry = bySeller.get(key) ?? {
        name: `${lead.owner.name.firstName} ${lead.owner.name.lastName}`.trim(),
        leads: [],
      };
      entry.leads.push(lead);
      bySeller.set(key, entry);
    }

    const tasksBySeller = new Map<string, number>();
    for (const task of doneTasks ?? []) {
      if (!task.assignee) continue;
      tasksBySeller.set(task.assignee.id, (tasksBySeller.get(task.assignee.id) ?? 0) + 1);
    }

    return [...bySeller.entries()]
      .map(([sellerId, entry]) => {
        const won = entry.leads.filter((l) => l.stage === 'ACTIVE_CUSTOMER').length;
        const openLeads = entry.leads.filter(
          (l) => l.stage !== 'ACTIVE_CUSTOMER' && l.stage !== 'LOST_MISSED',
        );
        return {
          sellerId,
          name: entry.name,
          registered: entry.leads.length,
          won,
          winRate: entry.leads.length > 0 ? Math.round((won / entry.leads.length) * 100) : 0,
          pipelineValue: sumAmountMicros(openLeads),
          tasksDone: tasksBySeller.get(sellerId) ?? 0,
        };
      })
      .sort((a, b) => b.registered - a.registered);
  }, [leads, doneTasks]);

  if (rows.length === 0) {
    return <div className="empty-state">{T2.noData}</div>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="leads">
        <thead>
          <tr>
            <th>{T2.seller}</th>
            <th>{T2.leadsRegistered}</th>
            <th>{T2.wonLbl}</th>
            <th>{T2.winRateLbl}</th>
            <th>{T2.openPipelineValue}</th>
            <th>{T2.tasksDone}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.sellerId}>
              <td>{row.name}</td>
              <td className="num">{toPersianDigits(row.registered)}</td>
              <td className="num">{toPersianDigits(row.won)}</td>
              <td className="num">{toPersianDigits(row.winRate)}٪</td>
              <td className="num">{formatAfn(row.pipelineValue)}</td>
              <td className="num">{toPersianDigits(row.tasksDone)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

- [ ] **Step 2: Type-check**

Run: `cd packages/twenty-sales-app && npx tsc --noEmit`
Expected: same single pre-existing `ReportsView.tsx` error, nothing new.

- [ ] **Step 3: Commit**

```bash
git add packages/twenty-sales-app/src/components/SellerLeaderboard.tsx
git commit -m "feat(sales-app): add SellerLeaderboard component"
```

---

### Task 10: Wire marketer breakdown + seller leaderboard into `ReportsView.tsx`

**Files:**
- Modify: `packages/twenty-sales-app/src/views/ReportsView.tsx`
- Modify: `packages/twenty-sales-app/src/views/TasksView.tsx`

> **Addendum (found during Task 2 implementation):** `fetchMyDoneTasksSince` had a
> second call site the plan missed — `TasksView.tsx`'s "done" tab. Step 0 below
> fixes it. Without this fix the build stays broken after this task.

- [ ] **Step 0: Fix the second `fetchMyDoneTasksSince` call site in `TasksView.tsx`**

Find:

```tsx
import {
  fetchMyDoneTasksSince,
  fetchMyOpenTasks,
  setTaskStatus,
  type Task,
  type TaskType,
} from '../api/records';
```

Replace with:

```tsx
import {
  fetchDoneTasksSince,
  fetchMyOpenTasks,
  setTaskStatus,
  type Task,
  type TaskType,
} from '../api/records';
```

Find:

```tsx
    const [open, done] = await Promise.all([
      fetchMyOpenTasks(user.workspaceMemberId, { limit: 200 }),
      fetchMyDoneTasksSince(user.workspaceMemberId, since.toISOString()),
    ]);
```

Replace with:

```tsx
    const [open, done] = await Promise.all([
      fetchMyOpenTasks(user.workspaceMemberId, { limit: 200 }),
      fetchDoneTasksSince(since.toISOString(), user.workspaceMemberId),
    ]);
```

- [ ] **Step 1: Fix imports**

Find:

```tsx
import { useMemo, useState } from 'react';

import { type CurrentUser } from '../api/auth';
import {
  fetchLeads,
  fetchMyDoneTasksSince,
  OPEN_STAGES,
  type LeadSummary,
} from '../api/records';
import {
  IconCheck,
  IconFlame,
  IconMoney,
  IconTasks,
} from '../components/icons';
import { useCached } from '../lib/cache';
```

Replace with:

```tsx
import { useMemo, useState } from 'react';

import { type CurrentUser } from '../api/auth';
import {
  fetchDoneTasksSince,
  fetchLeads,
  fetchLeadsMarketers,
  OPEN_STAGES,
  type LeadSummary,
} from '../api/records';
import {
  IconCheck,
  IconFlame,
  IconMoney,
  IconTasks,
} from '../components/icons';
import { SellerLeaderboard } from '../components/SellerLeaderboard';
import { useCached } from '../lib/cache';
```

- [ ] **Step 2: Fix the done-tasks call**

Find:

```tsx
        scope === 'me'
          ? fetchMyDoneTasksSince(user.workspaceMemberId, start.toISOString())
          : Promise.resolve([]),
```

Replace with:

```tsx
        scope === 'me'
          ? fetchDoneTasksSince(start.toISOString(), user.workspaceMemberId)
          : Promise.resolve([]),
```

- [ ] **Step 3: Replace `byOwner` with the marketer fetch + breakdown**

Find:

```tsx
  const byOwner = useMemo(
    () =>
      groupBy(
        inPeriod,
        (l) => l.owner?.name.firstName ?? null,
        MARKETER_LABELS,
      ),
    [inPeriod],
  );
```

Replace with:

```tsx
  const { data: marketerMap } = useCached(
    `reports-marketers:${scope}:${period}`,
    () =>
      scope === 'team'
        ? fetchLeadsMarketers(inPeriod.map((l) => l.id))
        : Promise.resolve({}),
  );
  const hasMarketerData = Object.values(marketerMap ?? {}).some(
    (v) => v !== null && v !== undefined,
  );
  const byMarketer = useMemo(
    () => groupBy(inPeriod, (l) => marketerMap?.[l.id] ?? null, MARKETER_LABELS),
    [inPeriod, marketerMap],
  );
```

- [ ] **Step 4: Swap the byOwner card for the seller leaderboard**

Find:

```tsx
          {scope === 'team' && (
            <div className="card card-pad anim d4">
              <h3>{T2.byOwner}</h3>
              {inPeriod.length === 0 ? (
                <div className="empty-state">{T2.noData}</div>
              ) : (
                <BreakdownRows rows={byOwner} />
              )}
            </div>
          )}
```

Replace with:

```tsx
          {scope === 'team' && (
            <div className="card card-pad anim d4">
              <h3>{T2.sellerPerformance}</h3>
              <SellerLeaderboard leads={inPeriod} periodStartIso={start.toISOString()} />
            </div>
          )}
```

- [ ] **Step 5: Add the marketer breakdown card**

Find:

```tsx
          <div className="card card-pad anim d5">
            <h3>{T2.byTemperature}</h3>
            {inPeriod.length === 0 ? (
              <div className="empty-state">{T2.noData}</div>
            ) : (
              <BreakdownRows rows={byTemp} />
            )}
          </div>
        </div>
      </div>
    </main>
  );
};
```

Replace with:

```tsx
          <div className="card card-pad anim d5">
            <h3>{T2.byTemperature}</h3>
            {inPeriod.length === 0 ? (
              <div className="empty-state">{T2.noData}</div>
            ) : (
              <BreakdownRows rows={byTemp} />
            )}
          </div>
          {scope === 'team' && hasMarketerData && (
            <div className="card card-pad anim d5">
              <h3>{T2.byMarketer}</h3>
              <BreakdownRows rows={byMarketer} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
```

- [ ] **Step 6: Type-check**

Run: `cd packages/twenty-sales-app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/twenty-sales-app/src/views/ReportsView.tsx packages/twenty-sales-app/src/views/TasksView.tsx
git commit -m "feat(sales-app): add marketer breakdown and seller leaderboard to Reports"
```

---

### Task 11: Manual E2E verification

**Files:** none (verification only)

- [ ] **Step 1: Start the local backend and a local-API frontend**

Use the preview tools: start `twenty-server` (port 3010), then start the `sales-app-localapi` launch config (port 3013, already configured with `SALES_API_TARGET=http://localhost:3010` so it never touches production).

- [ ] **Step 2: Log in and open Daily Report**

Log in with `tim@apple.dev` / `tim@apple.dev` (per this app's existing E2E convention). Navigate to "گزارش روزانه". Confirm:
- The "چه کار کردید" textarea is pre-filled from today's done tasks (or empty if none exist yet — create/complete one test task first via "امروز" if needed).
- The "برنامهٔ فردا" textarea is pre-filled from tomorrow's scheduled tasks.
- Click "ثبت گزارش" — expect the "گزارش امروز ثبت شد ✓" toast, and the button label switches to "بروزرسانی گزارش".

- [ ] **Step 3: Verify the team tab**

Switch to "تیم". Confirm:
- Today's date is selected by default and the just-submitted report appears in the feed with the correct tasks-done badge.
- Clicking the report card expands it to show the full summary/plan text.
- The submitting user no longer appears in the "هنوز ثبت نکرده‌اند" list (or "همه ثبت کردند ✓" shows if they were the only seller).

- [ ] **Step 4: Verify Reports page extensions**

Navigate to "گزارش‌ها", switch scope to "تیم". Confirm:
- "عملکرد فروشندگان" table renders with per-seller rows (leads, won, win rate, pipeline value, tasks done).
- No "به تفکیک بازاریاب" card appears (local dev has no `marketer` field — confirms the graceful no-op), and no console error is thrown because of it.

Check for console/network errors throughout with `preview_console_logs` (level: error) and `preview_network` (filter: failed).

- [ ] **Step 5: Full build**

Run: `cd packages/twenty-sales-app && npx tsc --noEmit && npx vite build`
Expected: builds cleanly, no type errors.

---

## Deploy (explicitly gated — do not run without Rashid's approval)

Once verified locally and approved:

1. Run `node tools/sales-crm/provision-daily-report-object.mjs` against production (`TWENTY_META=https://crm.hamagan.com/metadata TWENTY_ORIGIN=https://crm.hamagan.com TWENTY_EMAIL=... TWENTY_PASSWORD=...`), per `tools/sales-crm/DEPLOY-TO-PRODUCTION.md`.
2. Rebuild the frontend (`npx tsc --noEmit && npx vite build`), tar the `dist/` folder, scp to `hamagan-management`, and untar over `/opt/twenty-sales-app/dist` — same steps as prior sales-app deploys (see `sales-app-spa` memory).
3. Confirm the "به تفکیک بازاریاب" card now renders with real data in production (where the `marketer` field exists), since it silently no-ops on local dev.
