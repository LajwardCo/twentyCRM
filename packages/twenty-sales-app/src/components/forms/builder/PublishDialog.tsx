import { type FormDefinition, type PublishIssue, type PublishValidation, validateForPublish } from '@shared/surveys';
import { useId, useMemo, useState } from 'react';

import {
  DraftConflictError,
  type PublishResult,
  PublishInvalidError,
  type SurveyForm,
  publishForm,
} from '../../../api/surveys';
import { TB } from '../../../lib/forms/builderStrings';
import { TSV } from '../../../lib/forms/surveyStrings';
import { BuilderDialog } from './BuilderDialog';
import { IssueList } from './IssueList';

type PublishDialogProps = {
  form: SurveyForm;
  definition: FormDefinition;
  // Resolves true once every pending edit is on the server.
  flush: () => Promise<boolean>;
  // Latest revision the server confirmed; publishing names it explicitly so
  // the server refuses if anything changed since.
  getRevision: () => number;
  onClose: () => void;
  onPublished: (result: PublishResult) => void;
  onConflict: () => void;
  onIssue: (issue: PublishIssue) => void;
  onGoShare: () => void;
};

export const PublishDialog = ({
  form,
  definition,
  flush,
  getRevision,
  onClose,
  onPublished,
  onConflict,
  onIssue,
  onGoShare,
}: PublishDialogProps) => {
  const id = useId();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverIssues, setServerIssues] = useState<PublishValidation | null>(null);
  const [published, setPublished] = useState<PublishResult | null>(null);
  const validation = useMemo(
    () => validateForPublish(definition, { publicEnabled: form.publicEnabled }),
    [definition, form.publicEnabled],
  );
  const blocked = validation.errors.length > 0;
  const nextVersion = form.currentVersionNumber + 1;

  const publish = async () => {
    setBusy(true);
    setError(null);
    setServerIssues(null);

    try {
      if (!(await flush())) {
        setError(TB.publishNeedsSave);

        return;
      }

      const result = await publishForm(form.id, getRevision(), note.trim());

      setPublished(result);
      onPublished(result);
    } catch (failure) {
      if (failure instanceof PublishInvalidError) {
        setServerIssues(failure.issues);
      } else if (failure instanceof DraftConflictError) {
        onConflict();
        onClose();
      } else {
        setError(failure instanceof Error ? failure.message : TB.publishFailed);
      }
    } finally {
      setBusy(false);
    }
  };

  if (published !== null) {
    return (
      <BuilderDialog
        title={TB.publishTitle}
        onClose={onClose}
        footer={
          <>
            <button type="button" className="btn line" onClick={onClose}>
              {TSV.close}
            </button>
            <button type="button" className="btn gold" onClick={onGoShare}>
              {TB.goShare}
            </button>
          </>
        }
      >
        <p className="svb-note ok" role="status">
          {TB.published(published.versionNumber)} <code dir="ltr">{published.printCode}</code>
        </p>
      </BuilderDialog>
    );
  }

  return (
    <BuilderDialog
      title={TB.publishTitle}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn line" onClick={onClose}>
            {TSV.cancel}
          </button>
          <button type="button" className="btn gold" disabled={blocked || busy} onClick={() => void publish()}>
            {busy ? TB.publishing : TB.publishAsVersion(nextVersion)}
          </button>
        </>
      }
    >
      {blocked ? (
        <p className="svb-note warn">{TB.publishErrors}</p>
      ) : (
        <p className="svb-note ok">{TB.publishReady}</p>
      )}
      {(blocked || validation.warnings.length > 0) && (
        <IssueList
          validation={validation}
          compact
          onSelect={(issue) => {
            onIssue(issue);
            onClose();
          }}
        />
      )}
      {serverIssues !== null && (
        <>
          <p className="svb-note warn">{TB.serverIssues}</p>
          <IssueList validation={serverIssues} compact />
        </>
      )}
      <div className="fld svb-fld">
        <label htmlFor={`${id}-note`}>{TB.changeNote}</label>
        <textarea
          id={`${id}-note`}
          rows={2}
          dir="auto"
          value={note}
          placeholder={TB.changeNotePlaceholder}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <details className="svb-republish" open={form.currentVersionNumber > 0}>
        <summary>{TB.republishTitle}</summary>
        <ul>
          {TB.republishRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </details>
      {error !== null && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
    </BuilderDialog>
  );
};
