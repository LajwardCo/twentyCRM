# Surveys & Forms — design

Date: 2026-09-26 · Branch: `feat/surveys-forms` · Surface: Sales App (`packages/twenty-sales-app`) + `twenty-server` + `twenty-shared`

## 1. Goal

One form definition, three collection channels (public link, staff during a
visit, paper transcribed later), one response store, one reporting layer.
Forms are built in the Sales App by authorised users without code. Responses
optionally link to company / contact / lead / campaign / visit and can create
those records through a review-first flow.

## 2. Decisions (made, with reasons)

| # | Decision | Why |
|---|----------|-----|
| D1 | Forms, versions, responses, campaigns, invitations are **Twenty custom objects** provisioned by `tools/sales-crm/provision-surveys.mjs`. No core tables, no instance migrations. | Same pattern as every other sales feature (offers, audit log, daily reports). Tenant isolation, per-role object permissions, soft delete, timeline history, attachments, notes and tasks come free. |
| D2 | The **form engine** (schema types, logic, validation, publish checks, public sanitising, print checks) is one pure-TS module at `packages/twenty-shared/src/surveys/`, exported as `twenty-shared/surveys` for the server and aliased as `@shared/surveys` in the Sales App (same trick as `@shared/phone`). Zero imports outside that folder. | The spec demands identical logic in preview, public completion, staff entry, server validation and reporting. One implementation is the only way to guarantee that. |
| D3 | Anything that must not be bypassable goes through **server code**: publishing (creates the immutable version), all public reads/writes, answer validation on save (query hook), invitation minting, capabilities. Ordinary CRUD (drafts, linking, notes) uses the record API with the user's own permissions. | Server-side enforcement is required; the record API already enforces tenant + role permissions. |
| D4 | A **version snapshot is immutable** and every response stores `formVersion` + `versionNumber`. Answers are keyed by a stable question id (`q_xxxxxx`) and choices by stable choice id (`c_xxxxxx`), never by label or position. | Renames, reorders and deletions can never corrupt history; reports can span versions. |
| D5 | **Hidden-answer rule (documented behaviour):** while filling, an answer to a question that becomes hidden is kept in memory so toggling back restores it, but on every save/submit the engine strips it and records the question id in `skippedByLogic`. The server re-runs the same function and discards anything the client sent for hidden questions. Stripped answers never drive CRM mapping, automation, exports or insights. | One rule, applied identically everywhere. |
| D6 | **Logic is forward-only**: a condition may only reference questions on earlier pages (or earlier on the same page); jumps may only target later pages or the end. | Makes navigation loops impossible by construction; the publish validator still checks it. |
| D7 | Public form URL: `/sales/#/f/<slug>`; slug = 12 random base62 chars stored on the form. The workspace is resolved **from the request origin** via `WorkspaceDomainsService.getWorkspaceByOriginOrDefaultWorkspace`, exactly like Twenty's own public login. Invitation links add `&i=<token>` (32 random bytes, only its SHA-256 is stored). Campaign attribution adds `&c=<code>` and is honoured only if that code belongs to an ACTIVE campaign attached to the form. | No internal ids or personal data in URLs; forwarded invitations are treated as a hint, not identity. |
| D8 | **Review-first CRM**: submissions never silently create or overwrite CRM records. Mapping proposes; staff confirm. The only automatic CRM writes are opt-in automations defined on the form, executed server-side, idempotent per `(response, action)` and never overwriting non-empty values. | Required by §11 of the brief. |
| D9 | **Visits** reuse the existing `task` with `taskType = VISIT`. Two fields are added to `task`: `visitOutcome` (SELECT) and `surveyCampaign` (relation). A failed visit is a DONE visit task with an outcome and **no response**. `buyingInterest` lives on the response. | Reuses the existing visit/activity model and keeps outcome separate from interest. |
| D10 | **Offline:** no sync. The collector keeps a device-local draft (localStorage) and labels it "saved on this device only — not sent" until the server confirms. | Offline sync does not exist; we do not pretend it does. |
| D11 | **Print** = a dedicated A4 print document opened in a print window (`window.print()` → vector PDF, same approach as the sales-order print path), using CSS paged media for page numbers. | Vector, searchable, reliable in Chromium; no server PDF renderer to operate. |
| D12 | The Sales App UI stays Dari-only (house rule). **Form content** is multilingual: each form declares languages (`fa`, `ps`, `en`), and every text has per-language values. Public respondents can switch language; direction follows the language (`fa`/`ps` RTL, `en` LTR) and user text uses `dir="auto"`. | Matches existing localisation; fulfils "translation values" and mixed-direction content. |

