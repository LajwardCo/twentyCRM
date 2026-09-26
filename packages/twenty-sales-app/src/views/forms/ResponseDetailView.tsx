import { useCallback, useEffect, useRef, useState } from 'react';

import { type CurrentUser } from '../../api/auth';
import {
  type SurveyFormVersion,
  type SurveyResponse,
  fetchResponse,
  fetchVersion,
} from '../../api/surveys';
import { ResponseAnswers } from '../../components/forms/responses/detail/ResponseAnswers';
import { ResponseAttachments } from '../../components/forms/responses/detail/ResponseAttachments';
import { ResponseAutomations } from '../../components/forms/responses/detail/ResponseAutomations';
import { ResponseCorrection } from '../../components/forms/responses/detail/ResponseCorrection';
import { ResponseCrmPanel } from '../../components/forms/responses/detail/ResponseCrmPanel';
import { ResponseFollowUp } from '../../components/forms/responses/detail/ResponseFollowUp';
import { ResponseHeaderCard } from '../../components/forms/responses/detail/ResponseHeaderCard';
import { ResponseHistory } from '../../components/forms/responses/detail/ResponseHistory';
import { ResponseNotes } from '../../components/forms/responses/detail/ResponseNotes';
import { IconBack, IconEdit } from '../../components/icons';
import { TSR } from '../../lib/forms/responseStrings';
import { useSurveyCapabilities } from '../../lib/forms/useSurveyCapabilities';
import { goBackOr, useRoute } from '../../lib/router';

type Loaded = { response: SurveyResponse; version: SurveyFormVersion | null };

export const ResponseDetailView = ({ responseId, user }: { responseId: string; user: CurrentUser }) => {
  const route = useRoute();
  const params = new URLSearchParams(route.query);
  const { capabilities } = useSurveyCapabilities();
  const canEdit = capabilities.canEditResponses;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  // The version is immutable, so it is fetched once; the response itself is
  // re-read after every change.
  const versionRef = useRef<SurveyFormVersion | null>(null);
  const reload = useCallback(async () => {
    try {
      const response = await fetchResponse(responseId);

      if (response === null) {
        setError(TSR.notFound);

        return;
      }

      if (versionRef.current?.id !== response.formVersionId) {
        versionRef.current = await fetchVersion(response.formVersionId).catch(() => null);
      }

      setLoaded({ response, version: versionRef.current });
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }, [responseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loaded === null) {
    return (
      <main className="page svr-page">
        {error !== null ? (
          <div className="error-banner" role="alert">{error}</div>
        ) : (
          <div className="svr-skeletons" aria-busy="true">
            <div className="skeleton" style={{ height: 120 }} />
            <div className="skeleton" style={{ height: 320 }} />
          </div>
        )}
      </main>
    );
  }

  const { response, version } = loaded;
  const definition = version?.definition ?? null;
  const nameRule = definition?.crmMapping.find((rule) => rule.field === 'company.name');
  const mappedName = nameRule === undefined ? undefined : response.answers[nameRule.questionId];

  return (
    <main className="page svr-page svr-detail">
      <div className="svr-detail-bar">
        <button type="button" className="btn line sm" onClick={() => goBackOr('/responses')}>
          <IconBack size={14} />
          {TSR.back}
        </button>
        <div className="svr-toolbar-spacer" />
        <a className="btn line sm" href={`#/response/${response.id}/print`}>
          {TSR.print}
        </a>
      </div>
      {error !== null && <div className="error-banner" role="alert">{error}</div>}

      <div className="svr-detail-grid">
        <div className="svr-detail-main">
          <ResponseHeaderCard
            response={response}
            fallbackName={typeof mappedName === 'string' ? mappedName : ''}
            version={version} canEdit={canEdit} onChanged={reload} />
          <ResponseAnswers
            response={response}
            definition={definition}
            actions={
              canEdit && definition !== null ? (
                <button type="button" className="btn line sm" onClick={() => setEditing(true)}>
                  <IconEdit size={14} />
                  {TSR.editAnswers}
                </button>
              ) : undefined
            }
          />
          <ResponseHistory responseId={response.id} version={response.updatedAt} />
        </div>
        <div className="svr-detail-side">
          <ResponseCrmPanel
            response={response}
            definition={definition}
            user={user}
            canEdit={canEdit}
            initiallyOpen={params.get('crm') === '1'}
            onChanged={reload}
          />
          <ResponseFollowUp response={response} user={user} canEdit={canEdit} initiallyOpen={params.get('followup') === '1'} />
          <ResponseAutomations response={response} canEdit={canEdit} onChanged={reload} />
          <ResponseNotes responseId={response.id} opportunityId={response.opportunity?.id ?? null} canEdit={canEdit} />
          <ResponseAttachments responseId={response.id} canEdit={canEdit} />
        </div>
      </div>

      {editing && definition !== null && (
        <ResponseCorrection response={response} definition={definition} onClose={() => setEditing(false)} onSaved={reload} />
      )}
    </main>
  );
};
