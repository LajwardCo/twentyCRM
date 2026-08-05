import { useMemo } from 'react';

import { type LeadSummary } from '../../api/records';
import { formatMoneyTotals } from '../../lib/format';
import { toPersianDigits } from '../../lib/jalali';
import { computeMarketerLeaderboard } from '../../lib/reportAggregations';
import { MARKETER_LABELS, T2 } from '../../lib/strings';
import { BreakdownRows } from './ReportPrimitives';

type MarketerLeaderboardProps = {
  leads: LeadSummary[];
  marketerMap: Record<string, string | null | undefined>;
  hasMarketerData: boolean;
};

// Marketers tab: per-marketer leaderboard (leads brought / won / conversion /
// pipeline) plus the simple count breakdown below. Marketer is a
// production-only ad-hoc field, so when it's absent we show a clear notice
// instead of an empty table.
export const MarketerLeaderboard = ({
  leads,
  marketerMap,
  hasMarketerData,
}: MarketerLeaderboardProps) => {
  const rows = useMemo(
    () => computeMarketerLeaderboard(leads, marketerMap, MARKETER_LABELS),
    [leads, marketerMap],
  );
  const breakdown = useMemo(
    () => rows.map((r) => ({ label: r.label, count: r.leads, value: r.pipelineValue })),
    [rows],
  );

  if (!hasMarketerData) {
    return <div className="empty-state">{T2.marketerFieldMissing}</div>;
  }
  if (rows.length === 0) {
    return <div className="empty-state">{T2.noData}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="leads">
          <thead>
            <tr>
              <th>{T2.marketerLbl}</th>
              <th>{T2.leadsBrought}</th>
              <th>{T2.wonLbl}</th>
              <th>{T2.winRateLbl}</th>
              <th>{T2.openPipelineValue}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td className="num">{toPersianDigits(row.leads)}</td>
                <td className="num">{toPersianDigits(row.won)}</td>
                <td className="num">{toPersianDigits(row.winRate)}٪</td>
                <td className="num">{formatMoneyTotals(row.pipelineValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <div className="sub" style={{ marginBottom: 6 }}>
          {T2.byMarketer}
        </div>
        <BreakdownRows rows={breakdown} />
      </div>
    </div>
  );
};
