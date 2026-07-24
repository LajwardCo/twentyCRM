import { useMemo } from 'react';

import { fetchDealProductsSince } from '../../api/records';
import { IconMoney, IconTasks } from '../icons';
import { useCached } from '../../lib/cache';
import { formatAfn } from '../../lib/format';
import { toPersianDigits } from '../../lib/jalali';
import { computeProductStats } from '../../lib/reportAggregations';
import { T2 } from '../../lib/strings';
import { BreakdownRows } from './ReportPrimitives';

type ProductPerformanceProps = {
  periodStartIso: string;
};

// Products tab: analytics over dealProduct lines created in the period.
// Fetches its own data (the lead set doesn't carry product lines); degrades to
// an empty state where the dealProduct object isn't provisioned.
export const ProductPerformance = ({ periodStartIso }: ProductPerformanceProps) => {
  const { data, error } = useCached(`report-products:${periodStartIso}`, () =>
    fetchDealProductsSince(periodStartIso),
  );

  const stats = useMemo(() => computeProductStats(data ?? []), [data]);
  const loading = data === null && error === null;

  if (loading) {
    return <div className="skeleton" style={{ height: 180 }} />;
  }
  if (!data || data.length === 0) {
    return <div className="empty-state">{T2.noProductData}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="stats">
        <div className="card kpi">
          <div className="top">
            <span className="k-ico blue">
              <IconTasks size={16} />
            </span>
            <span className="lbl">{T2.dealLinesCount}</span>
          </div>
          <div className="row">
            <span className="big num">{toPersianDigits(stats.totals.lines)}</span>
          </div>
        </div>
        <div className="card kpi">
          <div className="top">
            <span className="k-ico green">
              <IconMoney size={16} />
            </span>
            <span className="lbl">{T2.installRevenue}</span>
          </div>
          <div className="row">
            <span className="big num">{formatAfn(stats.totals.installRevenue)}</span>
          </div>
        </div>
        <div className="card kpi">
          <div className="top">
            <span className="k-ico amber">
              <IconMoney size={16} />
            </span>
            <span className="lbl">{T2.annualRevenue}</span>
          </div>
          <div className="row">
            <span className="big num">{formatAfn(stats.totals.annualRevenue)}</span>
          </div>
        </div>
        <div className="card kpi">
          <div className="top">
            <span className="lbl">{T2.avgDiscount}</span>
          </div>
          <div className="row">
            <span className="big num">{toPersianDigits(stats.totals.avgDiscount)}٪</span>
          </div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="card card-pad">
          <h3>{T2.topProductsByUnits}</h3>
          <BreakdownRows rows={stats.byUnits} />
        </div>
        <div className="card card-pad">
          <h3>{T2.topProductsByRevenue}</h3>
          <BreakdownRows rows={stats.byRevenue} />
        </div>
      </div>
    </div>
  );
};
