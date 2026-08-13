# External marketer & partner access

**Date:** 2026-08-14
**Branch:** `feat/external-marketer-partner-access`

## Problem

Marketers and referral partners bring us leads, but they are not employees and
have no way into the system. Today they exist only as data: a marketer is one of
three names compiled into the Sales App (`MARKETER_LABELS`), and a partner is a
`partner` record credited on a deal. Neither can log in, see the leads they
brought, or work a task.

Giving them a login is the easy half. The hard half is that they are outsiders:
whatever they can reach, they can reach through the API too, so hiding screens is
not an answer.

## Decisions

1. **Identity: workspace member + restricted role.** Auth, lead ownership and
   task assignment already key off `workspaceMember`; inventing a parallel
   identity would mean reimplementing all three. Two roles are provisioned,
   `Marketer` and `Partner`, identical today so they can diverge later.
2. **Scope: own leads and own tasks, full edit.** They register leads, log
   activity and complete their own tasks. No other seller's pipeline, no
   reports, no catalog, no pricing.
3. **Enforcement: server-side.** Extends the existing AGPL owner-scope engine.
   UI-only hiding would be meaningless for users outside the company.
4. **Marketer becomes a relation to the `partner` record**, replacing the
   hard-coded SELECT, so marketers can be added without a deploy and credit and
   commission flow through one object.

## Architecture

### Scoping rules

`OWNER_SCOPED_OBJECTS` grows from `Record<string, string>` (one owner column per
object) to a list of rules, OR-ed together:

```ts
type OwnerScopeRule =
  | { kind: 'column'; column: string }
  | { kind: 'via'; column: string; targetObjectNameSingular: string;
      targetMemberColumn: string };
```

| object | rules |
| --- | --- |
| `person` | `ownerId` |
| `company` | `accountOwnerId` |
| `opportunity` | `ownerId` OR via `marketerPartnerId` OR via `referrerId` |
| `task` | `assigneeId` |
| `note`, `attachment` | `createdByWorkspaceMemberId` (ACTOR sub-column) |
| `partner` | `memberId` |

A `via` rule emits `alias."marketerPartnerId" IN (SELECT id FROM
"<workspace schema>"."_partner" WHERE "memberId" = :me AND "deletedAt" IS NULL)`.
The partner row is the single source of truth, so "who is credited" and "who can
see it" cannot drift apart. The soft-delete check matters: a retired partner must
stop granting access.

The three opportunity rules are what makes the feature work at all — a
marketer-brought lead is usually *owned* by a seller, so owner-only scoping would
hide from the marketer the very lead they brought.

### Fail-closed behaviour

- A `via` rule whose target object does not exist is **dropped**, which can only
  narrow access. A workspace that has not run the provisioning script degrades to
  owner-only scoping instead of erroring.
- An object that is configured as scoped but whose rules all fail to resolve
  emits `1 = 0` rather than falling through to an unfiltered query.
- A scoped role with no workspace member identity (an API key) is denied
  outright, unchanged from before.
- `column` rules are not validated against the schema: a missing column fails the
  query loudly instead of returning unfiltered rows. Hence the provisioning
  script creates fields **before** roles.

### Create

`WorkspaceRepository.applyOwnerOnCreate` stamps the first `column` rule, so a
scoped user can always see what they just created and cannot create a record
owned by someone else. `via` targets cannot be inferred, so the app sets the
creator's own partner explicitly on a new lead.

## Consequences accepted

- **A marketer does not see a seller's notes on their own lead.** Notes have no
  owner relation, so they are scoped by author. For non-employees this is the
  right default, but it is a behaviour choice, not a technical limit.
- **`noteTarget` / `taskTarget` stay unscoped.** They are contentless join rows
  and lead detail cannot list its own notes and tasks without them. Ids are
  enumerable through them; the note bodies and task titles behind those ids are
  not.
- **A lead attached to a company owned by someone else shows a blank company**
  for an external user, because `company` is scoped by account owner.
- **Reports:** external users own the leads they register, so the seller
  leaderboard excludes members with a linked partner record; the marketer
  leaderboard reads the partner relation, falling back to the legacy enum for
  leads created before the backfill.

## Rollout

1. `tools/sales-crm/provision-external-partners.mjs` — creates `partner.member`
   and `opportunity.marketerPartner`, converts the three legacy marketer names
   into partner records, backfills every lead, then creates the two roles.
   Idempotent.
2. Server redeploy (the engine change is server code, not metadata).
3. Sales App deploy.
4. Per person: invite → assign Marketer/Partner role → link their partner record
   on the admin screen. The link is what turns the account external.

## Out of scope

Commission statements for partners, and a read-only-after-handover mode.
