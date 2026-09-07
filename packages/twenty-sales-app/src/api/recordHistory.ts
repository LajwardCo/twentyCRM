// Reading the change log for one record.
//
// timelineActivity is a system object: the server writes a row for every
// create/update/delete on every object, and access follows the record the row
// points at -- a seller who can open a lead can read that lead's history, and
// one who cannot, cannot. So there is no permission to provision here.
//
// This is the *record* history: what actually changed on a row, with before and
// after values, recorded by the database layer. It is deliberately separate
// from api/auditTrail.ts, which records app-level actions the server cannot see
// (who signed in, which screen they opened). The two answer different questions
// and neither replaces the other.
//
// Every object gets a `target<Object>Id` column, which is what makes this work
// for records beyond the lead: pass the matching key and the same query serves
// a person, a company, a task or a competitor.
import {
  type ActivityRow,
  type AuditEntry,
  toAuditEntries,
} from '../lib/recordHistory';
import { coreQuery } from './client';

export type HistoryTarget =
  | { kind: 'opportunity'; id: string }
  | { kind: 'company'; id: string }
  | { kind: 'person'; id: string }
  | { kind: 'task'; id: string }
  | { kind: 'note'; id: string }
  | { kind: 'competitor'; id: string }
  | { kind: 'partner'; id: string }
  | { kind: 'product'; id: string };

// timelineActivity's target columns are morph relations, so the filterable key
// is the plain `target<Object>Id` scalar rather than a nested relation filter.
const filterKeyFor = (target: HistoryTarget): string =>
  `target${target.kind.charAt(0).toUpperCase()}${target.kind.slice(1)}Id`;

const ACTIVITY_FIELDS = `
  id
  name
  happensAt
  properties
  linkedRecordCachedName
  workspaceMember { name { firstName lastName } }
`;

// A record can accumulate a long history; the panel shows the most recent page
// of it rather than every row ever written.
const HISTORY_PAGE_SIZE = 60;

export const fetchRecordHistory = async (
  target: HistoryTarget,
  limit: number = HISTORY_PAGE_SIZE,
): Promise<AuditEntry[]> => {
  try {
    const data = await coreQuery<{
      timelineActivities: { edges: { node: ActivityRow }[] };
    }>(
      `query RecordHistory($id: UUID!, $first: Int!) {
        timelineActivities(
          filter: { ${filterKeyFor(target)}: { eq: $id } }
          orderBy: [{ happensAt: DescNullsLast }]
          first: $first
        ) {
          edges { node { ${ACTIVITY_FIELDS} } }
        }
      }`,
      { id: target.id, first: limit },
    );

    return toAuditEntries(data.timelineActivities.edges.map((e) => e.node));
  } catch {
    // A workspace whose timelineActivity object predates one of these target
    // columns rejects the whole document. The history is supporting detail --
    // losing it must not take down the screen that shows it.
    return [];
  }
};
