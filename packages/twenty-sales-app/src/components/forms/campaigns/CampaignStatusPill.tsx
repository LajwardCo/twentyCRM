import { type CampaignStatus } from '../../../api/surveys';
import { formatPercent, targetProgress } from '../../../lib/forms/insights';
import { TINS } from '../../../lib/forms/insightStrings';
import { CAMPAIGN_STATUS_LABELS } from '../../../lib/forms/surveyStrings';
import { formatJalaliDate } from '../../../lib/jalali';
import { TargetBar } from '../insights/InsightBars';

const TONE: Record<CampaignStatus, string> = {
  PLANNED: 'stage',
  ACTIVE: 'ok',
  COMPLETED: 'svk-pill-muted',
  CANCELLED: 'hot',
};

export const CampaignStatusPill = ({ status }: { status: CampaignStatus }) => (
  <span className={`pill ${TONE[status]}`}>{CAMPAIGN_STATUS_LABELS[status]}</span>
);

export const campaignDates = (startsAt: string | null, endsAt: string | null): string =>
  startsAt === null && endsAt === null
    ? '—'
    : `${formatJalaliDate(startsAt)} ← ${formatJalaliDate(endsAt)}`;

// "12 of 40" with a bar, or just the count when no target is set.
export const CampaignTarget = ({
  completed,
  target,
}: {
  completed: number;
  target: number | null;
}) => {
  const progress = targetProgress(completed, target);

  if (progress.target === null) {
    return <span className="svk-target-text num">{TINS.noTarget(completed)}</span>;
  }

  const label = `${TINS.targetOf(completed, progress.target)} (${formatPercent(progress.percent)})`;

  return (
    <div className="svk-target-cell">
      <span className="svk-target-text num">{label}</span>
      <TargetBar ratio={progress.barRatio} label={label} />
    </div>
  );
};
