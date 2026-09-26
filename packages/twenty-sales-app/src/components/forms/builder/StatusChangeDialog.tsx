import { useState } from 'react';

import { changeFormStatus } from '../../../api/surveys';
import { TB } from '../../../lib/forms/builderStrings';
import { type StatusAction } from '../../../lib/forms/builder/formsList';
import { ConfirmDialog } from './BuilderDialog';

type StatusChangeDialogProps = {
  formId: string;
  formName: string;
  action: StatusAction;
  onDone: () => void;
  onCancel: () => void;
};

// Every status change goes through the server's status endpoint; the record
// API refuses direct writes to formStatus.
export const StatusChangeDialog = ({ formId, formName, action, onDone, onCancel }: StatusChangeDialogProps) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <ConfirmDialog
      title={`${TB.statusAction[action.kind]} — ${formName}`}
      confirmLabel={TB.statusAction[action.kind]}
      danger={action.kind === 'archive' || action.kind === 'close'}
      busy={busy}
      onCancel={onCancel}
      onConfirm={() => {
        setBusy(true);
        setError(null);
        changeFormStatus(formId, action.to)
          .then(onDone)
          .catch((failure: unknown) => {
            setError(failure instanceof Error ? failure.message : TB.actionFailed);
            setBusy(false);
          });
      }}
      body={
        <>
          <p>{TB.statusConfirm[action.kind]}</p>
          {action.kind === 'archive' && <p className="svb-hint">{TB.archiveInsteadOfDelete}</p>}
          {error !== null && (
            <p className="error-banner" role="alert">
              {TB.actionFailed}: {error}
            </p>
          )}
        </>
      }
    />
  );
};
