import {
  type CurrencyTotals,
  formatMoneyTotals,
  totalsAreEmpty,
} from '../../lib/format';
import { toPersianDigits } from '../../lib/jalali';

// Vertical bar chart, used for the registrations trend over time buckets.
export const Bars = ({ series }: { series: { label: string; count: number }[] }) => {
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

// Horizontal ranked rows: a labelled bar with a count and an optional value.
// Reused across every breakdown card (stage/source/temp/marketer/product/...).
// The value is per-currency: a row holding both AFN and USD leads shows both
// rather than a sum of two different units. Abbreviated, because the row has
// only the space left over from the bar.
export const BreakdownRows = ({
  rows,
}: {
  rows: { label: string; count: number; value: CurrencyTotals }[];
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
            {!totalsAreEmpty(r.value)
              ? ` · ${formatMoneyTotals(r.value, { compact: true })}`
              : ''}
          </span>
        </div>
      ))}
    </div>
  );
};
