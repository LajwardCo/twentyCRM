import { useMemo } from 'react';

import { OPEN_STAGES, type LeadSummary } from '../../api/records';
import { IconCheck, IconFlame, IconMoney, IconTasks } from '../icons';
import { formatAfn, sumAmountMicros } from '../../lib/format';
import { formatJalaliDate, toPersianDigits } from '../../lib/jalali';
import {
  MARKETER_LABELS,
  SOURCE_LABELS,
  STAGE_LABELS,
  T2,
  TEMP_LABELS,
} from '../../lib/strings';
import { ConversionFunnel } from './ConversionFunnel';
import { Bars, BreakdownRows } from './ReportPrimitives';

type Period = 'week' | 'month' | 'quarter';
type Scope = 'me' | 'team';

type OverviewReportProps = {
  leads: LeadSummary[];
  start: Date;
  period: Period;
  scope: Scope;
  doneTasksCount: number;
  marketerMap: Record<string, string | null | undefined>;
  hasMarketerData: boolean;
  loading: boolean;
};

const BUCKETS: Record<Period, number> = { week: 7, month: 6, quarter: 12 };

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

export const OverviewReport = ({
  leads,
  start,
  period,
  scope,
  doneTasksCount,
  marketerMap,
  hasMarketerData,
  loading,
}: OverviewReportProps) => {
  const inPeriod = useMemo(
    () => leads.filter((l) => new Date(l.createdAt) >= start),
    [leads, start],
  );
  const openLeads = useMemo(
    () => leads.filter((l) => l.stage && OPEN_STAGES.includes(l.stage)),
    [leads],
  );
  const activeCustomers = leads.filter((l) => l.stage === 'ACTIVE_CUSTOMER');

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
  const byMarketer = useMemo(
    () => groupBy(inPeriod, (l) => marketerMap[l.id] ?? null, MARKETER_LABELS),
    [inPeriod, marketerMap],
  );

  return (
    <>
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
                <span className="big num">{toPersianDigits(doneTasksCount)}</span>
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
              {!loading ? `${toPersianDigits(openLeads.length)} لید باز` : ''}
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
          <div className="card card-pad anim d4">
            <h3>{T2.conversionFunnel}</h3>
            <ConversionFunnel leads={inPeriod} />
          </div>
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
    </>
  );
};
