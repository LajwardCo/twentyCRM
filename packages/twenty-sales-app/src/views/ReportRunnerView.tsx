import { useMemo, useState } from 'react';

import { type CurrentUser } from '../api/auth';
import { loadReportDataset } from '../api/reportsData';
import { FilterBar } from '../components/FilterBar';
import { IconChart, IconRefresh } from '../components/icons';
import { ReportKpis } from '../components/reports/ReportKpis';
import { ReportTable } from '../components/reports/ReportTable';
import { BreakdownRows } from '../components/reports/ReportPrimitives';
import { useCached } from '../lib/cache';
import { applyFilters } from '../lib/filters';
import { formatJalaliDate, toPersianDigits } from '../lib/jalali';
import { findReport, RT } from '../lib/reports';
import {
  breakdownRows,
  downloadCsv,
  GROUP_COUNT_KEY,
  groupColumns,
  groupRows,
  reportFilterFields,
  sortRows,
  toCsv,
} from '../lib/reports/engine';
import {
  type ReportContext,
  type ReportScope,
} from '../lib/reports/types';
import { navigate, useRoute } from '../lib/router';
import { useFilters } from '../lib/useFilters';

type ReportRunnerViewProps = {
  reportId: string;
  user: CurrentUser;
};

type Period = 'week' | 'month' | 'quarter' | 'year' | 'all';

const PERIOD_DAYS: Record<Exclude<Period, 'all'>, number> = {
  week: 7,
  month: 30,
  quarter: 90,
  year: 365,
};

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: RT.periodWeek },
  { key: 'month', label: RT.periodMonth },
  { key: 'quarter', label: RT.periodQuarter },
  { key: 'year', label: RT.periodYear },
  { key: 'all', label: RT.periodAll },
];

const periodStart = (period: Period): Date | null => {
  if (period === 'all') return null;
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - PERIOD_DAYS[period]);
  return date;
};

// Datasets bounded by a date need one even for "all time"; the epoch is the
// honest answer -- it asks the server for everything rather than pretending a
// window exists.
const EPOCH_ISO = new Date(0).toISOString();

