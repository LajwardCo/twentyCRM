import { useCallback, useEffect, useMemo, useState } from 'react';

import type { CurrentUser } from '../api/auth';
import {
  fetchAuditEvents,
  markAuditLogUnsupported,
  type AuditEventRow,
  type AuditQueryFilters,
} from '../api/auditTrail';
import { AuditActorPicker } from '../components/AuditActorPicker';
import { AuditWatermark } from '../components/AuditWatermark';
import { pendingAuditCount, recordAudit } from '../lib/audit';
import { TAUDIT } from '../lib/auditStrings';
import { formatDateTime } from '../lib/format';
import { toPersianDigits } from '../lib/jalali';

// The security log. Admin-only, and it audits itself: opening this screen and
// every page of it is recorded like any other read of sensitive data, because
// "who went through the log, looking for what" is exactly the kind of thing a
// log is for.

const PAGE_SIZE = 60;
const CLOCK_SKEW_TOLERANCE_MS = 120000;

const RANGES = [
  { key: 'today', labelKey: 'auditFilterToday' as const, hours: 24 },
  { key: '7d', labelKey: 'auditFilter7d' as const, hours: 24 * 7 },
  { key: '30d', labelKey: 'auditFilter30d' as const, hours: 24 * 30 },
  { key: 'all', labelKey: 'auditFilterAllTime' as const, hours: 0 },
];

const CATEGORIES = [
  'auth',
  'navigation',
  'read',
  'write',
  'delete',
  'exfiltration',
  'security',
];

const SEVERITIES = ['info', 'notice', 'sensitive', 'critical'];

// A row whose client clock disagrees with the server's by more than a couple
// of minutes is worth flagging: it is either a badly set phone or someone
// moving the clock, and both change how the timeline should be read.
const clockSkewMinutes = (row: AuditEventRow): number | null => {
  if (!row.createdAt || !row.occurredAt) return null;
  const delta = Math.abs(
    new Date(row.createdAt).getTime() - new Date(row.occurredAt).getTime(),
  );
  return delta > CLOCK_SKEW_TOLERANCE_MS ? Math.round(delta / 60000) : null;
};

// Detail is redacted JSON of arbitrary shape -- counts, field-name lists, and
// for the retention marker a nested map of severity to rows deleted. Rendering
// it with String() turned the single most important row in the log
// ("audit.retention_pruned") into "[object Object]", so nested values are
// flattened one level rather than stringified.
const describeValue = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(describeValue).join('، ');
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, inner]) => `${key}=${describeValue(inner)}`)
      .join('، ');
  }
  return String(value);
};

const describeDetail = (row: AuditEventRow): string | null => {
  if (!row.detail) return null;
  try {
    const parsed = JSON.parse(row.detail) as Record<string, unknown>;
    const parts = Object.entries(parsed)
      .filter(
        ([, value]) => value !== null && value !== undefined && value !== '',
      )
      .map(([key, value]) => `${key}: ${describeValue(value)}`);
    return parts.length > 0 ? parts.join(' · ') : null;
  } catch {
    return row.detail.slice(0, 200);
  }
};

type AuditLogViewProps = { user: CurrentUser };