## 3. Data model (custom objects)

All created by `provision-surveys.mjs` (idempotent, `TWENTY_TOKEN` auth, same
helpers as the other provisioners). Relations are MANY_TO_ONE unless noted.

### surveyForm
`name` (title, TEXT), `status` SELECT DRAFT·PUBLISHED·CLOSED·ARCHIVED,
`purpose` SELECT FIELD_SURVEY·DEMO_REQUEST·FEEDBACK·QUALIFICATION·OTHER,
`owner` → workspaceMember, `draftDefinition` RAW_JSON, `draftRevision` NUMBER
(optimistic-concurrency counter for autosave), `draftUpdatedAt` DATE_TIME,
`publishedVersion` → surveyFormVersion, `currentVersionNumber` NUMBER,
`hasUnpublishedChanges` BOOLEAN, `publicSlug` TEXT (unique),
`publicEnabled` BOOLEAN, `opensAt` / `closesAt` DATE_TIME,
`responseLimit` NUMBER, `campaignIds` RAW_JSON (list of campaign ids).

### surveyFormVersion (immutable)
`form` → surveyForm, `versionNumber` NUMBER, `definition` RAW_JSON (full
frozen snapshot incl. labels, choices, translations, logic, mapping,
automations, appearance), `publishedAt` DATE_TIME, `publishedBy` →
workspaceMember, `changeNote` TEXT, `printCode` TEXT (e.g. `F7K2-v3`, printed on
paper).

### surveyResponse
- Identity: `form` → surveyForm, `formVersion` → surveyFormVersion,
  `versionNumber` NUMBER, `submissionKey` TEXT **unique** (client-generated
  UUID; idempotency).
- Content: `answers` RAW_JSON `{[questionId]: value}`, `skippedByLogic`
  RAW_JSON `string[]`, `language` TEXT.
- Status: `completionStatus` SELECT PARTIAL·COMPLETED; `reviewStatus` SELECT
  NEW·NEEDS_REVIEW·REVIEWED·ACTIONED·SPAM (kept separate on purpose).
- Channel: `source` SELECT PUBLIC_LINK·INVITATION·STAFF_VISIT·PAPER.
- Dates: `collectedAt` (when the respondent answered / paper was filled),
  `submittedAt` (when it reached the server), `enteredAt` (paper transcription).
- People: `collector` → workspaceMember, `enteredBy` → workspaceMember.
- Paper: `paperReference` TEXT (sheet reference; unique per form, checked in
  the hook), `paperReviewNotes` TEXT (illegible / unclear answers).
- Field data: `buyingInterest` SELECT INTERESTED·UNDECIDED·NOT_INTERESTED,
  `city` TEXT, `area` TEXT, `location` RAW_JSON `{lat,lng,accuracy,source:'GPS'|'MANUAL'}`.
- CRM links: `company`, `person`, `opportunity`, `campaign` → surveyCampaign,
  `visit` → task, `invitation` → surveyInvitation.
- CRM action log: `crmActions` RAW_JSON — append-only list
  `{key, type, recordId, at, by, status, error?}`; `key` makes every action
  idempotent.
- Auto relations (Twenty default): notes (internal notes), tasks
  (follow-ups), attachments (scans/photos/uploads), timeline (audit history).

