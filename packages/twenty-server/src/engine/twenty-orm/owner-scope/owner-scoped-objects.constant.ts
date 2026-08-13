/**
 * Record-level "owner scoping" (original AGPL feature, not the enterprise RLS).
 *
 * Maps an object's `nameSingular` to the rules that decide whether the current
 * workspace member may see a record. A record is visible when ANY rule matches
 * (rules are OR-ed), so one object can be reachable through several kinds of
 * involvement — owning it, being credited as its marketer, being its referrer.
 *
 * ONLY objects listed here can be owner-scoped. Adding an entry is the whole
 * change needed to scope another object; no other code has to move.
 *
 * Two rule kinds:
 * - `column`: the record itself stores the owning member id.
 * - `via`: the record points at another record (a partner) which in turn
 *   carries the member id. Used so that "who is credited" and "who can see it"
 *   cannot drift apart — the partner row is the single source of truth.
 *
 * The FIRST `column` rule is also the column stamped on create for a scoped
 * role (see WorkspaceRepository.applyOwnerOnCreate), which guarantees a scoped
 * user can always see what they just created.
 *
 * A `column` rule names a physical column and is not validated against the
 * workspace schema: if the column is missing the query fails loudly rather
 * than returning unfiltered rows. `via` rules resolve their target table at
 * query time and are dropped when it does not exist, so a workspace that has
 * not run the partner provisioning script degrades to owner-only scoping
 * instead of erroring.
 */
export type OwnerScopeRule =
  | { kind: 'column'; column: string }
  | {
      kind: 'via';
      column: string;
      targetObjectNameSingular: string;
      targetMemberColumn: string;
    };

const viaPartner = (column: string): OwnerScopeRule => ({
  kind: 'via',
  column,
  targetObjectNameSingular: 'partner',
  targetMemberColumn: 'memberId',
});

export const OWNER_SCOPED_OBJECTS: Record<string, OwnerScopeRule[]> = {
  person: [{ kind: 'column', column: 'ownerId' }],
  company: [{ kind: 'column', column: 'accountOwnerId' }],
  // A lead reaches an external user three ways: they own it, they are its
  // marketer, or they are its primary referrer. The last two survive the lead
  // being reassigned to a seller, which is the point of the feature.
  opportunity: [
    { kind: 'column', column: 'ownerId' },
    viaPartner('marketerPartnerId'),
    viaPartner('referrerId'),
  ],
  task: [{ kind: 'column', column: 'assigneeId' }],
  // An external user may read their own partner row (the app needs it to know
  // which leads it can credit to them) but not the rest of the partner list,
  // which carries everyone's commission rates.
  partner: [{ kind: 'column', column: 'memberId' }],
  // Notes and attachments have no owner relation, but the ACTOR composite
  // stores the author's member id. Consequence: an external user sees the
  // notes they wrote, not a seller's internal notes on the same lead.
  note: [{ kind: 'column', column: 'createdByWorkspaceMemberId' }],
  attachment: [{ kind: 'column', column: 'createdByWorkspaceMemberId' }],
};
