// Audit event model for the sales app.
//
// Every meaningful thing a user does in the SPA becomes one AuditEvent: which
// screen they opened, which record they read, what they changed, what they
// copied out of the app, and when the browser gave us a reason to believe they
// captured the screen. The shape is deliberately flat and denormalized -- an
// audit row has to stay readable years later, after the member, the lead, or
// the whole object type it points at is gone.
//
// This module is pure: no fetch, no DOM, no globals. It is what the tests
// pin down. Transport lives in ../api/auditLog.ts, wiring in ./audit.ts.

export type AuditCategory =
  | 'auth' // sign in / out, session lifetime
  | 'navigation' // screens opened
  | 'read' // records fetched and looked at
  | 'write' // records created or changed
  | 'delete' // records removed
  | 'exfiltration' // data leaving the app: copy, print, download, share
  | 'security'; // screenshots, denied permissions, tampering signals

// How loudly a reviewer should care. 'sensitive' and above is what the audit
// screen shows by default -- an unfiltered feed of every read is noise, and
// noise is how real incidents get missed.
export type AuditSeverity = 'info' | 'notice' | 'sensitive' | 'critical';

export type AuditEventInput = {
  eventType: string;
  category: AuditCategory;
  severity?: AuditSeverity;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  detail?: Record<string, unknown> | null;
  route?: string | null;
};

export type AuditActor = {
  workspaceMemberId: string;
  name: string;
  email: string;
  role: string;
};

// What actually gets persisted. One row, no joins needed to read it.
export type AuditRecord = {
  occurredAt: string;
  eventType: string;
  category: AuditCategory;
  severity: AuditSeverity;
  actorMemberId: string | null;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  route: string | null;
  detail: string | null;
  sessionId: string;
  device: string | null;
};

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

// Keys whose value never reaches the log, at any depth. An audit trail that
// leaks the thing it is auditing is worse than no audit trail: this row is
// readable by every admin and lives forever.
const SECRET_KEY_PATTERN =
  /pass(word|code)|secret|token|authorization|credential|apikey|api_key|otp|pin|signature|cookie|session_key/i;

// Free-text business content: we record that it changed, never what it says.
// Notes, transcripts and message bodies are exactly the material a leaked
// audit table would make searchable.
// Note: server-generated error strings are logged under `reason`, not
// `message`, precisely so they survive this filter -- "Wrong password" is the
// whole value of a failed-login row, and the generic length rule below still
// collapses anything long enough to be carrying data.
const CONTENT_KEY_PATTERN =
  /^(body|bodyV2|note|notes|message|text|content|summary|transcript|description|comment)$/i;

const MAX_STRING = 120;
const MAX_ARRAY = 20;
const MAX_DEPTH = 4;

const looksLikeUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// Collapses a value to something safe and small. Ids and enum-ish short
// strings survive intact because they are what makes a row investigable;
// anything long is reduced to a length so a reviewer still sees "they pasted
// 4kB into this field" without the 4kB.
const redactValue = (value: unknown, depth: number): unknown => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean' || typeof value === 'number') return value;

  if (typeof value === 'string') {
    if (looksLikeUuid(value)) return value;
    if (value.length > MAX_STRING) return `[${value.length} chars]`;
    return value;
  }

  if (depth >= MAX_DEPTH) return '[deep]';

  if (Array.isArray(value)) {
    const head = value.slice(0, MAX_ARRAY).map((v) => redactValue(v, depth + 1));
    return value.length > MAX_ARRAY
      ? [...head, `[+${value.length - MAX_ARRAY} more]`]
      : head;
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as object)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        out[key] = '[redacted]';
        continue;
      }
      if (CONTENT_KEY_PATTERN.test(key)) {
        out[key] =
          typeof inner === 'string' ? `[${inner.length} chars]` : '[content]';
        continue;
      }
      out[key] = redactValue(inner, depth + 1);
    }
    return out;
  }

  return '[unserializable]';
};

