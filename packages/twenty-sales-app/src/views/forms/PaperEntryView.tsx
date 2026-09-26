import { useEffect, useState } from 'react';

import { type CurrentUser } from '../../api/auth';
import { fetchForm, fetchVersion } from '../../api/surveys';
import { LoadingCard, SavedPanel } from '../../components/forms/collect/CollectChrome';
import { PaperEntryForm } from '../../components/forms/collect/PaperEntryForm';
import { PaperScans } from '../../components/forms/collect/PaperScans';
import { type PickedVersion, PaperVersionPicker } from '../../components/forms/collect/PaperVersionPicker';
import { TC } from '../../lib/forms/collectStrings';

// Transcribing paper sheets. Starts from the printed version code (or a form +
// version), then the sheet's details and answers; scans are attached once the
// response exists.
export const PaperEntryView = ({
  formId,
  query,
  user,
}: {
  formId: string | null;
  query: string;
  user: CurrentUser;
}) => {
  const [picked, setPicked] = useState<PickedVersion | null>(null);
  const [resolving, setResolving] = useState(formId !== null);
  const [completed, setCompleted] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  // Opened from a form (#/form/:id/paper): default to its published version;
  // ?version=<id> picks another one.
  useEffect(() => {
    if (formId === null) return;

    const versionParam = new URLSearchParams(query).get('version');

    setResolving(true);
    void (async () => {
      try {
        const form = await fetchForm(formId);
        const versionId = versionParam ?? form.publishedVersion?.id ?? null;
        const version = versionId === null ? null : await fetchVersion(versionId);

        if (version !== null && version.formId === formId) {
          setPicked({ formId, formName: form.name, version });
        }
      } catch {
        // fall back to picking by code
      } finally {
        setResolving(false);
      }
    })();
  }, [formId, query]);

  const enteredByName = `${user.firstName} ${user.lastName}`.trim() || user.userEmail;

  return (
    <main className="page svc-page">
      <div className="page-head">
        <div>
          <h1>{TC.paperTitle}</h1>
          <div className="sub">
            {picked === null ? TC.paperSub : <span dir="auto">{picked.formName}</span>}
          </div>
        </div>
        {picked !== null && completed === null && (
          <button type="button" className="btn line sm" onClick={() => setPicked(null)}>
            {TC.changeVersion}
          </button>
        )}
      </div>

      {completed !== null ? (
        <SavedPanel
          title={TC.savedComplete}
          detail={TC.paperSavedHint}
          responseId={completed}
          anotherLabel={TC.enterAnother}
          onAnother={() => {
            setCompleted(null);
            setRound((value) => value + 1);
          }}
        >
          <PaperScans responseId={completed} />
        </SavedPanel>
      ) : resolving ? (
        <LoadingCard />
      ) : picked === null ? (
        <PaperVersionPicker
          initialFormId={formId}
          onPick={(next) => {
            setPicked(next);

            // Picked by code before the forms list arrived: fetch the name.
            if (next.formName === '') {
              fetchForm(next.formId)
                .then((form) => setPicked((current) => (current === null ? current : { ...current, formName: form.name })))
                .catch(() => undefined);
            }
          }}
        />
      ) : (
        <PaperEntryForm
          key={`${picked.version.id}:${round}`}
          formId={picked.formId}
          formName={picked.formName}
          version={picked.version}
          enteredByName={enteredByName}
          onCompleted={setCompleted}
        />
      )}
    </main>
  );
};