### surveyCampaign
`name`, `description` TEXT, `status` SELECT PLANNED·ACTIVE·COMPLETED·CANCELLED,
`startsAt` / `endsAt` DATE_TIME, `city` TEXT, `areas` RAW_JSON `string[]`,
`assigneeIds` RAW_JSON `string[]` (workspace members), `targetResponses`
NUMBER, `channels` MULTI_SELECT PUBLIC_LINK·STAFF_VISIT·PAPER·INVITATION,
`publicCode` TEXT (unique, opaque, for `&c=`), `formIds` RAW_JSON.

### surveyInvitation
`form` → surveyForm, `campaign` → surveyCampaign, `company`, `person`,
`opportunity` (intended recipient — *suggestion only*), `tokenHash` TEXT
(unique), `status` SELECT ACTIVE·USED·REVOKED, `expiresAt`, `usedAt`,
`label` TEXT.

### Additions to existing objects
`task.visitOutcome` SELECT COMPLETED·BUSINESS_CLOSED·MANAGER_UNAVAILABLE·DECLINED·REVISIT_NEEDED;
`task.surveyCampaign` → surveyCampaign.

## 4. Form definition schema (`twenty-shared/surveys`)

```ts
type LocalizedText = Partial<Record<'fa' | 'ps' | 'en', string>>;

type FormDefinition = {
  schemaVersion: 1;
  languages: FormLanguage[];           // first = default
  presentation: 'ALL_ON_PAGE' | 'ONE_QUESTION';
  welcome?: { title: LocalizedText; body: LocalizedText; buttonLabel?: LocalizedText };
  pages: FormPage[];                   // ≥1; single-page form = one page
  endings: FormEnding[];               // ≥1; first ending with no condition = default
  appearance: { accent: string; logoFileId?: string; showProgress: boolean; };
  crmMapping: CrmMappingRule[];
  automations: AutomationRule[];
};

type FormPage = { id: string; title: LocalizedText; description?: LocalizedText;
  items: FormItem[]; jumps: PageJump[]; };        // items = questions, sections, display blocks

type FormItem = Question | SectionBlock | DisplayBlock;
type SectionBlock = { kind: 'section'; id; title; description?; visibleWhen?: ConditionGroup };
type DisplayBlock = { kind: 'heading' | 'paragraph' | 'image' | 'divider'; id; text?; fileId?; };

type Question = { kind: 'question'; id: string; type: QuestionType;
  label: LocalizedText; description?: LocalizedText; placeholder?: LocalizedText;
  required: boolean; audience: 'ALL' | 'STAFF_ONLY';
  visibleWhen?: ConditionGroup; requiredWhen?: ConditionGroup;
  config: QuestionConfig;              // per-type: choices, allowOther, min/max, minLength/maxLength,
                                       // minSelected/maxSelected, scale, fileTypes, maxFileMb, defaultValue
  validationMessage?: LocalizedText;
  print: { answerLines: number };      // writing space on paper
};

type QuestionType = 'short_text' | 'long_text' | 'number' | 'email' | 'phone' | 'website'
  | 'single_choice' | 'multi_choice' | 'dropdown' | 'yes_no' | 'date' | 'time' | 'datetime'
  | 'rating' | 'opinion_scale' | 'address' | 'location' | 'file' | 'consent'
  | 'crm_company' | 'crm_contact' | 'crm_lead';   // crm_* are forced STAFF_ONLY

type ConditionGroup = { mode: 'ALL' | 'ANY'; conditions: Condition[] };
type Condition = { questionId: string;
  op: 'answered' | 'not_answered' | 'eq' | 'neq' | 'includes' | 'excludes' | 'gt' | 'gte' | 'lt' | 'lte';
  value?: string | number | boolean };   // choice ids for choice types
type PageJump = { id: string; when: ConditionGroup; to: { pageId: string } | { end: string /* endingId */ } };
type FormEnding = { id: string; when?: ConditionGroup; title: LocalizedText; message: LocalizedText };
```

### Engine API (all pure, all unit-tested)

