import { useState } from 'react';

import { T, T6 } from '../lib/strings';
import { ModalSheet } from './ModalSheet';

// Deleting always asks why. The reason is filed on the record before it goes,
// so a lead that disappears from the pipeline can still be accounted for --
// and since every delete here is a soft delete, the record itself is
// recoverable from the CRM's trash view.

const MIN_REASON_LENGTH = 3;

type DeleteWithReasonDialogProps = {
  title: string;
  // What is being deleted, shown so nobody removes the wrong record.
  recordLabel: string;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
};

export const DeleteWithReasonDialog = ({
  title,
  recordLabel,
  onCancel,
  onConfirm,
}: DeleteWithReasonDialogProps) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = reason.trim().length < MIN_REASON_LENGTH;

  const confirm = async () => {
    if (tooShort) {
      setError(T6.deleteReasonRequired);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      // The most likely failure is the Seller role lacking soft-delete on this
      // instance, which reads as a permission error -- surface it rather than
      // leaving the button spinning.
      setError(err instanceof Error ? err.message : T6.deleteFailed);
      setBusy(false);
    }
  };

  return (
    <ModalSheet title={title} onClose={busy ? () => undefined : onCancel}>
      <div className="sub" style={{ marginBottom: 12 }}>
        <b style={{ color: 'var(--ink)' }}>{recordLabel}</b>
        <div style={{ marginTop: 4 }}>{T6.softDeleteExplainer}</div>
      </div>

      <div className="fld">
        <label htmlFor="del-reason">{T6.deleteReasonLbl}</label>
        <textarea
          id="del-reason"
          autoFocus
          placeholder={T6.deleteReasonPlaceholder}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      {error !== null && <div className="error-banner">{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          className="btn line sm"
          style={{ flex: 1, justifyContent: 'center' }}
          disabled={busy}
          onClick={onCancel}
        >
          {T.close}
        </button>
        <button
          className="btn danger block"
          style={{ flex: 2, padding: 12 }}
          disabled={busy || tooShort}
          onClick={confirm}
        >
          {busy ? T6.deleting : T6.confirmDeleteAction}
        </button>
      </div>
    </ModalSheet>
  );
};
