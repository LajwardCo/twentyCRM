import { useEffect, useState } from 'react';

import { fetchPersonPhones, savePersonPhones } from '../api/contacts';
import { type PhoneEntry, phoneEntries } from '../lib/phones';
import { T13 } from '../lib/strings';
import { ModalSheet } from './ModalSheet';
import { PhoneLinesEditor } from './PhoneLinesEditor';

type ContactPhonesModalProps = {
  personId: string;
  personName: string;
  onClose: () => void;
  onSaved: (message: string) => void;
};

// Managing every number a contact answers on, and which messaging app reaches
// them on each. Sellers deal with people who carry two or three SIMs and are
// only on WhatsApp on one of them; before this, a second number meant either a
// duplicate contact or a note nobody reads.
//
// This is the numbers-only entry point (the person page, the company contact
// list). Editing a contact's identity at the same time is ContactEditModal.
export const ContactPhonesModal = ({
  personId,
  personName,
  onClose,
  onSaved,
}: ContactPhonesModalProps) => {
  const [entries, setEntries] = useState<PhoneEntry[] | null>(null);
  const [appsSupported, setAppsSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchPersonPhones(personId)
      .then((result) => {
        if (!active) return;
        setEntries(phoneEntries(result.phones, result.phoneApps));
        setAppsSupported(result.appsSupported);
      })
      .catch(() => {
        if (active) setError(T13.phonesSaveFailed);
      });
    return () => {
      active = false;
    };
  }, [personId]);

  const save = async () => {
    if (entries === null) return;
    setBusy(true);
    setError(null);
    try {
      const { appsSaved } = await savePersonPhones(personId, entries);
      onSaved(appsSaved ? T13.phonesSaved : T13.phoneAppsUnsupported);
    } catch (err) {
      setError(err instanceof Error ? err.message : T13.phonesSaveFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalSheet title={`${T13.phonesSection} — ${personName}`} onClose={onClose}>
      <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '0 0 12px' }}>
        {T13.phonesHint}
      </p>

      <PhoneLinesEditor
        entries={entries}
        appsSupported={appsSupported}
        onChange={setEntries}
        onError={setError}
      />

      {error !== null && <div className="error-banner">{error}</div>}

      <button
        className="btn gold block"
        style={{ padding: 12, marginTop: 12 }}
        disabled={busy || entries === null}
        onClick={() => void save()}
      >
        {busy ? T13.savingLbl : T13.save}
      </button>
    </ModalSheet>
  );
};