export const redactDetail = (
  detail: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null => {
  if (!detail) return null;
  return redactValue(detail, 0) as Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// GraphQL operation -> audit event
// ---------------------------------------------------------------------------

export type ParsedOperation = {
  operation: 'query' | 'mutation' | 'subscription';
  operationName: string | null;
  rootField: string | null;
};

// Enough of a GraphQL parse to name what happened. Deliberately regex-based:
// this runs on the hot path of every API call in the app and must never throw
// or cost anything measurable.
export const parseOperation = (query: string): ParsedOperation => {
  const stripped = query.replace(/#[^\n]*/g, '');
  const header = /\b(query|mutation|subscription)\b\s*([A-Za-z0-9_]*)/.exec(
    stripped,
  );
  const braceAt = stripped.indexOf('{', header ? header.index : 0);
  const afterBrace = braceAt === -1 ? '' : stripped.slice(braceAt + 1);
  const root = /^[\s]*(?:[A-Za-z0-9_]+\s*:\s*)?([A-Za-z0-9_]+)/.exec(afterBrace);

  return {
    operation: (header?.[1] as ParsedOperation['operation']) ?? 'query',
    operationName: header?.[2] ? header[2] : null,
    rootField: root?.[1] ?? null,
  };
};

const VERB_PREFIXES: { prefix: string; verb: string; category: AuditCategory }[] =
  [
    { prefix: 'createMany', verb: 'create', category: 'write' },
    { prefix: 'create', verb: 'create', category: 'write' },
    { prefix: 'updateMany', verb: 'update', category: 'write' },
    { prefix: 'update', verb: 'update', category: 'write' },
    { prefix: 'deleteMany', verb: 'delete', category: 'delete' },
    { prefix: 'delete', verb: 'delete', category: 'delete' },
    { prefix: 'destroyMany', verb: 'destroy', category: 'delete' },
    { prefix: 'destroy', verb: 'destroy', category: 'delete' },
    { prefix: 'restore', verb: 'restore', category: 'write' },
    { prefix: 'merge', verb: 'merge', category: 'write' },
    { prefix: 'upsert', verb: 'upsert', category: 'write' },
  ];

const lowerFirst = (value: string): string =>
  value.charAt(0).toLowerCase() + value.slice(1);

// Object types that are sensitive to *read*, not just to change. Money,
// people's contact details, competitor intelligence, partner commissions, and
// the audit trail itself: an account quietly paging through these is the
// pattern this whole feature exists to make visible.
const SENSITIVE_READ_TYPES = new Set([
  'opportunity',
  'opportunities',
  'lead',
  'person',
  'people',
  'contact',
  'partner',
  'subscription',
  'offer',
  'pricebook',
  'product',
  'productprice',
  'competitor',
  'competitorproduct',
  'attachment',
  'auditevent',
  'workspacemember',
  'dailyreport',
]);

// Bulk mutations are named for the plural ("createAuditEvents",
// "deleteLeads"), so a type has to match in either number.
export const isSensitiveType = (targetType: string | null): boolean => {
  if (targetType === null) return false;
  const lower = targetType.toLowerCase();
  return (
    SENSITIVE_READ_TYPES.has(lower) ||
    (lower.endsWith('s') && SENSITIVE_READ_TYPES.has(lower.slice(0, -1)))
  );
};

export type OperationEvent = {
  eventType: string;
  category: AuditCategory;
  severity: AuditSeverity;
  targetType: string | null;
  verb: string;
};

// Turns "updateOpportunity" into a write/sensitive event on `opportunity`,
// "people" into a read event on `person`, and so on.
export const classifyOperation = (
  parsed: ParsedOperation,
): OperationEvent | null => {
  const root = parsed.rootField;
  if (root === null) return null;

  for (const { prefix, verb, category } of VERB_PREFIXES) {
    if (root.startsWith(prefix) && root.length > prefix.length) {
      const targetType = lowerFirst(root.slice(prefix.length));
      return {
        eventType: `record.${verb}`,
        category,
        // Every deletion is worth a reviewer's attention, always.
        severity:
          category === 'delete'
            ? 'critical'
            : isSensitiveType(targetType)
              ? 'sensitive'
              : 'notice',
        targetType,
        verb,
      };
    }
  }

  // Anything left is a read. Reads are the volume: only sensitive object types
  // are worth a row, the rest would drown the log.
  const targetType = lowerFirst(root);
  if (!isSensitiveType(targetType)) return null;

  return {
    eventType: 'record.read',
    category: 'read',
    severity: 'sensitive',
    targetType,
    verb: 'read',
  };
};

// The record id an operation touched, when the call names one directly.
// Filter-shaped calls (list screens) have no single target and stay null.
export const targetIdOf = (
  variables: Record<string, unknown> | undefined,
): string | null => {
  if (!variables) return null;
  for (const key of ['id', 'recordId', 'leadId', 'taskId', 'personId']) {
    const value = variables[key];
    if (typeof value === 'string' && looksLikeUuid(value)) return value;
  }
  return null;
};

// The field names a mutation wrote -- names only, never values. A reviewer
// needs to know that someone changed `amount` and `stage`; storing what they
// changed it to would turn this table into a shadow copy of the CRM.
export const changedFieldsOf = (
  variables: Record<string, unknown> | undefined,
): string[] => {
  if (!variables) return [];
  const payload = (variables.data ?? variables.input) as unknown;
  if (payload === null || typeof payload !== 'object') return [];
  const source = Array.isArray(payload) ? (payload[0] ?? {}) : payload;
  if (source === null || typeof source !== 'object') return [];
  return Object.keys(source as object).slice(0, 40);
};

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

const DEFAULT_SEVERITY: Record<AuditCategory, AuditSeverity> = {
  auth: 'sensitive',
  navigation: 'info',
  read: 'notice',
  write: 'notice',
  delete: 'critical',
  exfiltration: 'sensitive',
  security: 'critical',
};

export const buildAuditRecord = (
  input: AuditEventInput,
  context: {
    actor: AuditActor | null;
    sessionId: string;
    device: string | null;
    now?: Date;
  },
): AuditRecord => {
  // An event recorded before anyone signed in is delivered later, under the
  // token of whoever does sign in -- so the server stamps THAT person's name
  // on it. Usually they are the same person retrying their own password, but
  // not always, and a reviewer has to be able to tell the difference. The row
  // says so itself; the attempted identity is in targetLabel.
  const detail = redactDetail(
    context.actor === null
      ? { ...(input.detail ?? {}), recordedBeforeSignIn: true }
      : input.detail,
  );
  return {
    occurredAt: (context.now ?? new Date()).toISOString(),
    eventType: input.eventType,
    category: input.category,
    severity: input.severity ?? DEFAULT_SEVERITY[input.category],
    actorMemberId: context.actor?.workspaceMemberId ?? null,
    // An anonymous row still matters: it is a failed login or a public upload
    // page hit, and losing it would leave exactly the gap an attacker wants.
    actorName: context.actor?.name ?? 'ناشناس',
    actorEmail: context.actor?.email ?? '',
    actorRole: context.actor?.role ?? 'anonymous',
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    targetLabel: input.targetLabel ?? null,
    route: input.route ?? null,
    detail: detail === null ? null : JSON.stringify(detail),
    sessionId: context.sessionId,
    device: context.device,
  };
};

// Two identical reads a second apart are one fact, not two. React re-renders
// and stale-while-revalidate refetches would otherwise triple the volume of
// the log without adding a single piece of information.
export const dedupeKeyOf = (record: AuditRecord): string =>
  [
    record.eventType,
    record.targetType ?? '',
    record.targetId ?? '',
    record.route ?? '',
  ].join('|');

// ---------------------------------------------------------------------------
// Watermarking
// ---------------------------------------------------------------------------

// Screens where a screenshot would carry customer contact details, money, or
// the security log itself. Those get the attribution overlay; the rest of the
// app stays clean, because a watermark everywhere is a watermark nobody reads.
const WATERMARKED_SECTIONS = new Set([
  'lead',
  'leads',
  'contacts',
  'person',
  'company',
  'partners',
  'reports',
  'catalog',
  'competitor',
  'competitors',
  'audit',
  'search',
]);

export const isWatermarkedSection = (section: string | undefined): boolean =>
  WATERMARKED_SECTIONS.has(section ?? '');
