import {
  AUDIT_SEVERITIES,
  type AuditSeverity,
} from 'src/modules/sales-crm/audit-log/utils/sanitize-audit-event.util';

import { AUDIT_LOG_RETENTION_MIN_DAYS } from 'src/modules/sales-crm/audit-log/constants/audit-log-retention.constant';

/**
 * How long each class of audit event is kept.
 *
 * Retention is per severity rather than one number for the whole table,
 * because the two ends of this log have nothing in common. `info` is
 * navigation noise -- the bulk of the rows, useful for a week, worthless
 * after a quarter. `critical` is the material an actual investigation is made
 * of: screenshots, deletions, exports, denied permissions. Keeping those for
 * as long as the noise would mean either drowning in rows or throwing away
 * evidence, so they are separated.
 *
 * A value of 0 means "keep forever" for that severity.
 */
export type AuditRetentionPolicy = Record<AuditSeverity, number>;

export const DEFAULT_AUDIT_RETENTION_DAYS: AuditRetentionPolicy = {
  info: 90,
  notice: 180,
  sensitive: 400, // over a year, so an annual review can look back a full cycle
  critical: 1095, // three years
};

const UNIFORM_ENV_KEY = 'SALES_AUDIT_RETENTION_DAYS';

const envKeyFor = (severity: AuditSeverity): string =>
  `${UNIFORM_ENV_KEY}_${severity.toUpperCase()}`;

export type ResolvedAuditRetention = {
  policy: AuditRetentionPolicy;
  // Surfaced by the caller into the logs. A retention setting that was ignored
  // or clamped must not be silently ignored -- the operator believes the log
  // is being pruned on their schedule and it is not.
  warnings: string[];
};

const parseDays = (
  raw: string | undefined,
  key: string,
  warnings: string[],
): number | null => {
  if (raw === undefined || raw.trim() === '') return null;

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < 0) {
    warnings.push(
      `${key}="${raw}" is not a whole number of days; ignoring it.`,
    );

    return null;
  }

  // 0 is a deliberate "never prune this severity", not a mistake, so it is
  // not subject to the floor.
  if (parsed === 0) return 0;

  if (parsed < AUDIT_LOG_RETENTION_MIN_DAYS) {
    warnings.push(
      `${key}=${parsed} is below the ${AUDIT_LOG_RETENTION_MIN_DAYS}-day minimum; using ${AUDIT_LOG_RETENTION_MIN_DAYS}.`,
    );

    return AUDIT_LOG_RETENTION_MIN_DAYS;
  }

  return parsed;
};

/**
 * Builds the policy from the environment.
 *
 * `SALES_AUDIT_RETENTION_DAYS` sets every severity at once, which is the shape
 * a compliance requirement usually takes ("keep 18 months"). The per-severity
 * keys (`SALES_AUDIT_RETENTION_DAYS_CRITICAL` and friends) override it for one
 * class, so "everything 180 days, security events 3 years" is expressible.
 */
export const resolveAuditRetention = (
  env: Record<string, string | undefined>,
): ResolvedAuditRetention => {
  const warnings: string[] = [];
  const uniform = parseDays(env[UNIFORM_ENV_KEY], UNIFORM_ENV_KEY, warnings);

  const policy = { ...DEFAULT_AUDIT_RETENTION_DAYS };

  for (const severity of AUDIT_SEVERITIES) {
    const key = envKeyFor(severity);
    const specific = parseDays(env[key], key, warnings);

    if (specific !== null) {
      policy[severity] = specific;
      continue;
    }

    if (uniform !== null) {
      policy[severity] = uniform;
    }
  }

  return { policy, warnings };
};

/**
 * The instant before which rows of a given severity may be deleted, or null
 * when that severity is kept forever.
 *
 * Anchored to midnight UTC rather than "now minus N days" so the boundary does
 * not creep by the job's own runtime, and so two runs on the same day agree
 * about what is expired.
 */
export const cutoffDateFor = (
  retentionDays: number,
  now: Date = new Date(),
): Date | null => {
  if (retentionDays <= 0) return null;

  const cutoff = new Date(now);

  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);

  return cutoff;
};
