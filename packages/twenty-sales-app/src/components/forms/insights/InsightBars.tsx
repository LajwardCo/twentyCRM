import { type AnswerBuckets, formatPercent, percentOf } from '../../../lib/forms/insights';
import { TINS } from '../../../lib/forms/insightStrings';
import { toPersianDigits } from '../../../lib/jalali';

export type DistributionRow = {
  key: string;
  label: string;
  count: number;
  note?: string;
  tone?: 'muted' | 'accent';
};

// Horizontal bars whose length is the share of `denominator`, so a 40% bar
// means 40% of the stated base — not "relative to the biggest row".
export const DistributionBars = ({
  rows,
  denominator,
}: {
  rows: DistributionRow[];
  denominator: number;
}) => (
  <ul className="svk-dist">
    {rows.map((row) => {
      const percent = percentOf(row.count, denominator);

      return (
        <li key={row.key} className={row.tone === undefined ? undefined : `svk-${row.tone}`}>
          <span className="svk-dist-label" dir="auto" title={row.label}>
            {row.label}
            {row.note !== undefined && <small>{row.note}</small>}
          </span>
          <span className="svk-dist-track" aria-hidden="true">
            <i style={{ width: `${Math.min(100, percent ?? 0)}%` }} />
          </span>
          <span className="svk-dist-meta num">
            <b>{toPersianDigits(row.count)}</b> · {formatPercent(percent)}
          </span>
        </li>
      );
    })}
  </ul>
);

const SEGMENTS: { key: keyof Omit<AnswerBuckets, 'total'>; label: string; short: string }[] = [
  { key: 'answered', label: TINS.answered, short: TINS.answered },
  { key: 'unanswered', label: TINS.unanswered, short: TINS.unansweredShort },
  { key: 'skippedByLogic', label: TINS.skippedByLogic, short: TINS.skippedShort },
  { key: 'notInVersion', label: TINS.notInVersion, short: TINS.notInVersionShort },
  { key: 'notShownToChannel', label: TINS.notShownToChannel, short: TINS.notShownShort },
];

// One stacked bar: where this question stands across every counted
// response. The four standard buckets always show (zeros included) so the
// reader can see they add up to the total.
export const AnswerStatusBar = ({ buckets }: { buckets: AnswerBuckets }) => {
  const visible = SEGMENTS.filter(
    (segment) => segment.key !== 'notShownToChannel' || buckets.notShownToChannel > 0,
  );

  return (
    <div className="svk-status">
      <div className="svk-status-track" aria-hidden="true">
        {visible.map((segment) =>
          buckets[segment.key] === 0 ? null : (
            <i
              key={segment.key}
              className={`svk-seg-${segment.key}`}
              style={{ width: `${percentOf(buckets[segment.key], buckets.total) ?? 0}%` }}
            />
          ),
        )}
      </div>
      <ul className="svk-status-legend">
        {visible.map((segment) => (
          <li key={segment.key} title={segment.label}>
            <span className={`svk-dot svk-seg-${segment.key}`} aria-hidden="true" />
            <span>{segment.short}</span>
            <b className="num">{TINS.ofResponses(buckets[segment.key], buckets.total)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const TargetBar = ({ ratio, label }: { ratio: number; label: string }) => (
  <div
    className="svk-target"
    role="progressbar"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(ratio * 100)}
    aria-label={label}
  >
    <i style={{ width: `${Math.round(ratio * 100)}%` }} />
  </div>
);
