# Contact Request (Website Intake) — Design Spec

Date: 2026-07-03
Status: Approved, ready for implementation plan.
Builds on: [Twenty as a Sales-Management CRM](2026-07-01-twenty-sales-crm-design.md) (Phases 1–3, already live on crm.hamagan.com).

## Goal

Capture inbound website submissions (questions and demo requests) into Twenty via API,
auto-link them to the right Person, let a rep reply from inside Twenty with an
automatic email, and surface each request alongside the Opportunity ("lead") it
belongs to — without conflating this intake object with the existing Person contact
record.

## Why a separate object, not Person

Twenty already has a standard **Person** object, and Phase 1 of the sales-crm work
added `preferredContactMethod` to it. Person represents a CRM-owned contact; a website
submission is raw, unqualified intake that may or may not turn into a real contact or
a pipeline deal. Naming it **Contact Request** (not "Contact") avoids confusion with
Person and matches what it actually is.

## Data model

### Object: `Contact Request` (custom, metadata-provisioned)

Same provisioning pattern as Quotation/Subscription (`tools/sales-crm/*.mjs`) — no
custom TypeScript entity required.

| Field | Type | Notes |
|---|---|---|
| `fullName` | Text | Submitter's name |
| `email` | Text (required) | Used to find-or-create the linked Person |
| `phone` | Phone | Optional |
| `category` | Select: `Question`, `Demo Request` | Filterable |
| `message` | Long text | The inquiry content |
| `preferredContactMethod` | Select: `Phone`, `WhatsApp`, `Telegram`, `Facebook`, `Email`, `In-person` | Same option set as `Person.preferredContactMethod`; captured at submission time since a Person may not exist yet |
| `status` | Select: `New`, `Replied`, `Closed` | Drives rep follow-up |
| `sourceUrl` | Text | Optional — which page on the website it came from |

### Relations

- `person` (many-to-one → Person) — auto-linked on intake (find-or-create by email)
- `opportunity` (many-to-one → Opportunity, optional) — manually linked by a rep when
  the request is worth pursuing as a deal

No new relation fields are needed on Person or Opportunity beyond the reverse side of
these two relations (Twenty creates these automatically).

## Intake flow (API)

The website posts to Twenty's GraphQL API (`createOneContactRequest`) using a scoped
API key, the same auth pattern as any external integration against Twenty. No
CAPTCHA/rate-limiting/spam protection is included in this scope — can be added later
if abuse becomes a problem.

## Auto-linking to Person

A workflow, `DATABASE_EVENT` trigger on Contact Request creation:

1. `FIND_RECORDS` Person where `email = trigger.properties.after.email`
2. `IF_ELSE`:
   - Found → `UPDATE_RECORD` Contact Request, set `person` to the match
   - Not found → `CREATE_RECORD` a new Person (`email`, `fullName`), then
     `UPDATE_RECORD` Contact Request to link it

This mirrors the round-robin assignment workflow already built and verified in Phase 2
— same primitives (`FIND_RECORDS`, `IF_ELSE`, `CREATE_RECORD`/`UPDATE_RECORD`), no new
capability needed.

## Opportunity linking

Deliberately **manual, not automatic**. Reps need to filter spam/low-value "question"
submissions from real "demo request" leads before a Contact Request becomes pipeline
work. A rep sets the `opportunity` relation by hand when they decide to pursue it —
at that point the existing round-robin owner-assignment workflow (Phase 2) already
covers assignment if a *new* Opportunity is created for it.

## Replying to a Contact Request

A manual-action workflow on the Contact Request object:

- Trigger: `FORM`/`MANUAL` (rep-invoked "Send Message" action on the record)
- Form input: `message` (text)
- Steps: `SEND_EMAIL` to `contactRequest.email` with the typed message →
  `UPDATE_RECORD` set `status = Replied`

Scope for v1 is **email-only**, regardless of `preferredContactMethod`. The field is
shown to the rep as context ("they prefer WhatsApp") but only email is automated.
Routing through WhatsApp/Telegram/Facebook APIs is out of scope — a separate future
project if needed.

## Surfacing alongside the Lead

Once linked to an Opportunity, Contact Requests appear as a **related-records panel**
on the Opportunity detail page — the same pattern Deal Products/Notes/Tasks already
use there. This guarantees the "see contact requests for the lead in one place" goal
without depending on unverified behavior.

During implementation, check whether Twenty's native Timeline tab also auto-surfaces
Contact Requests via its generic `targetCustom` relation hook. If it does, that's a
bonus; the related-records panel is the guaranteed mechanism this design depends on.

## Filtering

`category` and `status` are both plain Select fields, so filtering works through
Twenty's standard view filters — no extra work needed.

## Out of scope (for this spec)

- Multi-channel automated replies (WhatsApp/Telegram/Facebook)
- Spam/abuse protection on the intake API
- Automatic Opportunity creation from a Contact Request
- Any UI beyond Twenty's native custom-object views (list, filters, related-records
  panel)
