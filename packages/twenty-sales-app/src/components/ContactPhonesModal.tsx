import { useEffect, useState } from 'react';

import { fetchPersonPhones, savePersonPhones } from '../api/contacts';
import { toPersianDigits } from '../lib/jalali';
import {
  makePhoneEntry,
  PHONE_APPS,
  type PhoneApp,
  type PhoneEntry,
  phoneEntries,
} from '../lib/phones';
import { PHONE_APP_LABELS, T9, T13 } from '../lib/strings';
import { ModalSheet } from './ModalSheet';

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
export const ContactPhonesModal = ({
  personId,
  personName,
  onClose,
  onSaved,
}: ContactPhonesModalProps) => {
  const [entries, setEntries] = useState<PhoneEntry[] | null>(null);
  const [appsSupported, setAppsSupported] = useState(true);
  const [newNumber, setNewNumber] = useState('');
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

  const addNumber = () => {
    const candidate = makePhoneEntry(newNumber, []);
    if (candidate === null) {
      setError(T13.phoneInvalid);
      return;
    }
    if ((entries ?? []).some((entry) => entry.e164 === candidate.e164)) {
      setError(T13.phoneDuplicate);
      return;
    }
    setError(null);
    setNewNumber('');
    // The first number added to an empty contact becomes the primary, which is
    // the one the lead header dials.
    setEntries((prev) => [
      ...(prev ?? []),
      { ...candidate, isPrimary: (prev ?? []).length === 0 },
    ]);
  };

  const toggleApp = (e164: string, app: PhoneApp) =>
    setEntries((prev) =>
      (prev ?? []).map((entry) =>
        entry.e164 === e164
          ? {
              ...entry,
              apps: entry.apps.includes(app)
                ? entry.apps.filter((value) => value !== app)
                : [...entry.apps, app],
            }
          : entry,
      ),
    );

  const removeNumber = (e164: string) =>
    setEntries((prev) => {
      const next = (prev ?? []).filter((entry) => entry.e164 !== e164);
      // Removing the primary promotes whatever is left, so the contact is
      // never left with numbers but nothing to dial.
      return next.map((entry, index) => ({ ...entry, isPrimary: index === 0 }));
    });

  // Order is meaning here: the first entry is written as the primary.
  const makePrimary = (e164: string) =>
    setEntries((prev) => {
      const list = prev ?? [];
      const chosen = list.find((entry) => entry.e164 === e164);
      if (chosen === undefined) return prev;
      return [chosen, ...list.filter((entry) => entry.e164 !== e164)].map(
        (entry, index) => ({ ...entry, isPrimary: index === 0 }),
      );
    });

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

      {!appsSupported && (
        <div className="error-banner">{T13.phoneAppsUnsupported}</div>
      )}

      {entries === null ? (
        <div className="sub">{T9.loading}</div>
      ) : entries.length === 0 ? (
        <div className="empty-state" style={{ padding: '10px 0' }}>
          {T13.noPhones}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {entries.map((entry) => (
            <div
              key={entry.e164}
              style={{
                borderTop: '1px solid var(--line)',
                paddingTop: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <b className="num" dir="ltr" style={{ flex: 1, minWidth: 130 }}>
                  {toPersianDigits(entry.e164)}
                </b>
                {entry.isPrimary ? (
                  <span className="pill stage">{T13.primaryPhoneBadge}</span>
                ) : (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => makePrimary(entry.e164)}
                  >
                    {T13.makePrimaryPhone}
                  </button>
                )}
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => removeNumber(entry.e164)}
                >
                  {T13.removePhone}
                </button>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PHONE_APPS.map((app) => {
                  const on = entry.apps.includes(app);
                  return (
                    <button
                      key={app}
                      type="button"
                      className={on ? 'btn soft sm' : 'btn line sm'}
                      aria-pressed={on}
                      disabled={!appsSupported}
                      onClick={() => toggleApp(entry.e164, app)}
                    >
                      {on ? '✓ ' : ''}
                      {PHONE_APP_LABELS[app] ?? app}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
          marginTop: 14,
          borderTop: '1px solid var(--line)',
          paddingTop: 12,
        }}
      >
        <div className="fld" style={{ flex: 1 }}>
          <label htmlFor="cp-new">{T13.phoneNumberLbl}</label>
          <input
            id="cp-new"
            type="tel"
            dir="ltr"
            value={newNumber}
            onChange={(e) => setNewNumber(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addNumber();
            }}
          />
        </div>
        <button
          type="button"
          className="btn line sm"
          disabled={newNumber.trim() === ''}
          onClick={addNumber}
        >
          {T13.addPhone}
        </button>
      </div>

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
