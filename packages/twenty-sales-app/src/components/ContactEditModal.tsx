import { useEffect, useState } from 'react';

import {
  type ContactIdentity,
  fetchContactIdentity,
  fetchPersonPhones,
  saveContactIdentity,
  savePersonPhones,
} from '../api/contacts';
import { invalidateCache } from '../lib/cache';
import { type PhoneEntry, phoneEntries } from '../lib/phones';
import { T, T6, T8, T9, T13, T15, T16 } from '../lib/strings';
import { ModalSheet } from './ModalSheet';
import { PhoneLinesEditor } from './PhoneLinesEditor';

type ContactEditModalProps = {
  personId: string;
  personName: string;
  // The company the contact hangs off, so its cached card is refetched after a
  // rename. Omitted where the caller has no company in hand.
  companyId?: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
};

const emptyIdentity: ContactIdentity = {
  firstName: '',
  lastName: '',
  email: '',
  jobTitle: '',
  city: '',
};

// Everything about one contact in a single sheet: who they are, and every
// number they answer on. The lead header used to split this in two -- the name
// and email behind "edit lead", the numbers behind a separate phone icon --
// which meant fixing a misspelled name and adding their second SIM were two
// different dialogs in two different places.
export const ContactEditModal = ({
  personId,
  personName,
  companyId,
  onClose,
  onSaved,
}: ContactEditModalProps) => {
  const [identity, setIdentity] = useState<ContactIdentity | null>(null);
  const [entries, setEntries] = useState<PhoneEntry[] | null>(null);
  const [appsSupported, setAppsSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetchContactIdentity(personId),
      fetchPersonPhones(personId),
    ])
      .then(([fresh, phones]) => {
        if (!active) return;
        setIdentity(fresh ?? emptyIdentity);
        setEntries(phoneEntries(phones.phones, phones.phoneApps));
        setAppsSupported(phones.appsSupported);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : T.loadFailed);
      });
    return () => {
      active = false;
    };
  }, [personId]);

  const change = (patch: Partial<ContactIdentity>) =>
    setIdentity((prev) => ({ ...(prev ?? emptyIdentity), ...patch }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (identity === null || entries === null) return;
    if (identity.firstName.trim() === '') {
      setError(T8.contactFirstNameRequired);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Identity first: if the numbers fail (an instance without `phoneApps`
      // still writes them, so this is a real failure) the name change is
      // already safe, and the seller retries only the half that did not land.
      await saveContactIdentity(personId, identity);
      const { appsSaved } = await savePersonPhones(personId, entries);
      if (companyId) invalidateCache(`company:${companyId}`);
      onSaved(appsSaved ? T16.contactSaved : T13.phoneAppsUnsupported);
    } catch (err) {
      setError(err instanceof Error ? err.message : T16.contactSaveFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalSheet title={`${T16.editContactTitle} — ${personName}`} onClose={onClose}>
      {identity === null ? (
        <div className="sub">{T9.loading}</div>
      ) : (
        <form onSubmit={submit}>
          <div className="f2">
            <div className="fld">
              <label htmlFor="ce-first">{T.firstName} *</label>
              <input
                id="ce-first"
                required
                autoFocus
                value={identity.firstName}
                onChange={(e) => change({ firstName: e.target.value })}
              />
            </div>
            <div className="fld">
              <label htmlFor="ce-last">{T.lastName}</label>
              <input
                id="ce-last"
                value={identity.lastName}
                onChange={(e) => change({ lastName: e.target.value })}
              />
            </div>
          </div>

          <div className="f2">
            <div className="fld">
              <label htmlFor="ce-job">{T15.jobTitleLbl}</label>
              <input
                id="ce-job"
                value={identity.jobTitle}
                onChange={(e) => change({ jobTitle: e.target.value })}
              />
            </div>
            <div className="fld">
              <label htmlFor="ce-city">{T16.contactCityLbl}</label>
              <input
                id="ce-city"
                value={identity.city}
                onChange={(e) => change({ city: e.target.value })}
              />
            </div>
          </div>

          <div className="fld">
            <label htmlFor="ce-email">{T.emailOptional}</label>
            <input
              id="ce-email"
              type="email"
              inputMode="email"
              dir="ltr"
              value={identity.email}
              onChange={(e) => change({ email: e.target.value })}
            />
          </div>

          <h3 style={{ margin: '16px 0 4px' }}>{T13.phonesSection}</h3>
          <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '0 0 10px' }}>
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
            type="submit"
            disabled={busy || entries === null}
          >
            {busy ? T6.saving : T6.saveChanges}
          </button>
        </form>
      )}

      {identity === null && error !== null && (
        <div className="error-banner">{error}</div>
      )}
    </ModalSheet>
  );
};
