// Editing the lead's own name.
//
// The contact person used to be edited here too, in a half-form that could not
// touch phone numbers. That now lives behind the edit button on the contact
// card (ContactEditModal), which manages the person end to end -- keeping it in
// two places meant two dialogs writing the same record with different fields.
//
// Source, referrer and marketer stay where they already are -- the click-to-edit
// rows on MetaCard -- because those are one-tap changes and pulling them into a
// dialog would make them slower, not easier.
import { useState } from 'react';

import { type LeadSummary, updateLead } from '../api/records';
import { T, T6, T15, T16 } from '../lib/strings';
import { ModalSheet } from './ModalSheet';

type LeadEditModalProps = {
  lead: LeadSummary;
  onClose: () => void;
  onSaved: () => void;
};

export const LeadEditModal = ({ lead, onClose, onSaved }: LeadEditModalProps) => {
  const [name, setName] = useState(lead.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') return;

    setBusy(true);
    setError(null);
    try {
      if (name.trim() !== lead.name) {
        await updateLead(lead.id, { name: name.trim() });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : T.loadFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalSheet title={T15.editLeadTitle} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="fld">
          <label htmlFor="le-name">{T15.leadNameLbl} *</label>
          <input
            id="le-name"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="sub" style={{ marginBottom: 12 }}>
          {T16.contactEditedFromCard}
        </div>

        {error !== null && <div className="error-banner">{error}</div>}

        <button className="btn gold block" type="submit" disabled={busy}>
          {busy ? T6.saving : T6.saveChanges}
        </button>
      </form>
    </ModalSheet>
  );
};
