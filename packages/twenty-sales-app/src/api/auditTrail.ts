import type { AuditRecord } from '../lib/auditEvent';
import { buildActorSearchFilter } from '../lib/actorSearch';
import { coreQuery, loadTokens } from './client';

// Read/write side of the audit trail, against the `auditEvent` custom object
// created by tools/sales-crm/provision-audit-log.mjs.
//
// Reads go through GraphQL like everything else. Writes do NOT: they post to
// POST /rest/sales/audit-events, which stamps the actor from the caller's
// token and inserts with object permissions bypassed. That is what allows
// every non-admin role to be denied read on auditEvent outright -- Twenty
// rejects a role that may write an object it may not read, so a log the app
// wrote with the user's own credentials would be a log every seller could
// read in full. It also means the actor and the IP on a row come from the
// server, not from a client that has every reason to lie about both.

export type AuditEventRow = {
  id: string;
  occurredAt: string;
  createdAt: string;
  eventType: string;
  category: string;
  severity: string;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  route: string | null;
  detail: string | null;
  sessionId: string | null;
  device: string | null;
  ipAddress: string | null;
  actor: { id: string; name: { firstName: string; lastName: string } } | null;
};

const ROW_FIELDS = `
  id
  occurredAt
  createdAt
  eventType
  category
  severity
  actorName
  actorEmail
  actorRole
  targetType
  targetId
  targetLabel
  route
  detail
  sessionId
  device
  ipAddress
  actor { id name { firstName lastName } }
`;

// This app ships independently of the server, so it will meet instances where
// the object does not exist yet. One validation error is enough to learn that;
// after it, writing is a no-op instead of a failed request per user action.
let supported: boolean | null = null;

export const auditLogSupported = (): boolean | null => supported;

// Lets a caller that already knows the object is missing (the admin screen)
// share the answer with the writer, and vice versa.
export const markAuditLogUnsupported = () => {
  supported = false;
};

const INGEST_URL = '/rest/sales/audit-events';

const toIngestEvent = (record: AuditRecord) => ({
  occurredAt: record.occurredAt,
  eventType: record.eventType,
  category: record.category,
  severity: record.severity,
  targetType: record.targetType,
  targetId: record.targetId,
  targetLabel: record.targetLabel,
  route: record.route,
  detail: record.detail,
  sessionId: record.sessionId,
  device: record.device,
  // Actor fields are deliberately not sent: the server takes the identity from
  // the token and would discard these anyway.
});

// Throws on a transient failure so the queue keeps the batch and retries;
// resolves quietly when the object simply is not provisioned, because retrying
// that forever would be a permanent background error loop on the user's phone.
export const sendAuditRecords = async (
  records: AuditRecord[],
): Promise<void> => {
  if (supported === false || records.length === 0) return;

  const token = loadTokens()?.accessToken;

  // No session yet: keep the events buffered rather than dropping them. A
  // failed sign-in is logged before there is any token to send it with.
  if (!token) throw new Error('audit: not authenticated yet');

  const response = await fetch(INGEST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ events: records.map(toIngestEvent) }),
  });

  // 404 is an older server without the endpoint; that is permanent for this
  // session, unlike a 5xx or a dropped connection, which must be retried.
  if (response.status === 404) {
    supported = false;
    return;
  }

  if (!response.ok) {
    throw new Error(`audit ingest failed (${response.status})`);
  }

  const body = (await response.json().catch(() => null)) as
    | { supported?: boolean }
    | null;

  if (body?.supported === false) {
    supported = false;
    return;
  }

  supported = true;
};

export type AuditQueryFilters = {
  actorMemberId?: string;
  category?: string;
  severity?: string;
  eventType?: string;
  search?: string;
  fromIso?: string;
  toIso?: string;
};

export type AuditPage = {
  rows: AuditEventRow[];
  hasMore: boolean;
  endCursor: string | null;
};