| Function | Used by |
|---|---|
| `evaluateForm(def, answers, { audience })` → `{ visibleItemIds, requiredIds, pagePath, skippedByLogic, ending }` | renderer (every answer change), print of completed response, server |
| `validateResponse(def, answers, { audience, mode: 'PARTIAL' \| 'COMPLETE' })` → `{ cleanAnswers, skippedByLogic, errors[{questionId, code, message}] }` | client submit, query hook, public endpoint |
| `validateForPublish(def)` → `{ errors, warnings }` — broken refs, backward refs/jumps (loops), duplicate ids, empty choice lists, contradictory jumps (same condition → different targets; unconditional jump followed by more jumps), unsatisfiable required questions (e.g. `eq A AND eq B` on single choice), required questions on unreachable pages, public-visible logic depending on staff-only questions, endings unreachable | publish button (client) and publish endpoint (server) |
| `toPublicDefinition(def)` — removes STAFF_ONLY + crm_* items, their rules, `crmMapping`, `automations` | public GET endpoint only |
| `analysePrintability(def, { audience })` → `{ blockers, notes, instructions: Map<itemId, string> }` — human-readable skip text per item/page, paper alternatives for digital-only types | print preview + print |
| `proposeCrmChanges(def, cleanAnswers, existing)` → field proposals with `{target, field, current, proposed, action: 'fill' \| 'conflict' \| 'same' \| 'skip-blank'}` | review-first mapping UI, automations |

Condition semantics: a condition on a hidden question evaluates as if the
question were unanswered. Requiredness applies only to visible questions.
`skippedByLogic` = questions in the version that were not visible at submit
time (on skipped pages or hidden by `visibleWhen`). Insights therefore
distinguish *answered*, *unanswered (visible, left blank)*, *skipped by logic*
and *not in this version*.

## 5. Server module `modules/sales-crm/surveys/`

Wired into `CoreEngineModule` next to `TaskUploadModule`; imports
`PermissionsModule`, `TokenModule`, `ThrottlerModule`, `FilesFieldModule`,
`WorkspaceDomainsModule` (lesson from the task-upload crash-loop: every guard's
dependencies must be imported). Boot is verified, not just `tsc`.

**Authenticated** (`@Controller('rest/sales/surveys')`, `JwtAuthGuard` + `WorkspaceAuthGuard`):
- `GET capabilities` → `{canBuild, canPublish, canManageCampaigns, canCollect,
  canViewTeamResponses, canEditResponses, canExport, canLinkCrm}` derived from
  the caller's role object permissions (see §8). The UI renders from this.
- `POST forms/:id/publish {expectedDraftRevision, changeNote}` → runs
  `validateForPublish`; on success creates `surveyFormVersion` (bypass write),
  sets form `status=PUBLISHED`, `publishedVersion`, `currentVersionNumber`,
  `hasUnpublishedChanges=false`, generates `publicSlug` on first publish.
  Stale revision → 409.
- `POST forms/:id/status {status: CLOSED|PUBLISHED|ARCHIVED}` (reopen/close/archive).
- `POST forms/:id/invitations {count|targets[], expiresAt, campaignId}` → returns
  the plain URLs once; only hashes are stored.
- `POST responses/:id/automations/retry` → re-runs failed automation actions
  (idempotent keys).

**Public** (`@Controller('public/forms')`, `PublicEndpointGuard`):
- `GET :slug?origin=&i=&c=` → `{ state: 'OPEN'|'NOT_YET_OPEN'|'CLOSED'|'EXPIRED'|'LIMIT_REACHED'|'INVALID', form: {title, versionNumber, definition: toPublicDefinition(...)} }`.
  Invalid invitation → `INVALID`; used invitation → `CLOSED` with message.
- `POST :slug/uploads` (multipart) → validates field exists in the public
  definition and is `file`, MIME allowlist + per-field size ≤ server ceiling
  (10 MB), stores via `FilesFieldService`, returns a 30-min signed upload
  ref (JWT type `SURVEY_UPLOAD` bound to slug + submissionKey + questionId).
