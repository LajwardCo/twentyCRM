import { type ReactNode, useState } from 'react';

import {
  type CompletionStatus,
  type ReviewStatus,
  type SurveyFormVersion,
  type SurveyResponse,
  invalidAnswersFrom,
  updateResponse,
} from '../../../../api/surveys';
import { formatJalaliDateTime, toPersianDigits } from '../../../../lib/jalali';
import { TSR } from '../../../../lib/forms/responseStrings';
import {
  COMPLETION_LABELS,
  INTEREST_LABELS,
  LANGUAGE_LABELS,
  REVIEW_LABELS,
  VISIT_OUTCOME_LABELS,
} from '../../../../lib/forms/surveyStrings';
import { CompletionBadge, ReviewBadge, SourceLabel } from '../ResponseBadges';
import { memberLabel } from '../useResponseLookups';

type ResponseHeaderCardProps = {
  response: SurveyResponse;
  // Used when the response has no name of its own (staff and paper entries).
  fallbackName: string;
  version: SurveyFormVersion | null;
  canEdit: boolean;
  onChanged: () => Promise<void> | void;
};

const Meta = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="svr-meta">
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
);

const mapUrl = (lat: number, lng: number) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;

export const ResponseHeaderCard = ({ response, fallbackName, version, canEdit, onChanged }: ResponseHeaderCardProps) => {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const location = response.location;
  const hasCoordinates = typeof location?.lat === 'number' && typeof location.lng === 'number';

  const save = async (patch: { reviewStatus?: ReviewStatus; completionStatus?: CompletionStatus }) => {
    setSaving(true);
    setMessage(null);

    try {
      await updateResponse(response.id, patch);
      setMessage(TSR.statusSaved);
      await onChanged();
    } catch (error) {
      const invalid = invalidAnswersFrom(error);

      // Marking complete re-validates every answer; say how many block it.
      setMessage(
        invalid.length > 0
          ? `${TSR.statusFailed}: ${TSR.correctionInvalid} (${toPersianDigits(invalid.length)})`
          : `${TSR.statusFailed}: ${error instanceof Error ? error.message : ''}`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card svr-section svr-header">
      <div className="svr-header-top">
        <div>
          <h1 dir="auto">{response.name.trim() || response.company?.name || fallbackName || TSR.noName}</h1>
          <div className="svr-sub">
            <a href={`#/form/${response.formId}/responses`} dir="auto">{response.form?.name ?? TSR.form}</a>
            {' · '}
            {TSR.version} {toPersianDigits(response.versionNumber)}
            {version?.printCode ? <span dir="ltr"> · {version.printCode}</span> : null}
            {' · '}
            <SourceLabel source={response.source} />
          </div>
        </div>
        <div className="svr-status-controls">
          <div className="svr-status">
            <span className="svr-status-label">{TSR.completion}</span>
            {canEdit ? (
              <select
                aria-label={TSR.completion}
                value={response.completionStatus}
                disabled={saving}
                onChange={(event) => void save({ completionStatus: event.target.value as CompletionStatus })}
              >
                {(Object.keys(COMPLETION_LABELS) as CompletionStatus[]).map((status) => (
                  <option key={status} value={status}>{COMPLETION_LABELS[status]}</option>
                ))}
              </select>
            ) : (
              <CompletionBadge status={response.completionStatus} />
            )}
          </div>
          <div className="svr-status">
            <span className="svr-status-label">{TSR.review}</span>
            {canEdit ? (
              <select
                aria-label={TSR.review}
                className={`svr-review-select svr-review-${response.reviewStatus.toLowerCase()}`}
                value={response.reviewStatus}
                disabled={saving}
                onChange={(event) => void save({ reviewStatus: event.target.value as ReviewStatus })}
              >
                {(Object.keys(REVIEW_LABELS) as ReviewStatus[]).map((status) => (
                  <option key={status} value={status}>{REVIEW_LABELS[status]}</option>
                ))}
              </select>
            ) : (
              <ReviewBadge status={response.reviewStatus} />
            )}
          </div>
        </div>
      </div>
      {message !== null && <p className="svr-action-message" role="status">{message}</p>}

      <dl className="svr-meta-grid">
        <Meta label={TSR.collectedAt}>{formatJalaliDateTime(response.collectedAt) || '—'}</Meta>
        <Meta label={TSR.submittedAt}>{formatJalaliDateTime(response.submittedAt) || '—'}</Meta>
        {response.enteredAt !== null && <Meta label={TSR.enteredAt}>{formatJalaliDateTime(response.enteredAt)}</Meta>}
        <Meta label={TSR.collector}>{memberLabel(response.collector) || '—'}</Meta>
        {response.enteredBy !== null && <Meta label={TSR.enteredBy}>{memberLabel(response.enteredBy)}</Meta>}
        {response.paperReference !== '' && <Meta label={TSR.paperRef}><span dir="auto">{response.paperReference}</span></Meta>}
        {(response.city !== '' || response.area !== '') && (
          <Meta label={`${TSR.city} / ${TSR.area}`}><span dir="auto">{[response.city, response.area].filter(Boolean).join(' · ')}</span></Meta>
        )}
        {location !== null && (
          <Meta label={TSR.location}>
            {hasCoordinates && (
              <a href={mapUrl(location.lat as number, location.lng as number)} target="_blank" rel="noopener noreferrer" dir="ltr">
                {`${(location.lat as number).toFixed(5)}, ${(location.lng as number).toFixed(5)}`} — {TSR.openMap}
              </a>
            )}
            {location.description && <span dir="auto"> {location.description}</span>}
          </Meta>
        )}
        {response.buyingInterest !== null && <Meta label={TSR.buyingInterest}>{INTEREST_LABELS[response.buyingInterest]}</Meta>}
        {response.visit !== null && (
          <Meta label={TSR.visit}>
            <a href={`#/task/${response.visit.id}`} dir="auto">{response.visit.title}</a>
            {response.visit.visitOutcome !== null && ` · ${VISIT_OUTCOME_LABELS[response.visit.visitOutcome]}`}
          </Meta>
        )}
        {response.campaign !== null && (
          <Meta label={TSR.campaign}><a href={`#/campaign/${response.campaign.id}`} dir="auto">{response.campaign.name}</a></Meta>
        )}
        <Meta label={TSR.language}>{LANGUAGE_LABELS[response.language as keyof typeof LANGUAGE_LABELS] ?? (response.language || '—')}</Meta>
      </dl>

      {response.paperReviewNotes !== '' && (
        <div className="svr-transcription">
          <strong>{TSR.transcriptionNotes}</strong>
          <p dir="auto">{response.paperReviewNotes}</p>
        </div>
      )}
    </section>
  );
};
