# Lead tags (personal and public)

Sellers can tag a lead, filter the leads list by tag, and manage their tags.

## Data
- `leadTag`: `name`, `color` (9-colour palette), `visibility` (`PERSONAL` | `PUBLIC`), `createdByMember` (workspaceMember).
- `leadTagLink`: `opportunity` + `tag`, one row per applied tag.
- Provisioned by `tools/sales-crm/provision-lead-tags.mjs` (idempotent). The UI probes `/metadata` for both objects and hides every tag control until they exist, so deploying first is safe.

## Rules (`src/lib/leadTags.ts`)
- PUBLIC tags: visible to all; anyone can apply; only the creator or an admin can rename, recolor, delete. Only the creator can change visibility.
- PERSONAL tags: visible and usable only by the creator, even on a lead both can open. Admins do not see other members' personal tags.
- Names unique per scope, case-insensitive, whitespace-collapsed, max 30 chars. Another member's personal tag never counts as a duplicate (they cannot see it).
- Deleting a tag bulk-deletes its links first (`deleteLeadTagLinks`), then the tag. Soft delete (prod denies destroy).
- External marketers/partners get no tag UI (not in their nav/route allow-list).

## UI
- Lead detail: chip row in the hero with remove (x) and a "+ tag" picker sheet (search, toggle, inline create).
- Leads list: chips under the lead in table, kanban and mobile cards; a Tags filter in the filter sheet.
- `#/tags`: manage screen (my personal tags, public tags, lead counts, edit, delete, link to the filtered list).

## Filtering
Lead -> links is one-to-many, which the record API cannot filter through, so the selected tags are resolved to lead ids (`fetchLeadIdsForTags`) and applied as `id in [...]`. No match sends a nil-UUID sentinel. Selected ids the member cannot see (a shared link with someone's personal tag) are dropped from the lookup.

## Known limit
Personal-tag privacy is enforced in the app, not the database: the record API has no per-user row scoping for custom objects, so someone calling the API directly could read other members' personal tag names. Server enforcement is a possible follow-up.