- `POST :slug/submissions {submissionKey, versionNumber, answers, language,
  inviteToken?, campaignCode?, startedAt, website /*honeypot*/}` →
  1. throttle: `survey:<ws>:<slug>:<ip>` 5/10 min and `survey:<ws>:<slug>` 120/min;
  2. honeypot filled or filled in < 3 s → 200 `{ok:true}` but stored as SPAM
     (bots get no signal);
  3. state checks (open, not expired, under limit, invitation active);
  4. **idempotency**: existing response with the same `submissionKey` →
     return its result unchanged (no second record, no second automation);
  5. `validateResponse(version, answers, {audience:'PUBLIC', mode:'COMPLETE'})`;
     errors → 422 with per-question messages (client keeps answers);
  6. insert response (bypass write, `source`, `campaign` only if valid code,
     `invitation` + intended records as *suggestions* in `crmActions`, reviewStatus NEEDS_REVIEW when invited),
     attach verified upload refs as attachments;
  7. run automations (if any) idempotently; failures recorded in `crmActions`
     with status FAILED, never fail the submission.
  Response body: `{ ok, ending: {title, message} }` — no ids.

**Query hooks** (`SalesCrmQueryHookModule` pattern, PRE):
- `surveyFormVersion.*` create/update/delete via record API → rejected
  (versions are written only by the publish endpoint).
- `surveyForm.update` → rejects changes to `status`, `publishedVersionId`,
  `currentVersionNumber`, `publicSlug` (endpoint-only); rejects
  `draftDefinition` writes whose `draftRevision` isn't current+1 (autosave
  conflict detection → client shows "edited elsewhere, reload").
- `surveyResponse.create/update` → loads the version, runs `validateResponse`
  (`STAFF` audience, mode from `completionStatus`), replaces `answers` with
  `cleanAnswers`, sets `skippedByLogic`; COMPLETED with errors → rejected.
  Checks `paperReference` uniqueness per form. `submissionKey` duplicate →
  unique-constraint error, which the client treats as "already saved" and
  re-reads.

**Soft delete only.** Forms with responses cannot be destroyed (no-hard-delete
policy already denies `destroy`); the UI offers Archive, and soft delete of a
form with responses is rejected by the hook with "archive instead".

## 6. Sales App

New nav entry `forms` (فرم‌ها و نظرسنجی) and `campaigns` (کمپاین‌ها); routes:

| Route | View |
|---|---|
| `#/forms` | list: search, filters (status, owner, purpose, campaign), sort, card/table toggle; row actions create/edit/preview/duplicate/share/print/responses/close/archive |
| `#/forms/new` | template gallery (blank + 4 starters) |
| `#/form/:id/:tab` | workspace, tabs: builder · logic · appearance · crm · settings · share · responses · insights. Header shows status, version, "unpublished changes", autosave state (saving / saved / error+retry), Preview and Publish buttons — the build → preview → publish → share → review path is the header's left-to-right order. |
| `#/form/:id/preview?device=&mode=online\|print&version=` | sandboxed preview (draft or any version); submissions go nowhere (no network call exists in preview mode) |
| `#/form/:id/collect` | staff entry during a visit (mobile-first stepper) |
| `#/form/:id/paper` | paper entry |
| `#/form/:id/print?version=&copies=&sheetRefs=` | print document |
| `#/response/:id` (+ `/print`) | response detail |
| `#/responses` | cross-form response table |
| `#/campaigns`, `#/campaign/:id` | campaigns |
| `#/visit` | field flow entry: find/add business → pick survey → collect → outcome |
| `#/f/:slug` | **public** form, intercepted before the auth gate like `#/upload` |

**Builder.** Three columns on desktop (palette · canvas · inspector), single
column + bottom-sheet inspector on mobile. Canvas shows pages as stacked
cards; items reorder by native drag-and-drop on desktop and ↑/↓ buttons
everywhere (keyboard-accessible, `aria-label`ed). Add / duplicate / delete
for items and pages (duplicate issues new ids). Inspector edits the selected
question/section/page, including per-language text (tabs per form language),
audience, print answer space. Autosave: 1.2 s debounce, `draftRevision`
concurrency, status pill. Logic tab: per-question "show when / required when"
builders and per-page "after this page, jump to…" rules in plain Dari
sentences (ALL/ANY), with live `validateForPublish` issues listed and clickable.

