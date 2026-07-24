import { useMemo } from 'react';

import { type LeadSummary } from '../../api/records';
import { toPersianDigits } from '../../lib/jalali';
import {
  computeFunnel,
  computeSourceConversion,
  computeWinLoss,
} from '../../lib/reportAggregations';
import { SOURCE_LABELS, STAGE_LABELS, T2 } from '../../lib/strings';
import { BreakdownRows } from './ReportPrimitives';

type ConversionFunnelProps = {
  leads: LeadSummary[];
};

// Overview extra: pipeline funnel, headline win rate, won/lost, and per-source
// conversion. All derived from the already-fetched lead set — no extra query.
export const ConversionFunnel = ({ leads }: ConversionFunnelProps) => {
  const funnel = useMemo(() => computeFunnel(leads, STAGE_LABELS), [leads]);
  const winLoss = useMemo(() => computeWinLoss(leads), [leads]);
  const sourceConversion = useMemo(
    () => computeSourceConversion(leads, SOURCE_LABELS),
    [leads],
  );

  if (leads.length === 0) {
    return <div className="empty-state">{T2.noData}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <span className="big num" style={{ fontSize: 34 }}>
          {toPersianDigits(winLoss.winRate)}٪
        </span>
        <span className="lbl">{T2.winRateHeadline}</span>
        <span className="hint num" style={{ marginInlineStart: 'auto' }}>
          {`${T2.wonLbl}: ${toPersianDigits(winLoss.won)} · ${T2.lostLbl}: ${toPersianDigits(winLoss.lost)}`}
        </span>
      </div>

      <div>
        <div className="sub" style={{ marginBottom: 6 }}>
          {T2.conversionFunnel}
        </div>
        <BreakdownRows rows={funnel} />
      </div>

      <div>
        <div className="sub" style={{ marginBottom: 6 }}>
          {T2.sourceConversion}
        </div>
        <div className="funnel">
          {sourceConversion.map((row) => (
            <div className="f-row" key={row.label}>
              <span className="f-lbl">{row.label}</span>
              <div className="f-bar">
                <i style={{ width: `${row.rate}%` }} />
              </div>
              <span className="f-meta num">
                <b>{toPersianDigits(row.rate)}٪</b>
                {` · ${toPersianDigits(row.won)}/${toPersianDigits(row.registered)}`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