const IconDownload = ({ size = 15 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

// One screen runs every report in the catalog: the definition says what the
// rows mean, and everything around them -- period, scope, filters, grouping,
// sorting, export -- works identically wherever you are.
export const ReportRunnerView = ({ reportId, user }: ReportRunnerViewProps) => {
  const report = findReport(reportId);
  const route = useRoute();

  const [period, setPeriod] = useState<Period>('month');
  const [scope, setScope] = useState<ReportScope>('team');
  const [groupKey, setGroupKey] = useState<string>('');
  const [sort, setSort] = useState(report?.defaultSort ?? { key: '', dir: 'desc' as const });

  const start = useMemo(() => periodStart(period), [period]);
  const sinceIso = start ? start.toISOString() : EPOCH_ISO;

  const needsKey = report ? [...report.needs].sort().join(',') : '';
  const { data, error, refreshing, refresh } = useCached(
    `report-data:${needsKey}:${sinceIso}`,
    () => loadReportDataset(report?.needs ?? [], sinceIso),
  );

  const ctx: ReportContext = useMemo(
    () => ({ user, scope, start, now: new Date() }),
    [user, scope, start],
  );

  const rows = useMemo(
    () => (report && data ? report.build(data, ctx) : []),
    [report, data, ctx],
  );

  // Columns are static, so the fields exist from the first render and an
  // incoming ?filter= link is decoded before the data lands.
  const fields = useMemo(
    () => (report ? reportFilterFields(report.columns, rows) : []),
    [report, rows],
  );
  const filters = useFilters(`report:${reportId}`, fields, route.query);

  const filtered = useMemo(
    () => applyFilters(fields, filters.state, rows),
    [fields, filters.state, rows],
  );

  const grouped = useMemo(() => {
    if (!report || groupKey === '') {
      return { columns: report?.columns ?? [], rows: filtered };
    }
    return {
      columns: groupColumns(report.columns, groupKey),
      rows: groupRows(filtered, report.columns, groupKey),
    };
  }, [report, groupKey, filtered]);

  // A sort on a column the grouped view does not have would silently do
  // nothing, so fall back to the group size.
  const activeSort = useMemo(() => {
    const hasColumn = grouped.columns.some((column) => column.key === sort.key);
    if (hasColumn) return sort;
    return {
      key: groupKey === '' ? (report?.defaultSort.key ?? '') : GROUP_COUNT_KEY,
      dir: 'desc' as const,
    };
  }, [grouped.columns, sort, groupKey, report]);

  const visible = useMemo(
    () => sortRows(grouped.rows, grouped.columns, activeSort.key, activeSort.dir),
    [grouped, activeSort],
  );

  const chart = useMemo(
    () =>
      report?.chart
        ? breakdownRows(
            filtered,
            report.chart.groupBy,
            report.chart.value,
            report.chart.count,
          )
        : [],
    [report, filtered],
  );

  if (!report) {
    return (
      <main className="page">
        <div className="empty-state">{RT.noReportFound}</div>
      </main>
    );
  }

  const loading = data === null && error === null;
  const missing = (data?.missing ?? []).filter((key) =>
    report.needs.includes(key),
  );

  const toggleSort = (key: string) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: 'desc' },
    );
  };

  const exportCsv = () => {
    downloadCsv(
      `${report.id}-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(visible, grouped.columns),
    );
  };

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <button className="rpt-crumb" onClick={() => navigate('/reports')}>
            <IconChart size={13} />
            {RT.backToLibrary}
          </button>
          <h1>{report.title}</h1>
          <div className="sub">
            {report.description}
            {' · '}
            {start
              ? `${RT.since} ${formatJalaliDate(start.toISOString())} ${RT.untilNow}`
              : RT.allTime}
            {` · ${toPersianDigits(visible.length)} ${RT.rows}`}
          </div>
        </div>
      </div>

      <div className="toolbar anim d1">
        <div className="seg">
          {PERIODS.map((option) => (
            <button
              key={option.key}
              className={period === option.key ? 'on' : ''}
              onClick={() => setPeriod(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {report.scoped === true && (
          <div className="seg">
            <button
              className={scope === 'me' ? 'on' : ''}
              onClick={() => setScope('me')}
            >
              {RT.scopeMe}
            </button>
            <button
              className={scope === 'team' ? 'on' : ''}
              onClick={() => setScope('team')}
            >
              {RT.scopeTeam}
            </button>
          </div>
        )}

        <FilterBar fields={fields} filters={filters} resultCount={filtered.length} />

        {report.groupBy && report.groupBy.length > 0 && (
          <select
            className="rpt-select"
            value={groupKey}
            onChange={(event) => setGroupKey(event.target.value)}
            aria-label={RT.groupBy}
          >
            <option value="">{RT.noGrouping}</option>
            {report.groupBy.map((key) => (
              <option key={key} value={key}>
                {`${RT.groupBy}: ${
                  report.columns.find((column) => column.key === key)?.label ?? key
                }`}
              </option>
            ))}
          </select>
        )}

        <div className="grow" />

        <button
          className="btn line sm"
          onClick={exportCsv}
          disabled={visible.length === 0}
        >
          <IconDownload size={14} />
          {RT.exportCsv}
        </button>
        <button
          className="btn line sm"
          onClick={() => void refresh()}
          disabled={refreshing}
        >
          <IconRefresh size={14} />
          {RT.refresh}
        </button>
      </div>

      {error !== null && <div className="error-banner">{RT.loadFailed} — {error}</div>}
      {missing.length > 0 && (
        <div className="error-banner">{RT.notProvisioned}</div>
      )}
      {data?.truncated === true && (
        <div className="error-banner">{RT.partialData}</div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="skeleton" style={{ height: 92 }} />
          <div className="skeleton" style={{ height: 320 }} />
        </div>
      ) : (
        <>
          {report.kpis && (
            <div className="anim d1">
              <ReportKpis kpis={report.kpis(filtered, ctx)} />
            </div>
          )}

          {chart.length > 1 && (
            <div className="card card-pad anim d2" style={{ marginBottom: 16 }}>
              <h3>
                {report.columns.find(
                  (column) => column.key === report.chart?.groupBy,
                )?.label ?? RT.groupBy}
              </h3>
              <BreakdownRows rows={chart} />
            </div>
          )}

          <div className="card anim d2">
            <ReportTable
              columns={grouped.columns}
              rows={visible}
              sort={activeSort}
              onSort={toggleSort}
            />
          </div>
        </>
      )}
    </main>
  );
};
