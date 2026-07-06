# Sales Team SPA ("Hamagan Sales") — Design

Date: 2026-07-06
Status: Approved approach (built same-session per rashid's standing "make judgment
calls and proceed" preference; review happens on the running app).

## Problem

Twenty's full UI is too heavy for the field sales team. Registering one new lead
today takes ~7 manual steps across 4 objects (opportunity, company, person,
tasks, notes). Sellers need: one-page lead registration, a "Today Todo"
dashboard, one-page lead view with all notes/history, direct contact actions
(call / SMS / email / WhatsApp), and AI actions (summarize, call script, chat
about the lead). ~99% of leads are brand-new companies, so "create everything
fresh" is the hot path.

## Approach chosen

A standalone mobile-first SPA at `packages/twenty-sales-app` (Vite + React 19,
zero UI-framework dependencies, tiny hash router), talking directly to the
existing Twenty APIs. No server changes required.

Alternatives rejected:
- New routes inside twenty-front: entangles with a 1M-LOC app, slow builds,
  hard to keep "simple"; sellers would still load the heavy bundle.
- Separate backend/BFF: nothing needs server-side state; Twenty's GraphQL is
  sufficient and permission-aware.

## Serving / CORS

twenty-server allows same-origin requests only (`main.ts` cors config has no
origin whitelist). The SPA is therefore served under the SAME domain as the
CRM at the path `/sales/` (vite `base: '/sales/'`):
- Dev: vite dev server on :3012 proxies `/graphql`, `/metadata`, `/rest` to
  localhost:3010.
- Prod (crm.hamagan.com): static `dist/` mounted at `/sales/` in the existing
  reverse proxy on hamagan-management. Deploy handled via the hamagan-devops
  runbook.

## Auth

Twenty's credential flow on `/graphql`: `getLoginTokenFromCredentials(email,
password, origin)` → `getAuthTokensFromLoginToken(loginToken, origin)` →
store `{accessOrWorkspaceAgnosticToken, refreshToken}` in localStorage;
auto-renew via `renewToken(appToken)` on UNAUTHENTICATED, then retry once.
Each seller signs in with their own CRM account, so record permissions and
`createdBy` attribution stay correct.

## Data model mapping (a "Lead" = an Opportunity)

One-page New Lead form writes, in order:
1. `createCompany` {name}
2. `createPerson` {name, phones.primaryPhoneNumber, emails.primaryEmail, companyId}
3. `createOpportunity` {name = company name, companyId, pointOfContactId,
   stage NEW_LEAD, temperature HOT|WARM|COLD, leadSource, ownerId = me}
4. First contact: `createTask` {title, bodyV2.markdown, status DONE, dueAt,
   assigneeId me} + `createTaskTarget` {taskId, targetOpportunityId,
   targetCompanyId}
5. Same note also saved as `createNote` + `createNoteTarget` (notes page shows
   everything in one place)
6. Follow-up: `createTask` {status TODO, dueAt} + target — feeds Today Todo.

Custom-field values match the provisioned prod config (`tools/sales-crm/`):
stage enum NEW_LEAD…LOST_MISSED, temperature HOT/WARM/COLD, leadSource
FIELD/WHATSAPP/TELEGRAM/FACEBOOK/REFERRAL/OTHER. Fields that exist only in
prod (e.g. `company.businessType`) are NOT used, so the app runs identically
on dev and prod.

## Views

- **Login** — email/password.
- **Today** (default tab) — my open tasks split Overdue / Today / Upcoming
  (limit), each row shows its lead, one-tap mark-done, tap-through to lead.
- **Leads** — searchable list (server-side `ilike`), My/All toggle, stage +
  temperature badges.
- **New Lead** — the one-page form above; sticky submit; ~20 seconds to enter.
- **Lead detail** — header (stage/temperature quick-edit), action grid
  (Call `tel:`, SMS `sms:`, Email `mailto:`, WhatsApp → existing
  `sendWhatsappMessage` mutation on `/metadata` with template/text modal),
  AI buttons (Summarize / Call Script), timeline of tasks + notes in one
  stream, quick "add note" and "add follow-up" inline forms.
- **Lead chat** — free-form AI chat about this lead.

## AI integration

- **Summarize / Call script buttons:** `POST /rest/ai/generate-text`
  (synchronous, no thread) with a prompt composed client-side from the loaded
  lead data (company, contact, stage, temperature, source, full task/note
  history). Output rendered in a card, copyable.
- **Chat about this lead:** the agent-chat API on `/graphql` —
  `createChatThread`, `sendChatMessage(threadId, text, messageId,
  browsingContext: {type:'recordPage', objectNameSingular:'opportunity',
  recordId})`, then **poll `chatMessages(threadId)`** (1.5s) until the
  assistant reply lands. Polling instead of the GraphQL-WS subscription keeps
  the app dependency-free and proxy-friendly; can upgrade to streaming later.
- Requires an AI provider configured on the instance and the member's role to
  have the AI permission flag.

## Error handling

Single error banner pattern per view; the New Lead form reports which step
failed and keeps entered data; token expiry auto-renews then logs out to the
login screen on failure. All writes are sequential awaits (rate limit safe:
one lead ≈ 7 requests, well under 100/60s).

## Testing

Manual E2E against the local dev stack (server :3010, seeded workspace) via
vite dev proxy; verify: login, lead creation writes all 6 records correctly
(read back via API), Today list filters, mark-done, WhatsApp mutation wiring
(expected to fail gracefully without Meta credentials locally), AI buttons
(graceful error if no provider configured locally).
