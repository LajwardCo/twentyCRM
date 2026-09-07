// Editing the parts of a lead that were previously fixed at registration: the
// lead's own name, and the identity of the contact person on it.
//
// Source, referrer and marketer stay where they already are -- the click-to-edit
// rows on MetaCard -- because those are one-tap changes and pulling them into a
// dialog would make them slower, not easier.
import { useEffect, useState } from 'react';

import {
  type ContactIdentity,
  fetchContactIdentity,
  saveContactIdentity,
} from '../api/contacts';
import { type LeadSummary, updateLead } from '../api/records';
import { T, T6, T15 } from '../lib/strings';
import { ModalSheet } from './ModalSheet';

type LeadEditModalProps = {
  lead: LeadSummary;
  onClose: () => void;
  onSaved: () => void;
};

const emptyIdentity: ContactIdentity = {
  firstName: '',
  lastName: '',
  email: '',
  jobTitle: '',
};

export const LeadEditModal = ({ lead, onClose, onSaved }: LeadEditModalProps) => {
  const [name, setName] = useState(lead.name);
  const [identity, setIdentity] = useState<ContactIdentity>(emptyIdentity);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contactId = lead.pointOfContact?.id ?? null;

  // Seeded from the lead so the fields are usable immediately, then corrected
  // from the person record -- which carries the job title the lead does not.
  useEffect(() => {
    setIdentity({
      firstName: lead.pointOfContact?.name.firstName ?? '',
      lastName: lead.pointOfContact?.name.lastName ?? '',
      email: lead.pointOfContact?.emails?.primaryEmail ?? '',
      jobTitle: '',
    });

    if (contactId === null) return;
    let active = true;
    void fetchContactIdentity(contactId)
      .then((fresh) => {
        if (active && fresh) setIdentity(fresh);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [contactId, lead.pointOfContact]);

  const change = (patch: Partial<ContactIdentity>) =>
    setIdentity((prev) => ({ ...prev, ...patch }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') return;

    setBusy(true);
    setError(null);
    try {
      if (name.trim() !== lead.name) {
        await updateLead(lead.id, { name: name.trim() });
      }
      if (contactId !== null) {
        await saveContactIdentity(contactId, identity);
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

        {contactId === null ? (
          <div className="sub" style={{ marginBottom: 12 }}>
            {T15.noContactToEdit}
          </div>
        ) : (
          <>
            <div className="sub" style={{ margin: '4px 0 8px' }}>
              {T15.contactSectionHint}
            </div>
            <div className="f2">
              <div className="fld">
                <label htmlFor="le-first">{T.firstName}</label>
                <input
                  id="le-first"
                  value={identity.firstName}
                  onChange={(e) => change({ firstName: e.target.value })}
                />
              </div>
              <div className="fld">
                <label htmlFor="le-last">{T.lastName}</label>
                <input
                  id="le-last"
                  value={identity.lastName}
                  onChange={(e) => change({ lastName: e.target.value })}
                />
              </div>
            </div>
            <div className="f2">
              <div className="fld">
                <label htmlFor="le-email">{T.emailOptional}</label>
                <input
                  id="le-email"
                  type="email"
                  inputMode="email"
                  dir="ltr"
                  value={identity.email}
                  onChange={(e) => change({ email: e.target.value })}
                />
              </div>
              <div className="fld">
                <label htmlFor="le-job">{T15.jobTitleLbl}</label>
                <input
                  id="le-job"
                  value={identity.jobTitle}
                  onChange={(e) => change({ jobTitle: e.target.value })}
                />
              </div>
            </div>
            {/* Phone numbers live on their own screen: a contact can hold
                several lines, which needs more room than this dialog has. */}
            <div className="sub" style={{ marginBottom: 12 }}>
              {T15.phonesEditedElsewhere}
            </div>
          </>
        )}

        {error !== null && <div className="error-banner">{error}</div>}

        <button className="btn gold block" type="submit" disabled={busy}>
          {busy ? T6.saving : T6.saveChanges}
        </button>
      </form>
    </ModalSheet>
  );
};
