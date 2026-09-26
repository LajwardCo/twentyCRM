import { type ReactNode } from 'react';

import { navigate } from '../../../lib/router';
import { type StaffDraft } from '../../../lib/forms/collect/staffDraft';
import { TC } from '../../../lib/forms/collectStrings';
import { TSV } from '../../../lib/forms/surveyStrings';
import { IconCheck } from '../../icons';

// Honest storage state: nothing is on the server until the server said so.
export const DraftStatusBadge = ({ draft }: { draft: StaffDraft }) => {
  if (draft.responseId === null) {
    return <span className="sv-device-only">● {TSV.deviceOnly}</span>;
  }

  if (draft.dirty) {
    return (
      <span className="svc-badges">
        <span className="sv-server-saved">✓ {TSV.serverSaved}</span>
        <span className="sv-device-only">● {TC.unsavedEdits}</span>
      </span>
    );
  }

  return <span className="sv-server-saved">✓ {TSV.serverSaved}</span>;
};

type SavedPanelProps = {
  title: string;
  detail?: ReactNode;
  responseId: string | null;
  anotherLabel: string;
  onAnother: () => void;
  children?: ReactNode;
};

// What to do after a save: review the response, turn it into a lead, plan a
// follow-up, or move on to the next one.
export const SavedPanel = ({
  title,
  detail,
  responseId,
  anotherLabel,
  onAnother,
  children,
}: SavedPanelProps) => (
  <section className="card svc-saved" role="status" aria-live="polite">
    <div className="svc-saved-mark" aria-hidden="true">
      <IconCheck size={26} />
    </div>
    <h2>{title}</h2>
    {detail !== undefined && <div className="svc-saved-detail">{detail}</div>}
    {children}
    <div className="svc-next-title">{TC.nextActions}</div>
    <div className="svc-next">
      {responseId !== null && (
        <>
          <button type="button" className="btn line" onClick={() => navigate(`/response/${responseId}`)}>
            {TC.openResponse}
          </button>
          <button type="button" className="btn line" onClick={() => navigate(`/response/${responseId}?crm=1`)}>
            {TC.linkLead}
          </button>
          <button
            type="button"
            className="btn line"
            onClick={() => navigate(`/response/${responseId}?followup=1`)}
          >
            {TC.scheduleFollowUp}
          </button>
        </>
      )}
      <button type="button" className="btn gold" onClick={onAnother}>
        {anotherLabel}
      </button>
    </div>
  </section>
);

export const LoadingCard = () => (
  <div className="svc-loading" aria-busy="true">
    <div className="skeleton" style={{ height: 44 }} />
    <div className="skeleton" style={{ height: 160 }} />
    <div className="skeleton" style={{ height: 120 }} />
  </div>
);

export const ErrorCard = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="card svc-message" role="alert">
    <p>{message}</p>
    {onRetry !== undefined && (
      <button type="button" className="btn line sm" onClick={onRetry}>
        {TC.retry}
      </button>
    )}
  </div>
);
