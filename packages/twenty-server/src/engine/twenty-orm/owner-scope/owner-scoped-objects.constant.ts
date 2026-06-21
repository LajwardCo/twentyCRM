/**
 * Record-level "owner scoping" (original AGPL feature, not the enterprise RLS).
 *
 * Maps an object's `nameSingular` to the DB column that holds the owning
 * WorkspaceMember id. ONLY objects listed here can be owner-scoped. Add an
 * entry (e.g. opportunity -> 'ownerId', company -> 'accountOwnerId') to extend
 * scoping to more objects — no other code change is required.
 */
export const OWNER_SCOPED_OBJECTS: Record<string, string> = {
  person: 'ownerId',
};
