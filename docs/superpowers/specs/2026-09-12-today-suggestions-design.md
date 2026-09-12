# Today suggestions ("پیشنهاد امروز") — design

**Date:** 2026-09-12
**Package:** `packages/twenty-sales-app`
**Screen:** home / Today (`src/views/TodayView.tsx`)

## Problem

A seller opening the app in the morning sees tasks and KPIs, but nothing that
answers "what should I do *now* if nothing is scheduled?". Leads that are hot
but have no next step, contracts sent and never chased, and new leads never
contacted sit quietly in the pipeline until someone remembers them.

## Goal

A card at the top of the Today page that lists the handful of leads worth
approaching today, each with a one-line reason and a tap-to-act target, plus a
short AI-written "focus of the day" note on top. The list must be instant and
work even when the AI is slow, rate-limited or down.

## Approach (hybrid)

1. A deterministic rule engine ranks the seller's open leads from signals the
   page already has (plus one new query) and renders immediately.
2. One LLM call per user per day (existing `/rest/ai/generate-text`) turns the
   top candidates into a 2–3 sentence coaching note. Cached in `localStorage`.
   Failure hides the note; the list is unaffected.

## Files

| file | change |
|---|---|
| `src/lib/suggestions.ts` | **new** — pure ranking + prompt builder |
| `src/lib/suggestions.test.ts` | **new** — unit tests |
| `src/api/suggestions.ts` | **new** — done-tasks-with-targets query, focus-note fetch + cache |
| `src/components/TodaySuggestionsCard.tsx` | **new** — the card |
| `src/views/TodayView.tsx` | import + one JSX line + pass data |
| `src/styles.css` | appended block `/* ---- today suggestions ---- */` |
| (strings) | card copy lives in the component: `strings.ts`'s tail is where every feature appends |

`records.ts` is not modified. Another agent is editing lead/catalog/partner
screens and `styles.css`; all new code lives in new files and appended blocks
so the merge is trivial.

## Data / signals

Inputs to the ranker, all scoped to the current seller:

- `LeadSummary[]` — owner = me, already loaded by TodayView (`fetchAllLeads`).
  Used: `stage`, `temperature`, `stageChangedAt`, `createdAt`, `amount`,
  `leadSource`, `referrer`, `pointOfContact.phones`.
- Open `Task[]` — already loaded (`fetchMyOpenTasks`, due-before-EOD and
  upcoming). Used per lead via `taskTargets`: has an open task? is it overdue?
  is it due today?
- **New** `DoneTaskWithTarget[]` — my tasks with `status = DONE` and
  `updatedAt >= now − 30d`, selecting `taskTargets { opportunity { id } }`.
  The existing `DoneTask` query has no targets, so `api/suggestions.ts` owns a
  small variant (`fetchMyDoneTasksWithTargets(assigneeId, sinceIso)`), paged
  with `fetchAllPages`. Gives "last contact" per lead.

## Ranking

`rankSuggestions(input: { leads, openTasks, doneTasks, now }): Suggestion[]`

```ts
type SuggestionKind = 'task' | 'contract' | 'call' | 'follow_up';
type Suggestion = {
  leadId: string;
  leadName: string;
  stage: string | null;
  temperature: string | null;
  kind: SuggestionKind;
  score: number;
  why: string;        // Persian, one line, from the top-scoring reason
  href: string;       // '/lead/:id' or '/task/:id'
  amountMicros: number | null;
  currencyCode: string | null;
};
```

Only leads with `stage ∈ OPEN_STAGES` are considered. A lead with an open
task **due today** is skipped — it is already in the tasks card.

Additive scores; the highest single reason supplies `why` and `kind`:

| reason | score | kind | why |
|---|---|---|---|
| open task on this lead is overdue | 60 | task | «کار عقب‌مانده دارد» (href → that task) |
| HOT with no open task | 40 | call | «لید داغ بدون قدم بعدی» |
| WARM with no open task | 25 | call | «لید گرم بدون قدم بعدی» |
| stage ∈ {CONTRACT_SENT, SIGNED_AWAITING_PAYMENT} and stage age ≥ 3d and no open task | 35 | contract | «قرارداد ارسال شده، پیگیری نشده» / «امضا شده، پرداخت پیگیری نشده» |
| NEW_LEAD, no done task ever (in 30d window), age ≥ 1d, no open task | 30 | call | «لید جدید، هنوز تماس نگرفته‌اید» |
| stage age ≥ 30d (`ageTone === 'stale'`) | 25 | follow_up | «N روز در این مرحله» |
| stage age ≥ 14d (`ageTone === 'warn'`) | 15 | follow_up | «N روز در این مرحله» |
| last contact ≥ 7d ago (or none in 30d while lead older than 7d) | 15 | follow_up | «N روز بدون تماس» |
| amount in top quartile of my open pipeline (same currency compare via micros) | +10 | — | tiebreak only |
| `leadSource === 'REFERRAL'` or `referrer` set | +5 | — | tiebreak only |

