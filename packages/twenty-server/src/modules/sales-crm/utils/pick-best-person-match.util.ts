export type PersonMatchCandidate = {
  id: string;
  updatedAt: string;
  /** Id of an open Opportunity for this Person, or null if they have none. */
  openOpportunityId: string | null;
};

/**
 * Picks one Person when a phone number matches several. A shared line (a
 * switchboard, a receptionist's desk) genuinely belongs to more than one
 * record, so the choice must be deterministic: the same call must never attach
 * to a different Person on a retry.
 *
 * Order: an open deal wins, then the most recently touched record, then the
 * lowest id purely to break ties stably.
 */
export const pickBestPersonMatch = <T extends PersonMatchCandidate>(
  candidates: T[],
): T | null => {
  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((left, right) => {
    const leftHasDeal = left.openOpportunityId !== null ? 1 : 0;
    const rightHasDeal = right.openOpportunityId !== null ? 1 : 0;

    if (leftHasDeal !== rightHasDeal) {
      return rightHasDeal - leftHasDeal;
    }

    if (left.updatedAt !== right.updatedAt) {
      return left.updatedAt < right.updatedAt ? 1 : -1;
    }

    return left.id < right.id ? -1 : 1;
  })[0];
};
