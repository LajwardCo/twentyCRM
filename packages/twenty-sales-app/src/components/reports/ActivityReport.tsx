import { useMemo } from 'react';

import { fetchDoneTasksSince, type TaskType } from '../../api/records';
import { useCached } from '../../lib/cache';
import { toPersianDigits } from '../../lib/jalali';
import { computeActivity } from '../../lib/reportAggregations';
import { T2, TASK_TYPE_LABELS } from '../../lib/strings';
import { BreakdownRows } from './ReportPrimitives';

type ActivityReportProps = {
  periodStartIso: string;
  scope: 'me' | 'team';
  sellerId: string;
};

const TYPE_ORDER: TaskType[] = ['CALL', 'MEETING', 'DEMO', 'VISIT', 'OTHER'];

// Activity tab: done tasks broken down by type (call/meeting/demo/visit) — a
// team-wide mix plus a per-seller table (team scope). Fetches its own done
// tasks, filtered to the current seller in "me" scope.
export const ActivityReport = ({
  periodStartIso,
  scope,
  sellerId,
}: ActivityReportProps) => {
  const { data, error } = useCached(
    `report-activity:${scope}:${sellerId}:${periodStartIso}`,
    () =>
      fetchDoneTasksSince(periodStartIso, scope === 'me' ? sellerId : undefined),
  );

  const stats = useMemo(
    () => computeActivity(data ?? [], TASK_TYPE_LABELS),
    [data],
  );
  const loading = data === null && error === null;

  if (loading) {
    return <div className="skeleton" style={{ height: 160 }} />;
  }
  if (!data || data.length === 0) {
    return <div className="empty-state">{T2.noActivityData}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <div className="sub" style={{ marginBottom: 6 }}>
          {T2.activityMix}
        </div>
        <BreakdownRows rows={stats.mix} />
      </div>

      {scope === 'team' && stats.bySeller.length > 0 && (
        <div>
          <div className="sub" style={{ marginBottom: 6 }}>
            {T2.activityBySeller}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="leads">
              <thead>
                <tr>
                  <th>{T2.seller}</th>
                  {TYPE_ORDER.map((type) => (
                    <th key={type}>{TASK_TYPE_LABELS[type]}</th>
                  ))}
                  <th>{T2.totalTasksDone}</th>
                </tr>
              </thead>
              <tbody>
                {stats.bySeller.map((row) => (
                  <tr key={row.sellerId}>
                    <td>{row.name}</td>
                    {TYPE_ORDER.map((type) => (
                      <td key={type} className="num">
                        {toPersianDigits(row.byType[type] ?? 0)}
                      </td>
                    ))}
                    <td className="num">{toPersianDigits(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
