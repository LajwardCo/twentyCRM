# Surveys & Forms — operator guide

Design and rationale: `docs/superpowers/specs/2026-09-26-surveys-forms-design.md`.

## What exists

| Piece | Where |
|---|---|
| Form engine (logic, validation, publish checks, print analysis, CRM proposals) | `packages/twenty-shared/src/surveys` (`twenty-shared/surveys`, `@shared/surveys` in the Sales App) |
| Server endpoints + record-API guards | `packages/twenty-server/src/modules/sales-crm/surveys` |
| Objects, relations, role grants | `tools/sales-crm/provision-surveys.mjs` |
| Screens | `packages/twenty-sales-app/src/views/forms`, `components/forms`, `lib/forms` |

Routes in the Sales App: `#/forms`, `#/forms/new`, `#/form/<id>/<tab>`, `#/form/<id>/preview`, `#/form/<id>/print`, `#/form/<id>/collect`, `#/form/<id>/paper`, `#/paper`, `#/visit`, `#/responses`, `#/response/<id>`, `#/campaigns`, `#/campaign/<id>`, and the login-free `#/f/<code>`.

## Deploying

1. Merge to `main`. `deploy-hamagan-crm.yaml` ships the server image (it contains the survey module and the hooks); `deploy-hamagan-sales-app.yaml` ships the screens.
2. **After the server is live**, provision the objects:

   ```bash
   TWENTY_META=https://crm.hamagan.com/metadata TWENTY_ORIGIN=https://crm.hamagan.com \
   TWENTY_TOKEN='<api key>' node tools/sales-crm/provision-surveys.mjs
   ```

   Order matters: without the server module the version and response guards do not exist, so objects must not appear before the code that protects them. Re-running is safe.
3. Until provisioning runs, the Surveys screens say so and the public endpoints answer "invalid link".

## Who can do what

Survey permissions are ordinary object permissions on the Roles screen:

| Capability | Granted by |
|---|---|
| See forms | read `Survey Form` |
| Build / edit forms, CRM mapping, automations | update `Survey Form` |
| Publish, close, reopen, archive | update `Survey Form` **and** update `Survey Form Version` |
| Manage campaigns | update `Survey Campaign` |
| Collect responses (visit, paper) | read `Survey Form` + update `Survey Response` |
| Create invitation links | update `Survey Invitation` |
| Edit / review responses | update `Survey Response` |
| Export | read `Survey Response` + the Export CSV permission |

Provisioned defaults: Admin and Member have everything. Seller reads forms and campaigns and collects, edits and invites. Marketer and Partner read forms and collect, and they only ever see the responses they collected or typed in themselves (owner scoping). No role can hard-delete. A form that has responses cannot be deleted at all; archive it instead.

## Behaviour to know

- **Drafts vs versions.** Editing never changes a live form. Autosave claims each draft revision with a conditional update, so two editors never silently overwrite each other. Publishing claims the next version number the same way. Publishing snapshots the draft as an immutable version (`F<code>-v<n>` is printed on paper). Only the publish endpoint writes versions; the record API refuses them.
- **Republishing.** Public links always open the newest version. Someone who started on v2 can still submit v2 after v3 is published, as long as the form is open. Paper entry picks the version from the printed code. Reports group answers by question id across versions, and a question missing from a version counts as "not in version", never as unanswered.
- **Hidden answers.** If a question becomes hidden, its answer is kept while the person is filling in the form, so toggling back restores it. On save, the answer is discarded and the question id is recorded in `skippedByLogic`, both in the browser and again on the server. Discarded answers never reach CRM mapping, automations, exports or insights.
- **Required.** Only visible questions can be required. A COMPLETED response has passed full validation; PARTIAL responses are allowed to be incomplete.
- **Public submissions.** Each submission carries a client-generated key. A retry or double-click returns the original result and creates nothing new. A retry after a failure that happened once the response was saved also finishes whatever step was left: attachments and automations.
  - **Rate limits:** 20 per 10 minutes per address per form, 60 per 10 minutes per address overall, and 120 per minute per form. Uploads allow 20 per 10 minutes per address, 200 per 10 minutes per form and 1000 per hour per workspace. The per-address limits are generous because mobile carriers share addresses.
  - **Client address:** it comes from Express `request.ip`, which honours `TRUST_PROXY` (by default only local and private proxies are trusted). nginx must pass `X-Forwarded-For $proxy_add_x_forwarded_for` so the real client is the right-most entry. The left-most entry is written by the client and is never trusted.
  - **Spam:** a hidden honeypot field or a fill time under 3 seconds, measured on the device, stores the response as spam without telling the sender. Spam never uses up an invitation.
  - **Uploads:** the file type is checked from the file's bytes, not from the type the browser declares.
  - **What respondents never receive:** staff-only questions and CRM pickers are removed on the server, and responses contain no record ids.
- **Invitations.** Each invitation is a 32-byte token; only its SHA-256 hash is stored, and the link is shown once. An invitation is claimed atomically before the response is stored, so concurrent submissions cannot both use it. A forwarded link does not prove who answered, so invited responses arrive as "needs review" with the intended records as suggestions, not links.
- **Campaign codes.** `&c=<code>` counts only for an ACTIVE campaign that lists the form. Anything else in the URL is ignored.
- **CRM.** Review-first. Staff pick or create records, then see a proposed-changes table: empty CRM fields can be filled, conflicting values need an explicit choice, and blank answers never clear anything. Records are never merged because names match. Automations (create lead, create task, notify) are off unless enabled on the form. Each runs at most once per response, and failures are recorded and can be retried.
- **Offline.** There is no offline sync. The visit and paper screens keep a draft on the device, per signed-in user, and label it "saved on this device only" until the server confirms. Drafts are deleted at sign-out and when the session expires. A draft started on an older version continues on that version after a republish.
- **Printing.** A4 through the browser's print dialog (vector PDF). Conditional questions are printed with written skip instructions. If a rule cannot be expressed on paper, printing is blocked and the reason is shown.

## Known limitations

No OCR, e-signatures, payment fields, custom regex validation or offline sync. Invitations are not sent by email or SMS: staff copy the link or use the WhatsApp share. Pashto skip instructions and respondent chrome use Dari wording until reviewed Pashto copy exists.
