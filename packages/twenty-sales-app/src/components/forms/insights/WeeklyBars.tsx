import { useEffect, useRef } from 'react';

import { type WeekBucket } from '../../../lib/forms/insights';
import { TINS } from '../../../lib/forms/insightStrings';
import { toPersianDigits } from '../../../lib/jalali';

// Completed responses per week. Long campaigns scroll sideways rather than
// squeezing bars to slivers; it opens on the most recent weeks.
export const WeeklyBars = ({ buckets }: { buckets: WeekBucket[] }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));

  useEffect(() => {
    const element = scrollRef.current;

    if (element === null) return;

    const rtl = getComputedStyle(element).direction === 'rtl';

    element.scrollLeft = rtl ? -element.scrollWidth : element.scrollWidth;
  }, [buckets]);

  return (
    <div className="svk-weeks" ref={scrollRef}>
      <ol>
        {buckets.map((bucket) => (
          <li key={bucket.weekStart} title={TINS.weekOf(bucket.fullLabel, bucket.count)}>
            <span className="svk-week-count num">
              {bucket.count > 0 ? toPersianDigits(bucket.count) : ''}
            </span>
            <span
              className={`svk-week-bar${bucket.count === 0 ? ' svk-empty' : ''}`}
              style={{ height: `${Math.max(3, (bucket.count / max) * 96)}px` }}
              aria-hidden="true"
            />
            <span className="svk-week-label">{bucket.label}</span>
            <span className="svk-sr">{TINS.weekOf(bucket.fullLabel, bucket.count)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
};