export const AuditLogView = ({ user }: AuditLogViewProps) => {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');
  const [actorMemberId, setActorMemberId] = useState('');
  const [range, setRange] = useState('7d');
  const [sensitiveOnly, setSensitiveOnly] = useState(true);

  const [rows, setRows] = useState<AuditEventRow[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const filters = useMemo((): AuditQueryFilters => {
    const hours = RANGES.find((r) => r.key === range)?.hours ?? 0;
    return {
      search: debounced || undefined,
      category: category || undefined,
      // The severity picker wins over the "sensitive only" default so a
      // reviewer can still go and look at the quiet events deliberately.
      severity: severity || undefined,
      actorMemberId: actorMemberId || undefined,
      fromIso:
        hours > 0
          ? new Date(Date.now() - hours * 3600_000).toISOString()
          : undefined,
    };
  }, [debounced, category, severity, actorMemberId, range]);

  const load = useCallback(
    async (after: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const page = await fetchAuditEvents(filters, PAGE_SIZE, after);
        setRows((previous) =>
          after === null ? page.rows : [...(previous ?? []), ...page.rows],
        );
        setCursor(page.endCursor);
        setHasMore(page.hasMore);
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        if (/AuditEvent|Cannot query field|Unknown type/i.test(message)) {
          markAuditLogUnsupported();
          setUnsupported(true);
        } else {
          setError(TAUDIT.auditLoadFailed);
        }
      } finally {
        setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  // Reading the security log is itself a sensitive read.
  useEffect(() => {
    recordAudit({
      eventType: 'screen.view',
      category: 'read',
      severity: 'critical',
      targetType: 'auditEvent',
      targetLabel: 'audit log',
    });
  }, []);

  if (!user.isAdmin) {
    return (
      <main className="page">
        <div className="empty-state">{TAUDIT.auditAdminOnly}</div>
      </main>
    );
  }

  const visible =
    rows === null
      ? null
      : sensitiveOnly && severity === ''
        ? rows.filter((r) => r.severity === 'sensitive' || r.severity === 'critical')
        : rows;

  const pending = pendingAuditCount();

  return (
    <main className="page">
      <AuditWatermark user={user} active />

      <div className="page-head anim">
        <div>
          <h1>{TAUDIT.auditTitle}</h1>
          <div className="sub">{TAUDIT.auditSubtitle}</div>
        </div>
      </div>

      {unsupported && (
        <div className="error-banner">{TAUDIT.auditUnsupported}</div>
      )}

      {!unsupported && (
        <>
          <div className="toolbar anim d1">
            <div className="audit-filters">
              <input
                className="btn line sm"
                style={{ minWidth: 210 }}
                placeholder={TAUDIT.auditSearchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <AuditActorPicker
                value={actorMemberId}
                onChange={setActorMemberId}
              />
              <select
                className="btn line sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">
                  {TAUDIT.auditFilterCategory}: {TAUDIT.auditFilterAll}
                </option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {TAUDIT.auditCategory[c] ?? c}
                  </option>
                ))}
              </select>
              <select
                className="btn line sm"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              >
                <option value="">
                  {TAUDIT.auditFilterSeverity}: {TAUDIT.auditFilterAll}
                </option>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {TAUDIT.auditSeverity[s] ?? s}
                  </option>
                ))}
              </select>
              <div className="seg">
                {RANGES.map((r) => (
                  <button
                    key={r.key}
                    className={`btn line sm${range === r.key ? ' on' : ''}`}
                    onClick={() => setRange(r.key)}
                  >
                    {TAUDIT[r.labelKey]}
                  </button>
                ))}
              </div>
              <label className="chk" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={sensitiveOnly}
                  onChange={(e) => setSensitiveOnly(e.target.checked)}
                />
                {TAUDIT.auditSensitiveOnly}
              </label>
              <button className="btn line sm" onClick={() => void load(null)}>
                {TAUDIT.auditRefresh}
              </button>
            </div>
          </div>

          {pending > 0 && (
            <div className="sub" style={{ marginBottom: 8 }}>
              {toPersianDigits(pending)} {TAUDIT.auditPending}
            </div>
          )}

          {error !== null && <div className="error-banner">{error}</div>}

          {visible === null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton" style={{ height: 46 }} />
              ))}
            </div>
          )}

          {visible !== null && visible.length === 0 && (
            <div className="empty-state">{TAUDIT.auditEmpty}</div>
          )}

          {visible !== null && visible.length > 0 && (
            <div className="card anim d2" style={{ overflow: 'hidden' }}>
              {visible.map((row) => (
                <AuditRow key={row.id} row={row} />
              ))}
            </div>
          )}

          {hasMore && (
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <button
                className="btn line sm"
                disabled={loading}
                onClick={() => void load(cursor)}
              >
                {loading ? TAUDIT.auditLoading : TAUDIT.auditMore}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
};

const AuditRow = ({ row }: { row: AuditEventRow }) => {
  const skew = clockSkewMinutes(row);
  const detail = describeDetail(row);
  const target = [row.targetType, row.targetLabel ?? row.targetId]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="audit-row">
      <span className={`audit-sev ${row.severity}`} />
      <div className="audit-main">
        <div className="audit-title">
          <span>{TAUDIT.auditEventType[row.eventType] ?? row.eventType}</span>
          <span className="pill stage">
            {TAUDIT.auditCategory[row.category] ?? row.category}
          </span>
          {row.actorName && <span className="owner">{row.actorName}</span>}
        </div>
        <div className="audit-sub">
          {target && (
            <>
              {TAUDIT.auditOn} {target}
              {' — '}
            </>
          )}
          {row.route}
          {detail && ` — ${detail}`}
          {row.device && ` — ${row.device}`}
          {row.ipAddress && ` — ${row.ipAddress}`}
        </div>
      </div>
      <div className="audit-when">
        {formatDateTime(row.occurredAt)}
        {skew !== null && (
          <div className="audit-skew">
            {TAUDIT.auditClockSkew}: {toPersianDigits(skew)}′
          </div>
        )}
      </div>
    </div>
  );
};
