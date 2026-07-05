# WhatsApp Send Message — Design

Date: 2026-07-05
Status: Approved approach (B), pending spec review
Owner: rashid

## Goal

Let sellers send WhatsApp messages (offers, social media links, event invites) to
leads/opportunities directly from the CRM, alongside the existing email channel.
SMS joins later as a sibling channel. V1 scope: **manual send from a record page**
(Person, and the Lead/Deal it hangs off). Workflow-triggered sends are phase 2.

## Decisions already made

- **Provider:** Meta WhatsApp Business Cloud API (official Graph API), not Twilio,
  not a linked-device gateway.
- **Architecture:** self-contained channel module under `sales-crm`, NOT a deep
  integration into Twenty's ConnectedAccount/message-sync stack (Approach B).
  Rationale: the core messaging stack is built around OAuth'd mailbox sync; the
  Cloud API is a token-authenticated REST call. Staying inside `sales-crm` keeps
  upstream merges clean, matches every other customization in this fork, and
  still leaves room to promote it later.
- **V1 sends only.** Inbound replies, delivery webhooks, and the 24-hour-window
  tracker are explicitly out of scope (see Limitations).

## Meta Cloud API facts the design must respect

- Send endpoint: `POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages`
  with `Authorization: Bearer {ACCESS_TOKEN}`.
- **Business-initiated messages must use pre-approved templates** (created in Meta
  Business Manager). Free-form text is only deliverable within 24h of the
  customer's last inbound message. Since v1 has no inbound tracking, the UI
  defaults to templates; free text is allowed but may fail with Meta error
  131047 (re-engagement required), which we surface clearly.
- Templates are fetched live from
  `GET /{WABA_ID}/message_templates` — no local template sync/drift.
- Recipient must be an E.164 phone number.

## Configuration

Three server env vars (single-workspace deployment, same treatment as other
secrets in `.env`):

```
WHATSAPP_ACCESS_TOKEN=      # permanent System User token
WHATSAPP_PHONE_NUMBER_ID=   # sender number id
WHATSAPP_BUSINESS_ACCOUNT_ID=  # WABA id, for template listing
```

If unset, the resolver returns a clear "WhatsApp is not configured" error and the
frontend hides/disables the action.

## Data model (provisioned, not migrated)

One new custom object, created by `tools/sales-crm/provision-whatsapp.mjs`
following the exact pattern of `provision-discount-bundle-rules.mjs`
(idempotent, metadata GraphQL API, non-fatal per item):

**`whatsappMessage`** (label "WhatsApp Message", icon IconBrandWhatsapp)
- `direction` SELECT: OUTBOUND (INBOUND reserved for phase 2+)
- `status` SELECT: SENT, FAILED
- `toPhone` TEXT — E.164 number actually used
- `body` TEXT — rendered text, or template name + variables summary
- `templateName` TEXT (empty for free text)
- `waMessageId` TEXT — Meta's message id (`wamid.…`), for future status webhooks
- `errorMessage` TEXT — Meta error on failure
- relation MANY_TO_ONE → `person`
- relation MANY_TO_ONE → `deal` (optional; set when sent from a deal context)

Because it's a normal related object, sends show up on the Person/Deal record
page automatically via the relation section — no timeline plumbing needed.

No local template object: templates are read live from Meta.

## Backend

New directory `packages/twenty-server/src/modules/sales-crm/whatsapp/`:

- `whatsapp.module.ts` — registered from the existing sales-crm module wiring.
- `services/whatsapp-cloud-api-client.service.ts` — thin HTTP client:
  `sendTemplate(to, name, language, bodyParams)`, `sendText(to, body)`,
  `listTemplates()`. Builds payloads, maps Meta error responses to typed errors.
  No business logic.
- `services/whatsapp-send-message.service.ts` — orchestrator:
  1. Load person via `TwentyORMManager` repository; resolve recipient phone:
     `whatsapp` PHONES field first, fall back to standard `phones`; compose
     E.164 from calling code + number; error if none.
  2. Call the client.
  3. Persist a `whatsappMessage` record (SENT with `waMessageId`, or FAILED
     with `errorMessage`) linked to person and optional deal.
- `resolvers/whatsapp.resolver.ts` — workspace-auth-guarded (same guards as
  `send-email.resolver.ts`):
  - mutation `sendWhatsappMessage(input: { personId, dealId?, templateName?,
    templateLanguage?, templateBodyParams?, text? })` → `{ success, waMessageId,
    error }`. Exactly one of template/text must be provided.
  - query `whatsappTemplates` → `[{ name, language, status, bodyText,
    variableCount }]` (only APPROVED templates), proxied from Meta.

A failed Meta call still records a FAILED `whatsappMessage` and returns
`success: false` with the human-readable reason — it does not throw a bare 500.

## Frontend

- New "Send WhatsApp" action on Person and Deal record pages, registered the
  same way the email/record actions are (record action registry / command menu),
  visible when the target person has any phone number.
- Opens a modal:
  - Mode toggle: **Template** (default) | Free text.
  - Template mode: dropdown populated from `whatsappTemplates`, one input per
    template variable, live preview of the rendered body.
  - Free-text mode: textarea + a static hint that delivery requires the contact
    to have messaged within 24h.
  - Send → mutation → success/error toast (Meta error text shown on failure).
- From a Deal page, the person picker defaults to the deal's linked contact.

## Error handling

| Failure | Behavior |
|---|---|
| Env vars missing | Resolver errors "not configured"; action disabled in UI |
| Person has no phone | Mutation returns error before calling Meta |
| Meta 131047 (outside 24h window) | FAILED record + toast: "Use an approved template — this contact hasn't messaged you in the last 24 hours." |
| Other Meta errors (invalid number, unregistered, rate limit) | FAILED record + Meta's message in toast |
| Template list fetch fails | Modal shows retry state; free-text mode still usable |

## Testing

- Unit tests (jest, server): payload builder for template/text messages; phone
  resolution + E.164 composition; send service persists SENT/FAILED correctly
  (Cloud API client mocked).
- Manual E2E on dev (ports 3010/3011) with a real test number before deploying
  to crm.hamagan.com.

## Phase 2+ (explicitly out of scope now)

- Workflow action `SEND_WHATSAPP` reusing `WhatsappSendMessageService`
  (factory registration in `workflow-action.factory.ts` + frontend action
  constant, per the mail-sender pattern).
- SMS channel as a sibling module reusing the same orchestrate-then-log shape.
- Inbound webhook receiver: replies, delivery/read status updates on
  `waMessageId`, and real 24-hour-window awareness.
- Bulk/campaign sends with queueing and opt-out handling.
