import { type ReportKpi } from '../../lib/reports/types';

const TONE_CLASS: Record<string, string> = {
  good: 'rpt-good',
  bad: 'rpt-bad',
  warn: 'rpt-warn',
  muted: 'rpt-muted',
};

// The tile row above every report. Values arrive pre-formatted from the report
// definition, so a money tile can show "۱٬۲۰۰ ؋ + $۳۴۰" without the tile
// knowing anything about currencies.
export const ReportKpis = ({ kpis }: { kpis: ReportKpi[] }) => (
  <div className="stats">
    {kpis.map((item) => (
      <div className="card kpi" key={item.label}>
        <div className="top">
          <span className="lbl">{item.label}</span>
        </div>
        <div className="row">
          <span
            className={`big num${item.tone ? ` ${TONE_CLASS[item.tone]}` : ''}`}
          >
            {item.value}
          </span>
        </div>
        {item.hint && <div className="hint">{item.hint}</div>}
      </div>
    ))}
  </div>
);