**Renderer** (`components/forms/FormRenderer.tsx`) — one component for
preview, public, staff and paper modes; props decide audience, whether
submit is live, and which chrome shows. Welcome screen, pages with progress,
optional one-question-at-a-time, prev/next, per-question errors with
`aria-describedby`, focus moves to the first error, endings.

**Public page.** No app shell, no auth, language switcher, readable closed /
expired / invalid / error states, answers persisted in `sessionStorage` per
slug so a failed submit or reload doesn't lose them, the submit button is
disabled in-flight and the `submissionKey` is reused on retry (double-click
and retry-safe).

**Staff visit flow** (`#/visit`): 1) search company (existing search +
duplicate warning) or quick-add prospect; 2) pick a published form (or "no
survey — record outcome only"); 3) renderer in STAFF mode with CRM fields
prefilled from the chosen company; optional GPS capture button (permission
prompt only on tap; manual lat/lng/address fallback); 4) visit outcome +
buying interest; 5) save → creates the DONE VISIT task (with outcome,
campaign) and, if a survey was collected, the response linked to it; 6) next
actions: link/create lead, schedule follow-up (existing task drawer).
Device-local draft between steps with an explicit "only on this device" badge.

**Paper entry** (`#/form/:id/paper`): choose version (defaults to the one
matching the printed code, e.g. typed `F7K2-v3`), collection date (Jalali
picker), collector, paper reference (duplicate warning live), entered-by is
the signed-in user. Same renderer in PAPER mode: "unclear/illegible" toggle per
question (answer left empty, noted in `paperReviewNotes`), save as PARTIAL any
time, COMPLETE only when validation passes. Attach scans via the existing
upload modal.