Leads with score 0 are dropped. Sort by score desc, then amount desc, then
name. Cap at **6**.

`stageAgeDays` / `ageTone` come from `lib/leadAge.ts`; `daysSince` for
contact age.

## AI focus note

`buildFocusPrompt(suggestions, now): { systemPrompt, userPrompt }` — pure.

- System: Hamagan sales coach; reply in Persian (Dari); ≤ 60 words; plain
  text, no markdown, no list; name at most 3 leads; say what to do first and
  why.
- User: one line per candidate (top 10 from the ranker, before the cap of 6 is
  applied — the ranker exposes `rankSuggestions(input, { limit })`):
  `نام | مرحله | دما | N روز در مرحله | آخرین تماس N روز پیش | مبلغ`.

`fetchFocusNote(memberId, suggestions, { force })` in `api/suggestions.ts`:

- cache key `salesApp:todayFocus:<memberId>:<YYYY-MM-DD>` (local date) in
  `localStorage`; hit → return; miss or `force` → `generateText`, store, return.
- 0 candidates → return `null` without calling.
- errors propagate; the card catches and hides the note.

## Card (`TodaySuggestionsCard`)

Props: `{ user, leads, openTasks, loading }`. It fetches done tasks itself via
`useCached('suggestions:done:<memberId>', …)`, ranks in `useMemo`, then kicks
the focus-note fetch in an effect keyed on the ranked lead ids + date.

Layout (RTL, matches existing cards):

```
┌ card ───────────────────────────────────────────┐
│ ✨ پیشنهاد امروز              ۵ لید      [↻]    │
│ (sub) بر اساس وضعیت لیدهای شما                    │
│ ┌ focus note (muted box, ✨) — streams in ───┐ │
│ │ اول با شرکت X تماس بگیر…                     │ │
│ └──────────────────────────────────────────────┘ │
│ 📞  شرکت الف           «لید داغ بدون قدم بعدی»  │
│      Following Up · داغ              ۱۲۰٬۰۰۰ ؋  │
│ 📄  شرکت ب             «قرارداد ارسال شده…»     │
│ …                                                │
└──────────────────────────────────────────────────┘
```

- Row: kind icon (`IconPhone` / contract / clock / task), lead name, why-pill,
  stage chip (+ «داغ» when HOT), amount when > 0. Tap → `navigate(href)`.
- Loading (leads or done tasks null) → 3 skeleton rows.
- Empty → «همه چیز مرتب است — لیدی که نیاز به توجه فوری داشته باشد نیست».
- Focus note: skeleton line while pending; hidden on error; `↻` re-generates
  (`force: true`) and is disabled while pending.
- Uses `IconSparkle` (new, in `icons.tsx` — additive) and `IconFileText` /
  existing icons where present.

## Error handling

- Done-task query failure → rank with `doneTasks = []` (contact-age rules
  just don't fire) and show nothing about it; the rest of the page is
  independent.
- Focus note failure → note hidden, `↻` still available.
- `localStorage` unavailable → treat as cache miss every time (try/catch).

## Tests (`suggestions.test.ts`)

- every rule fires in isolation with the expected `why`/`kind`/`href`
- lead with a task due today is excluded
- closed-stage leads excluded
- overdue-task rule wins over HOT-no-task and links to the task
- ordering: score, then amount, then name; cap respected; `limit` option
- amount top-quartile and referral tiebreaks change order but never `why`
- `buildFocusPrompt` includes each candidate's name and stage; empty → no call
- cache key uses local date (`YYYY-MM-DD`)

Run: `cd packages/twenty-sales-app && npx jest suggestions`.

## Out of scope

Manager/team-wide suggestions, dismiss/snooze, server-side scheduling,
streaming responses.
