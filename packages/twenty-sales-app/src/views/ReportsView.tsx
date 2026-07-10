import { useMemo, useState } from 'react';

import { type CurrentUser } from '../api/auth';
import {
  fetchDoneTasksSince,
  fetchLeads,
  fetchLeadsMarketers,
  OPEN_STAGES,
  type LeadSummary,
} from '../api/records';
import {
  IconCheck,
  IconFlame,
  IconMoney,
  IconTasks,
} from '../components/icons';
import { SellerLeaderboard } from '../components/SellerLeaderboard';
import { useCached } from '../lib/cache';
import { formatAfn, sumAmountMicros } from '../lib/format';
import { formatJalaliDate, toPersianDigits } from '../lib/jalali';
import {
  MARKETER_LABELS,
  SOURCE_LABELS,
  STAGE_LABELS,
  T2,
  TEMP_LABELS,
} from '../lib/strings';

type ReportsViewProps = {
  user: CurrentUser;
};

type Period = 'week' | 'month' | 'quarter';
type Scope = 'me' | 'team';

const periodStart = (period: Period): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === 'week') d.setDate(d.getDate() - 7);
  if (period === 'month') d.setDate(d.getDate() - 30);
  if (period === 'quarter') d.setDate(d.getDate() - 90);
  return d;
};

const BUCKETS: Record<Period, number> = { week: 7, month: 6, quarter: 12 };

const Bars = ({ series }: { series: { label: string; count: number }[] }) => {
  const max = Math.max(1, ...series.map((s) => s.count));
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 8,
        height: 130,
        padding: '8px 4px 0',
      }}
    >
      {series.map((s, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 5,
            minWidth: 0,
          }}
        >
          <span className="num" style={{ fontSize: 11, fontWeight: 750 }}>
            {s.count > 0 ? toPersianDigits(s.count) : ''}
          </span>
          <div
            style={{
              width: '100%',
              maxWidth: 38,
              height: `${Math.max(4, (s.count / max) * 88)}px`,
              borderRadius: 6,
              background:
                s.count > 0
                  ? 'linear-gradient(180deg, var(--lapis-500), var(--lapis-800))'
                  : 'var(--line-soft)',
              transition: 'height .5s cubic-bezier(.2,.7,.3,1)',
            }}
          />
          <span
            style={{
              fontSize: 10,
              color: 'var(--ink-3)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
            }}
            className="num"
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
};

const BreakdownRows = ({
  rows,
}: {
  rows: { label: string; count: number; value: number }[];
}) => {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="funnel">
      {rows.map((r) => (
        <div className="f-row" key={r.label}>
          <span className="f-lbl">{r.label}</span>
          <div className="f-bar">
            <i style={{ width: `${Math.round((r.count / max) * 100)}%` }} />
          </div>
          <span className="f-meta num">
            <b>{toPersianDigits(r.count)}</b>
            {r.value > 0 ? ` · ${formatAfn(r.value)}` : ''}
          </span>
        </div>
      ))}
    </div>
  );
};

