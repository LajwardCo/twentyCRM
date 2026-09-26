import { type ResponseFilter, listResponses } from '../../api/surveys';
import { useCached } from '../../lib/cache';
import { formatJalaliDate, toPersianDigits } from '../../lib/jalali';
import { TSR } from '../../lib/forms/responseStrings';
import { useSurveyCapabilities } from '../../lib/forms/useSurveyCapabilities';
import { CompletionBadge, ReviewBadge, SourceLabel } from './responses/ResponseBadges';

type SurveyResponsesCardProps = {
  companyId?: string;
  personId?: string;
  opportunityId?: string;
};

// Survey responses linked to a company, contact or lead, on that record's
// page. Renders nothing where surveys are not provisioned or cannot be read,
// so a CRM page never breaks because of this card.
export const SurveyResponsesCard = ({ companyId, personId, opportunityId }: SurveyResponsesCardProps) => {
  const { capabilities, loading } = useSurveyCapabilities();
  const filter: ResponseFilter =
    opportunityId !== undefined ? { opportunityId } : personId !== undefined ? { personId } : companyId !== undefined ? { companyId } : {};
  const scoped = Object.keys(filter).length > 0;
  const enabled = scoped && !loading && capabilities.supported;
  const { data, error } = useCached(`svr:card:${JSON.stringify(filter)}:${enabled}`, () =>
    enabled ? listResponses(filter, { first: 20 }) : Promise.resolve(null),
  );

  if (!enabled || error !== null || data === null) return null;

  return (
    <div className="card anim d2 svr-crm-card">
      <div className="card-pad" style={{ paddingBottom: 8 }}>
        <h3>
          {TSR.cardTitle}{' '}
          <span className="num" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>
            ({toPersianDigits(data.totalCount)})
          </span>
        </h3>
      </div>
      {data.responses.length === 0 && <div className="empty-state">{TSR.cardEmpty}</div>}
      {data.responses.map((response) => (
        <a key={response.id} className="svr-crm-card-row" href={`#/response/${response.id}`}>
          <span className="svr-crm-card-main">
            <span className="svr-crm-card-title" dir="auto">{response.form?.name ?? '—'}</span>
            <span className="svr-sub">
              {formatJalaliDate(response.collectedAt ?? response.createdAt)} · <SourceLabel source={response.source} />
            </span>
          </span>
          <span className="svr-crm-card-badges">
            <CompletionBadge status={response.completionStatus} />
            <ReviewBadge status={response.reviewStatus} />
          </span>
        </a>
      ))}
    </div>
  );
};