const buildFilter = (filters: AuditQueryFilters): Record<string, unknown> | undefined => {
  const clauses: Record<string, unknown>[] = [];
  if (filters.actorMemberId) clauses.push({ actorId: { eq: filters.actorMemberId } });
  if (filters.category) clauses.push({ category: { eq: filters.category } });
  if (filters.severity) clauses.push({ severity: { eq: filters.severity } });
  if (filters.eventType) clauses.push({ eventType: { eq: filters.eventType } });
  if (filters.fromIso) clauses.push({ occurredAt: { gte: filters.fromIso } });
  if (filters.toIso) clauses.push({ occurredAt: { lte: filters.toIso } });
  if (filters.search) {
    const like = `%${filters.search}%`;
    clauses.push({
      or: [
        { actorName: { ilike: like } },
        { actorEmail: { ilike: like } },
        { targetLabel: { ilike: like } },
        { targetId: { ilike: like } },
        { route: { ilike: like } },
        { eventType: { ilike: like } },
      ],
    });
  }
  if (clauses.length === 0) return undefined;
  return { and: clauses };
};

// Cursor-paged on purpose: `first:` is not clamped by the server, so asking
// for one huge page silently truncates instead of erroring.
export const fetchAuditEvents = async (
  filters: AuditQueryFilters,
  pageSize = 60,
  after?: string | null,
): Promise<AuditPage> => {
  const data = await coreQuery<{
    auditEvents: {
      edges: { node: AuditEventRow; cursor: string }[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  }>(
    `query AuditEvents($filter: AuditEventFilterInput, $first: Int, $after: String) {
      auditEvents(
        filter: $filter
        first: $first
        after: $after
        orderBy: [{ occurredAt: DescNullsLast }]
      ) {
        edges { cursor node { ${ROW_FIELDS} } }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    { filter: buildFilter(filters), first: pageSize, after: after ?? null },
  );

  return {
    rows: data.auditEvents.edges.map((e) => e.node),
    hasMore: data.auditEvents.pageInfo.hasNextPage,
    endCursor: data.auditEvents.pageInfo.endCursor,
  };
};

// ---------------------------------------------------------------------------
// Actor lookup
// ---------------------------------------------------------------------------

export type AuditActorOption = {
  id: string;
  name: string;
  userEmail: string | null;
};

const ACTOR_PAGE_SIZE = 30;

const toActorOption = (node: {
  id: string;
  userEmail: string | null;
  name: { firstName: string; lastName: string };
}): AuditActorOption => ({
  id: node.id,
  name: `${node.name.firstName} ${node.name.lastName}`.trim() || (node.userEmail ?? '—'),
  userEmail: node.userEmail,
});

/**
 * Members matching a typed query, resolved by the server.
 *
 * The audit screen cannot filter a locally-held list: a workspace can hold
 * thousands of members and any one of them may be the person being looked
 * for, so a picker backed by "the first hundred we happened to fetch" would
 * quietly fail to find most people. An empty query returns the first page,
 * which is what the picker shows before anyone types.
 */
export const searchAuditActors = async (
  search: string,
): Promise<AuditActorOption[]> => {
  const data = await coreQuery<{
    workspaceMembers: {
      edges: {
        node: {
          id: string;
          userEmail: string | null;
          name: { firstName: string; lastName: string };
        };
      }[];
    };
  }>(
    `query AuditActors($filter: WorkspaceMemberFilterInput, $first: Int) {
      workspaceMembers(
        filter: $filter
        first: $first
        orderBy: [{ name: { firstName: AscNullsLast } }]
      ) {
        edges { node { id userEmail name { firstName lastName } } }
      }
    }`,
    {
      first: ACTOR_PAGE_SIZE,
      filter: buildActorSearchFilter(search) ?? undefined,
    },
  );

  return data.workspaceMembers.edges.map((edge) => toActorOption(edge.node));
};

/** Resolves one member so a picker can label an id restored from the URL. */
export const fetchAuditActor = async (
  id: string,
): Promise<AuditActorOption | null> => {
  const data = await coreQuery<{
    workspaceMembers: {
      edges: {
        node: {
          id: string;
          userEmail: string | null;
          name: { firstName: string; lastName: string };
        };
      }[];
    };
  }>(
    `query AuditActor($id: UUID!) {
      workspaceMembers(filter: { id: { eq: $id } }, first: 1) {
        edges { node { id userEmail name { firstName lastName } } }
      }
    }`,
    { id },
  );

  const node = data.workspaceMembers.edges[0]?.node;

  return node ? toActorOption(node) : null;
};