**Print.** `analysePrintability` drives it: numbered questions, ☐ boxes for
choices, lined writing space per `print.answerLines`, skip instructions ("If
you answered «No» to question 4, go to question 7"), paper alternatives
(file → "attach/staple a photo", location → "write the address", crm fields →
"business name / contact name"), logo, title, instructions, optional campaign
block, version code on every page footer, `Page n of m`, optional sheet
reference box (pre-numbered when printing N copies), optional QR to the
online form (rendered on-device). Blockers (e.g. a rule depending on an
answer that has no paper representation) show an actionable message and
disable Print. Completed responses print the same layout with answers filled.

**Responses & detail.** Table with configurable answer columns (persisted per
form), filters (form/version, campaign, date range, source, collector, city,
area, completion, review, CRM linkage), CSV + XLSX export of the filtered set
(cells beginning with `= + - @ \t \r` are prefixed with `'`; XLSX via
lazy-loaded `write-excel-file`). Detail: answers grouped by original
pages/sections from **the response's version**, metadata block, linked records,
review status, notes, attachments, `RecordHistory` timeline, CRM panel:
suggestions (duplicates API: phone/email/name), "link existing", "create
company/contact/lead" with a proposed-changes diff from `proposeCrmChanges`
(fill empty fields only; conflicts shown, never auto-applied; blanks never
clear), follow-up task, corrections (edits go through the same hook; history
records them).

**CRM detail pages.** Company, contact and lead pages get a "Surveys" card
listing linked responses.

**Insights.** Per form (and per campaign): completed by channel, responses
over time, per-question distributions (choice counts with the version's
labels, numeric min/median/mean/max), answered vs unanswered vs skipped-by-logic
counts, activity by campaign/collector/area, and outcomes: **unique** leads
linked (distinct `opportunityId`), their stage distribution, visit outcomes.
Every rate shows its denominator ("12 of 40 completed responses").

**Campaigns.** List + detail: fields from §3, attached forms and channels,
progress vs target, responses, visits by outcome, unique qualified leads,
follow-up tasks done/open.

## 7. Templates

Shipped as definitions in `packages/twenty-sales-app/src/lib/forms/templates.ts`,
copied into a new draft (fully editable): City business survey (3 pages,
software-use branching from the brief's example, CRM mapping business name →
company.name, phone → person.phones), Pharmacy software needs (pages, module
interest → lead note, follow-up preference), Demo request (single page,
one-question-at-a-time, creates-lead automation off by default), Customer
satisfaction (rating + NPS scale + conditional "what went wrong").

## 8. Permissions

Twenty object permissions are the source of truth; the capabilities endpoint
translates them:

| Capability | Twenty permission |
|---|---|
| build / edit forms | update `surveyForm` |
| publish / close | update `surveyFormVersion` (granted only to managers/admins) |
| manage campaigns | update `surveyCampaign` |
| collect responses | update (create) `surveyResponse` |
| team vs own responses | owner-scoping: add `surveyResponse: [collector, enteredBy]` to `OWNER_SCOPED_OBJECTS` — owner-scoped roles see only their own |
| edit responses | update `surveyResponse` |
| export | `EXPORT_CSV` permission flag |
| link / create CRM | update on company / person / opportunity |

Provisioning grants: Admin/Member all; Seller: read forms/versions/campaigns,
read+update responses and invitations; Marketer/Partner (owner-scoped): read
forms/versions/campaigns, read+update own responses. Nobody gets destroy.
Public submission uses a system auth context scoped to the resolved workspace
and never returns CRM data.

## 9. Security checklist

Tenant: workspace from origin; slug/code/token lookups filtered by that
workspace. Payload: public GET returns `toPublicDefinition` only (staff and
crm_* removed server-side). IDs: none in public URLs or responses. Inputs:
answers size-capped (256 KB body, 10 k chars per text), unknown question ids
dropped, types coerced/validated by the engine. Spam: throttle + honeypot +
min-fill-time. Uploads: allowlist, size cap, magic-byte check already in
`FilesFieldService`, attachment reads stay behind auth (signed URLs).
Output: React escaping; print document built with DOM text nodes, no
`innerHTML` of user content; paragraph blocks are plain text. Export: formula
injection guard. Preview: renderer receives `submit=null` — there is no code
path from preview to the network.

## 10. Republishing behaviour (shown in the Publish dialog)

- Public links always serve the **latest published version**.
- A respondent who opened v2 and submits after v3 is published: the server
  validates against the version they loaded (`versionNumber` in the payload)
  as long as the form is still open. Nothing in progress is lost.
- Printed copies carry their version code; paper entry picks that version.
- Reports span versions by question id; questions missing from a version are
  counted as "not in version", never as unanswered.

## 11. Delivery plan (each milestone = PR, merged after review)

1. **Engine + data**: `twenty-shared/surveys` with tests; `provision-surveys.mjs`.
2. **Server**: capabilities, publish/status, public GET/POST/uploads, hooks,
   owner-scope entry, invitations, automations; unit + integration tests.
3. **Builder**: forms list, templates, workspace tabs builder/logic/appearance/settings, autosave, preview, publish UI.
4. **Collection**: public page, staff visit flow, paper entry, print.
5. **Responses**: table, detail, CRM review/link/create, follow-ups, notes,
   attachments, history, export, CRM detail-page cards.
6. **Campaigns + insights + share tab** (link, QR, invitations).

Verification per milestone: vitest/jest for pure logic; server boot check;
local dev E2E in the browser (tim@apple.dev on the local stack) covering the
11 acceptance scenarios, including failure states (closed form, retry,
double-click, invalid token, staff-field leak probe via raw `curl`, RTL, A4
print preview).

## 12. Out of scope / genuine limitations

OCR; offline sync; e-signatures; payment fields; arbitrary JS/regex
validation; email/SMS sending of invitations (links are copied/shared by
staff; WhatsApp share uses the existing send channel where configured).
