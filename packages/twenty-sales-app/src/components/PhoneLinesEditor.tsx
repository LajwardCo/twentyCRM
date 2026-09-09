import { useState } from 'react';

import { toPersianDigits } from '../lib/jalali';
import {
  makePhoneEntry,
  PHONE_APPS,
  type PhoneApp,
  type PhoneEntry,
} from '../lib/phones';
import { PHONE_APP_LABELS, T9, T13 } from '../lib/strings';

type PhoneLinesEditorProps = {
  // Null while the numbers are still loading.
  entries: PhoneEntry[] | null;
  // False on an instance without the `phoneApps` field: the numbers still
  // edit, only the messaging-app badges are unavailable.
  appsSupported: boolean;
  onChange: (next: PhoneEntry[]) => void;
  // Rejected input (unparseable or duplicate number) is reported up so the
  // host dialog shows it in the same place as its save errors.
  onError: (message: string | null) => void;
};

// The list of numbers a contact answers on, plus which app reaches them on
// each. Owns no data of its own -- the host dialog holds the entries and
// decides when they are written -- so the same editor serves the phones-only
// sheet and the full contact editor without the two drifting apart.
export const PhoneLinesEditor = ({
  entries,
  appsSupported,
  onChange,
  onError,
}: PhoneLinesEditorProps) => {
  const [newNumber, setNewNumber] = useState('');

  const list = entries ?? [];

  const addNumber = () => {
    const candidate = makePhoneEntry(newNumber, []);
    if (candidate === null) {
      onError(T13.phoneInvalid);
      return;
    }
    if (list.some((entry) => entry.e164 === candidate.e164)) {
      onError(T13.phoneDuplicate);
      return;
    }
    onError(null);
    setNewNumber('');
    // The first number added to an empty contact becomes the primary, which is
    // the one the lead header dials.
    onChange([...list, { ...candidate, isPrimary: list.length === 0 }]);
  };

  const toggleApp = (e164: string, app: PhoneApp) =>
    onChange(
      list.map((entry) =>
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

  const removeNumber = (e164: string) => {
    const next = list.filter((entry) => entry.e164 !== e164);
    // Removing the primary promotes whatever is left, so the contact is never
    // left with numbers but nothing to dial.
    onChange(next.map((entry, index) => ({ ...entry, isPrimary: index === 0 })));
  };

  // Order is meaning here: the first entry is written as the primary.
  const makePrimary = (e164: string) => {
    const chosen = list.find((entry) => entry.e164 === e164);
    if (chosen === undefined) return;
    onChange(
      [chosen, ...list.filter((entry) => entry.e164 !== e164)].map(
        (entry, index) => ({ ...entry, isPrimary: index === 0 }),
      ),
    );
  };

  return (
    <>
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
              if (e.key === 'Enter') {
                // Inside the contact editor this input sits in a <form>;
                // Enter must add a line, not submit the whole dialog.
                e.preventDefault();
                addNumber();
              }
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
    </>
  );
};
