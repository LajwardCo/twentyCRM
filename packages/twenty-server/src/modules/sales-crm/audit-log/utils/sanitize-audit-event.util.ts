/**
 * Normalizes one client-submitted audit event into something safe to store.
 *
 * The device is not trusted. It reports what the user did, which is useful,
 * but every field it sends is attacker-controlled in the case that matters
 * most -- an employee who does not want their actions on the record. So:
 *
 *   - the actor is never read from the body; the controller takes it from the
 *     JWT and passes it in separately,
 *   - category and severity are constrained to known values, so a client
 *     cannot file its own deletions under a label the review screen ignores,
 *   - every string is clamped, so the log cannot be used to fill the database,
 *   - `occurredAt` is kept as the client's claim but never trusted as the
 *     truth: the row's own createdAt is the server's clock, and the two being
 *     far apart is itself a reviewable signal.
 */

export const AUDIT_CATEGORIES = [
  'auth',
  'navigation',
  'read',
  'write',
  'delete',
  'exfiltration',
  'security',
] as const;

export const AUDIT_SEVERITIES = [
  'info',
  'notice',
  'sensitive',
  'critical',
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

export const MAX_EVENTS_PER_REQUEST = 50;

const LIMITS = {
  eventType: 80,
  targetType: 80,
  targetId: 120,
  targetLabel: 200,
  route: 200,
  detail: 2000,
  sessionId: 80,
  device: 200,
  ipAddress: 60,
} as const;

export type RawAuditEvent = {
  occurredAt?: unknown;
  eventType?: unknown;
  category?: unknown;
  severity?: unknown;
  targetType?: unknown;
  targetId?: unknown;
  targetLabel?: unknown;
  route?: unknown;
  detail?: unknown;
  sessionId?: unknown;
  device?: unknown;
};

export type SanitizedAuditEvent = {
  occurredAt: Date;
  eventType: string;
  category: AuditCategory;
  severity: AuditSeverity;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  route: string | null;
  detail: string | null;
  sessionId: string | null;
  device: string | null;
};

const clamp = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;

  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
};

// A client clock may be wrong, deliberately or otherwise. Anything more than a
// day out in either direction is replaced by the server's time rather than
// stored: it would otherwise let a device hide an action by dating it to 1970
// or to next year, where no reviewer's date filter would ever look.
const MAX_CLOCK_DRIFT_MS = 24 * 60 * 60 * 1000;

const parseOccurredAt = (value: unknown, now: Date): Date => {
  if (typeof value !== 'string') return now;
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) return now;
  if (Math.abs(parsed.getTime() - now.getTime()) > MAX_CLOCK_DRIFT_MS) {
    return now;
  }

  return parsed;
};

export const sanitizeAuditEvent = (
  raw: RawAuditEvent,
  now: Date = new Date(),
): SanitizedAuditEvent | null => {
  const eventType = clamp(raw.eventType, LIMITS.eventType);

  // An event with no name says nothing and cannot be reviewed; drop it rather
  // than store a row nobody can interpret.
  if (eventType === null) return null;

  const category = AUDIT_CATEGORIES.includes(raw.category as AuditCategory)
    ? (raw.category as AuditCategory)
    : 'security';

  const severity = AUDIT_SEVERITIES.includes(raw.severity as AuditSeverity)
    ? (raw.severity as AuditSeverity)
    : // An unrecognized severity is treated as the loudest, not the quietest:
      // a client must not be able to bury an event by mislabeling it.
      'critical';

  return {
    occurredAt: parseOccurredAt(raw.occurredAt, now),
    eventType,
    category,
    severity,
    targetType: clamp(raw.targetType, LIMITS.targetType),
    targetId: clamp(raw.targetId, LIMITS.targetId),
    targetLabel: clamp(raw.targetLabel, LIMITS.targetLabel),
    route: clamp(raw.route, LIMITS.route),
    detail: clamp(raw.detail, LIMITS.detail),
    sessionId: clamp(raw.sessionId, LIMITS.sessionId),
    device: clamp(raw.device, LIMITS.device),
  };
};

export const sanitizeAuditEvents = (
  raw: unknown,
  now: Date = new Date(),
): SanitizedAuditEvent[] => {
  if (!Array.isArray(raw)) return [];

  return raw
    .slice(0, MAX_EVENTS_PER_REQUEST)
    .map((event) => sanitizeAuditEvent((event ?? {}) as RawAuditEvent, now))
    .filter((event): event is SanitizedAuditEvent => event !== null);
};

/**
 * The caller's address, taken from the proxy header nginx sets in production
 * and falling back to the socket. The client cannot choose this, which is what
 * makes it worth storing next to fifteen fields that the client does choose.
 */
export const clientIpFrom = (
  headers: Record<string, string | string[] | undefined>,
  socketAddress: string | undefined,
): string | null => {
  const forwarded = headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;

  if (typeof first === 'string' && first.trim() !== '') {
    // The left-most entry is the original client; the rest are proxies.
    return clamp(first.split(',')[0], LIMITS.ipAddress);
  }

  return clamp(socketAddress, LIMITS.ipAddress);
};

/**
 * Whether a failure means "this workspace has no auditEvent object".
 *
 * A Twenty instance can hold workspaces that never ran
 * provision-audit-log.mjs -- the sales app is provisioned per workspace, and
 * a shared instance will have some without it. Those must be skipped
 * silently: the nightly retention job visits every active workspace, so
 * treating a missing object as an error would mean a failed job per
 * unprovisioned workspace per night, forever, drowning the real failures.
 */
export const isMissingAuditObjectError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);

  return (
    /Object metadata for object "auditEvent" is missing/i.test(message) ||
    /auditEvent.*does not exist/i.test(message) ||
    /relation .*audit_event.* does not exist/i.test(message)
  );
};
