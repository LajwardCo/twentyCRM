import { useCallback, useEffect, useMemo, useState } from 'react';

import { type CurrentUser } from '../../api/auth';
import { fetchLinkLabels } from '../../api/surveyCollect';
import { type SurveyFormVersion, fetchForm, fetchVersion } from '../../api/surveys';
import { ErrorCard, LoadingCard, SavedPanel } from '../../components/forms/collect/CollectChrome';
import { StaffCollectForm } from '../../components/forms/collect/StaffCollectForm';
import { type LinkLabels, parseCollectLinks } from '../../lib/forms/collect/prefill';
import { TC } from '../../lib/forms/collectStrings';
import { useSurveyCapabilities } from '../../lib/forms/useSurveyCapabilities';
import { navigate } from '../../lib/router';

type Loaded =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'unpublished'; formName: string }
  | { status: 'ready'; formName: string; version: SurveyFormVersion; labels: LinkLabels };

// Staff fill in the form's published version on a phone or at a desk. The
// query may carry the records it is about (companyId, personId,
// opportunityId, campaignId, visitId) — they prefill the CRM questions and
// link the saved response.
export const StaffCollectView = ({ formId, query }: { formId: string; query: string; user: CurrentUser }) => {
  const links = useMemo(() => parseCollectLinks(query), [query]);
  const { capabilities, loading: capabilitiesLoading } = useSurveyCapabilities();
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [saved, setSaved] = useState<{ responseId: string } | null>(null);
  const [round, setRound] = useState(0);

  const load = useCallback(async () => {
    setLoaded({ status: 'loading' });

    try {
      const [form, labels] = await Promise.all([fetchForm(formId), fetchLinkLabels(links)]);

      if (form.publishedVersion === null) {
        setLoaded({ status: 'unpublished', formName: form.name });

        return;
      }

      const version = await fetchVersion(form.publishedVersion.id);

      setLoaded(
        version === null
          ? { status: 'unpublished', formName: form.name }
          : { status: 'ready', formName: form.name, version, labels },
      );
    } catch {
      setLoaded({ status: 'error' });
    }
  }, [formId, links]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = loaded.status === 'ready' || loaded.status === 'unpublished' ? loaded.formName : '';

  return (
    <main className="page svc-page">
      <div className="page-head">
        <div>
          <h1 dir="auto">{title || '…'}</h1>
          <div className="sub">{TC.staffCollectSub}</div>
        </div>
      </div>

      {!capabilitiesLoading && capabilities.supported && !capabilities.canCollect ? (
        <ErrorCard message={TC.noCollectPermission} />
      ) : loaded.status === 'loading' ? (
        <LoadingCard />
      ) : loaded.status === 'error' ? (
        <ErrorCard message={TC.loadFailed} onRetry={() => void load()} />
      ) : loaded.status === 'unpublished' ? (
        <div className="card svc-message">
          <p>{TC.notPublished}</p>
          <button type="button" className="btn line sm" onClick={() => navigate(`/form/${formId}/builder`)}>
            {TC.openBuilder}
          </button>
        </div>
      ) : saved !== null ? (
        <SavedPanel
          title={TC.savedComplete}
          responseId={saved.responseId}
          anotherLabel={TC.collectAnother}
          onAnother={() => {
            setSaved(null);
            setRound((value) => value + 1);
          }}
        />
      ) : (
        <StaffCollectForm
          key={round}
          version={loaded.version}
          formName={loaded.formName}
          draftScope={`collect:${formId}:${links.companyId ?? links.opportunityId ?? '-'}`}
          links={links}
          linkLabels={loaded.labels}
          onSaved={({ responseId }) => setSaved({ responseId })}
        />
      )}
    </main>
  );
};