export const ReportsView = ({ user }: ReportsViewProps) => {
  const [period, setPeriod] = useState<Period>('month');
  const [scope, setScope] = useState<Scope>('me');

  const start = useMemo(() => periodStart(period), [period]);

  const { data, error } = useCached(
    `reports:${user.workspaceMemberId}:${scope}:${period}`,
    async () => {
      const [leads, doneTasks] = await Promise.all([
        fetchLeads({
          ownerId: scope === 'me' ? user.workspaceMemberId : undefined,
          limit: 300,
        }),
        scope === 'me'
          ? fetchDoneTasksSince(start.toISOString(), user.workspaceMemberId)
          : Promise.resolve([]),
      ]);
      return { leads, doneTasks };
    },
  );

  const leads = data?.leads ?? null;

  const inPeriod = useMemo(
    () =>
      (leads ?? []).filter((l) => new Date(l.createdAt) >= start),
    [leads, start],
  );
  const openLeads = useMemo(
    () => (leads ?? []).filter((l) => l.stage && OPEN_STAGES.includes(l.stage)),
    [leads],
  );
  const activeCustomers = (leads ?? []).filter(
    (l) => l.stage === 'ACTIVE_CUSTOMER',
  );

  // trend buckets over the period
  const trend = useMemo(() => {
    const buckets = BUCKETS[period];
    const spanMs = Date.now() - start.getTime();
    const step = spanMs / buckets;
    return Array.from({ length: buckets }, (_, i) => {
      const from = start.getTime() + i * step;
      const to = from + step;
      const count = inPeriod.filter((l) => {
        const t = new Date(l.createdAt).getTime();
        return t >= from && t < to;
      }).length;
      const label =
        period === 'week'
          ? formatJalaliDate(new Date(from).toISOString()).split(' ')[0]
          : formatJalaliDate(new Date(from).toISOString())
              .split(' ')
              .slice(0, 2)
              .join(' ');
      return { label, count };
    });
  }, [inPeriod, period, start]);

  const groupBy = (
    items: LeadSummary[],
    key: (l: LeadSummary) => string | null,
    labels: Record<string, string>,
  ) => {
    const groups = new Map<string, LeadSummary[]>();
    for (const item of items) {
      const k = key(item) ?? '—';
      groups.set(k, [...(groups.get(k) ?? []), item]);
    }
    return [...groups.entries()]
      .map(([k, list]) => ({
        label: labels[k] ?? k,
        count: list.length,
        value: sumAmountMicros(list),
      }))
      .sort((a, b) => b.count - a.count);
  };

  const byStage = useMemo(
    () => groupBy(inPeriod, (l) => l.stage, STAGE_LABELS),
    [inPeriod],
  );
  const bySource = useMemo(
    () => groupBy(inPeriod, (l) => l.leadSource, SOURCE_LABELS),
    [inPeriod],
  );
  const byTemp = useMemo(
    () => groupBy(inPeriod, (l) => l.temperature, TEMP_LABELS),
    [inPeriod],
  );
  const { data: marketerMap } = useCached(
    `reports-marketers:${scope}:${period}`,
    (): Promise<Record<string, string | null>> =>
      scope === 'team'
        ? fetchLeadsMarketers(inPeriod.map((l) => l.id))
        : Promise.resolve({}),
  );
  const hasMarketerData = Object.values(marketerMap ?? {}).some(
    (v) => v !== null && v !== undefined,
  );
  const byMarketer = useMemo(
    () => groupBy(inPeriod, (l) => marketerMap?.[l.id] ?? null, MARKETER_LABELS),
    [inPeriod, marketerMap],
  );

  const loading = leads === null && error === null;

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>{T2.reports}</h1>
          <div className="sub">
            {`از ${formatJalaliDate(start.toISOString())} تا امروز`}
          </div>
        </div>
      </div>

      <div className="toolbar anim d1">
        <div className="seg">
          <button className={period === 'week' ? 'on' : ''} onClick={() => setPeriod('week')}>
            {T2.thisWeek}
          </button>
          <button className={period === 'month' ? 'on' : ''} onClick={() => setPeriod('month')}>
            {T2.thisMonth}
          </button>
          <button
            className={period === 'quarter' ? 'on' : ''}
            onClick={() => setPeriod('quarter')}
          >
            {T2.threeMonths}
          </button>
        </div>
        <div className="seg">
          <button className={scope === 'me' ? 'on' : ''} onClick={() => setScope('me')}>
            {T2.me}
          </button>
          <button className={scope === 'team' ? 'on' : ''} onClick={() => setScope('team')}>
            {T2.team}
          </button>
        </div>
      </div>

      {error !== null && <div className="error-banner">{error}</div>}

      <div className="stats">
        <div className="card hoverable kpi anim d1">
          <div className="top">
            <span className="k-ico blue">
              <IconTasks size={17} />
            </span>
            <span className="lbl">{T2.leadsRegistered}</span>
          </div>
          <div className="row">
            {loading ? (
              <div className="skeleton" style={{ width: 50, height: 30 }} />
            ) : (
              <span className="big num">{toPersianDigits(inPeriod.length)}</span>
            )}
          </div>
        </div>
        {scope === 'me' && (
          <div className="card hoverable kpi anim d2">
            <div className="top">
              <span className="k-ico green">
                <IconCheck size={17} />
              </span>
              <span className="lbl">{T2.tasksDone}</span>
            </div>
            <div className="row">
              {loading ? (
                <div className="skeleton" style={{ width: 50, height: 30 }} />
              ) : (
                <span className="big num">
                  {toPersianDigits(data?.doneTasks.length ?? 0)}
                </span>
              )}
            </div>
          </div>
        )}
        <div className="card hoverable kpi anim d3">
          <div className="top">
            <span className="k-ico amber">
              <IconFlame size={17} />
            </span>
            <span className="lbl">{T2.activeCustomers}</span>
          </div>
          <div className="row">
            {loading ? (
              <div className="skeleton" style={{ width: 50, height: 30 }} />
            ) : (
              <span className="big num">{toPersianDigits(activeCustomers.length)}</span>
            )}
          </div>
        </div>
        <div className="card hoverable kpi anim d4">
          <div className="top">
            <span className="k-ico green">
              <IconMoney size={17} />
            </span>
            <span className="lbl">{T2.openPipelineValue}</span>
          </div>
          <div className="row">
            {loading ? (
              <div className="skeleton" style={{ width: 70, height: 30 }} />
            ) : (
              <span className="big num">{formatAfn(sumAmountMicros(openLeads))}</span>
            )}
            <span className="hint">
              {leads !== null ? `${toPersianDigits(openLeads.length)} لید باز` : ''}
            </span>
          </div>
        </div>
      </div>

      <div className="card anim d2" style={{ marginBottom: 16 }}>
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <h3>{T2.registrationsTrend}</h3>
          <div className="sub">
            {scope === 'me' ? 'لیدهای شما' : 'کل تیم'} در این دوره
          </div>
        </div>
        {loading ? (
          <div className="skeleton" style={{ height: 130, margin: 16 }} />
        ) : inPeriod.length === 0 ? (
          <div className="empty-state">{T2.noData}</div>
        ) : (
          <div style={{ padding: '0 14px 12px' }}>
            <Bars series={trend} />
          </div>
        )}
      </div>

      <div className="dash-grid">
        <div className="stack">
          <div className="card card-pad anim d3">
            <h3>{T2.byStage}</h3>
            {inPeriod.length === 0 ? (
              <div className="empty-state">{T2.noData}</div>
            ) : (
              <BreakdownRows rows={byStage} />
            )}
          </div>
          {scope === 'team' && (
            <div className="card card-pad anim d4">
              <h3>{T2.sellerPerformance}</h3>
              <SellerLeaderboard leads={inPeriod} periodStartIso={start.toISOString()} />
            </div>
          )}
        </div>
        <div className="stack">
          <div className="card card-pad anim d4">
            <h3>{T2.bySource}</h3>
            {inPeriod.length === 0 ? (
              <div className="empty-state">{T2.noData}</div>
            ) : (
              <BreakdownRows rows={bySource} />
            )}
          </div>
          <div className="card card-pad anim d5">
            <h3>{T2.byTemperature}</h3>
            {inPeriod.length === 0 ? (
              <div className="empty-state">{T2.noData}</div>
            ) : (
              <BreakdownRows rows={byTemp} />
            )}
          </div>
          {scope === 'team' && hasMarketerData && (
            <div className="card card-pad anim d5">
              <h3>{T2.byMarketer}</h3>
              <BreakdownRows rows={byMarketer} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
