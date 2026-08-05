import { useMemo, useState } from 'react';

import { type CurrentUser } from '../api/auth';
import {
  fetchAllDoneTasksSince,
  fetchAllLeads,
  fetchLeadsMarketers,
} from '../api/records';
import { ActivityReport } from '../components/reports/ActivityReport';
import { MarketerLeaderboard } from '../components/reports/MarketerLeaderboard';
import { OverviewReport } from '../components/reports/OverviewReport';
import { ProductPerformance } from '../components/reports/ProductPerformance';
import { SellerLeaderboard } from '../components/SellerLeaderboard';
import { useCached } from '../lib/cache';
import { formatJalaliDate, toPersianDigits } from '../lib/jalali';
import { T2 } from '../lib/strings';

type ReportsViewProps = {
  user: CurrentUser;
};

type Period = 'week' | 'month' | 'quarter';
type Scope = 'me' | 'team';
type Tab = 'overview' | 'sellers' | 'marketers' | 'products' | 'activity';

const periodStart = (period: Period): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === 'week') d.setDate(d.getDate() - 7);
  if (period === 'month') d.setDate(d.getDate() - 30);
  if (period === 'quarter') d.setDate(d.getDate() - 90);
  return d;
};

// Sellers/Marketers are team-wide concepts; hide those tabs in "me" scope
// where there's only one seller in view.
const TABS: { key: Tab; label: string; teamOnly?: boolean }[] = [
  { key: 'overview', label: T2.tabOverview },
  { key: 'sellers', label: T2.tabSellers, teamOnly: true },
  { key: 'marketers', label: T2.tabMarketers, teamOnly: true },
  { key: 'products', label: T2.tabProducts },
  { key: 'activity', label: T2.tabActivity },
];

export const ReportsView = ({ user }: ReportsViewProps) => {
  const [period, setPeriod] = useState<Period>('month');
  const [scope, setScope] = useState<Scope>('me');
  const [tab, setTab] = useState<Tab>('overview');

  const start = useMemo(() => periodStart(period), [period]);
  const startIso = start.toISOString();

  // Shared lead set (+ me-scope done-task count, +team marketer map) that the
  // Overview / Sellers / Marketers sections read. Products and Activity fetch
  // their own data lazily inside their components.
  //
  // Every lead is fetched, not the first page: the funnel, the open-pipeline
  // value and the active-customer count are all-time figures, and asking for a
  // single page of 300 is what made the reports stop describing the pipeline
  // once it passed 300 leads.
  const { data, error } = useCached(
    `reports:${user.workspaceMemberId}:${scope}:${period}`,
    async () => {
      const [leadPage, doneTasks] = await Promise.all([
        fetchAllLeads({
          ownerId: scope === 'me' ? user.workspaceMemberId : undefined,
        }),
        scope === 'me'
          ? fetchAllDoneTasksSince(startIso, user.workspaceMemberId)
          : Promise.resolve({ items: [], truncated: false }),
      ]);
      const inPeriodIds = leadPage.items
        .filter((l) => new Date(l.createdAt) >= start)
        .map((l) => l.id);
      const marketerMap =
        scope === 'team' ? await fetchLeadsMarketers(inPeriodIds) : {};
      return {
        leads: leadPage.items,
        doneTasks: doneTasks.items,
        marketerMap,
        truncated: leadPage.truncated || doneTasks.truncated,
      };
    },
  );

  const leads = data?.leads ?? null;
  const marketerMap = data?.marketerMap ?? {};
  const hasMarketerData = Object.values(marketerMap).some(
    (v) => v !== null && v !== undefined,
  );
  const loading = leads === null && error === null;

  const inPeriodLeads = useMemo(
    () => (leads ?? []).filter((l) => new Date(l.createdAt) >= start),
    [leads, start],
  );

  // A team-only tab stays selected in team scope; when switching to "me" scope
  // fall back to Overview rather than showing an empty team-only section.
  const activeTab: Tab =
    scope === 'me' && TABS.find((t) => t.key === tab)?.teamOnly ? 'overview' : tab;
  const visibleTabs = TABS.filter((t) => !(scope === 'me' && t.teamOnly));

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>{T2.reports}</h1>
          <div className="sub">
            {`از ${formatJalaliDate(startIso)} تا امروز`}
            {leads !== null
              ? ` · ${toPersianDigits(leads.length)} ${T2.leadsCounted}`
              : ''}
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

      <div className="seg anim d1" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            className={activeTab === t.key ? 'on' : ''}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error !== null && <div className="error-banner">{error}</div>}

      {/* A capped fetch reads exactly like a complete one, so say so. */}
      {data?.truncated === true && (
        <div className="error-banner">{T2.partialData}</div>
      )}

      {activeTab === 'overview' && (
        <OverviewReport
          leads={leads ?? []}
          start={start}
          period={period}
          scope={scope}
          doneTasksCount={data?.doneTasks.length ?? 0}
          marketerMap={marketerMap}
          hasMarketerData={hasMarketerData}
          loading={loading}
        />
      )}

      {activeTab === 'sellers' && (
        <div className="card card-pad anim d2">
          <h3>{T2.sellerPerformance}</h3>
          <SellerLeaderboard leads={inPeriodLeads} periodStartIso={startIso} />
        </div>
      )}

      {activeTab === 'marketers' && (
        <div className="card card-pad anim d2">
          <h3>{T2.marketerPerformance}</h3>
          <MarketerLeaderboard
            leads={inPeriodLeads}
            marketerMap={marketerMap}
            hasMarketerData={hasMarketerData}
          />
        </div>
      )}

      {activeTab === 'products' && (
        <div className="card card-pad anim d2">
          <h3>{T2.productPerformance}</h3>
          <ProductPerformance periodStartIso={startIso} />
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="card card-pad anim d2">
          <h3>{T2.activityMix}</h3>
          <ActivityReport
            periodStartIso={startIso}
            scope={scope}
            sellerId={user.workspaceMemberId}
          />
        </div>
      )}
    </main>
  );
};
