import { useRef, useState } from 'react';

import { runAutomationsWithSession } from '../../../../api/surveyResponseExtras';
import { type SurveyResponse } from '../../../../api/surveys';
import { formatJalaliDateTime } from '../../../../lib/jalali';
import { TSR } from '../../../../lib/forms/responseStrings';
import { automationActions } from '../../../../lib/forms/responses/crmActionLog';

type ResponseAutomationsProps = {
  response: SurveyResponse;
  canEdit: boolean;
  onChanged: () => Promise<void> | void;
};

const recordRoute = (target: string | undefined, type: string): string | null => {
  if (type === 'CREATE_LEAD' || target === 'opportunity') return 'lead';
  if (type === 'CREATE_TASK') return 'task';
  if (target === 'company') return 'company';
  if (target === 'person') return 'person';

  return null;
};

// The CRM action log: automations the form ran (DONE/FAILED) and what staff
// did from the CRM panel. Retry re-runs only what has not succeeded — the
// server skips every DONE key, so a double click never creates twice.
export const ResponseAutomations = ({ response, canEdit, onChanged }: ResponseAutomationsProps) => {
  const actions = automationActions(response.crmActions);
  const inFlight = useRef(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const retry = async () => {
    if (inFlight.current) return;

    inFlight.current = true;
    setRunning(true);
    setMessage(null);

    try {
      await runAutomationsWithSession(response.id);
      setMessage(TSR.retryDone);
      await onChanged();
    } catch (failure) {
      setMessage(`${TSR.retryFailed}: ${failure instanceof Error ? failure.message : ''}`);
    } finally {
      inFlight.current = false;
      setRunning(false);
    }
  };

  return (
    <section className="card svr-section" aria-labelledby="svr-automations-title">
      <div className="svr-section-head">
        <h3 id="svr-automations-title">{TSR.automations}</h3>
        {canEdit && (
          <button type="button" className="btn line sm" disabled={running} onClick={() => void retry()}>
            {running ? TSR.retrying : TSR.retry}
          </button>
        )}
      </div>
      {actions.length === 0 && <p className="svr-muted">{TSR.noAutomations}</p>}
      <ul className="svr-actions-log">
        {actions.map((action, index) => {
          const route = recordRoute(action.target, action.type);

          return (
            <li key={`${action.key}-${index}`} className={`svr-log-${action.status.toLowerCase()}`}>
              <span className={`svr-pill svr-action-${action.status.toLowerCase()}`}>{TSR.actionStatus[action.status] ?? action.status}</span>
              <span>{TSR.actionTypes[action.type] ?? action.type}</span>
              {action.recordId && route !== null && (
                <a href={`#/${route}/${action.recordId}`} className="svr-muted">
                  {TSR.open}
                </a>
              )}
              <span className="svr-muted">{formatJalaliDateTime(action.at)}</span>
              {action.error && <span className="svr-log-error" dir="auto">{action.error}</span>}
            </li>
          );
        })}
      </ul>
      {message !== null && <p className="svr-action-message" role="status">{message}</p>}
    </section>
  );
};
