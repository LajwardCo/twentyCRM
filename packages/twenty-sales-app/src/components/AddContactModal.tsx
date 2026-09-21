import { useEffect, useState } from 'react';

import {
  attachExistingContact,
  createCompanyContact,
  searchUnlinkedPeople,
  setLeadPrimaryContact,
} from '../api/contacts';
import { fetchCompanyContacts, type CompanyContact } from '../api/records';
import { invalidateCache } from '../lib/cache';
import { fullPhone, personName } from '../lib/format';
import { toPersianDigits } from '../lib/jalali';
import { T8 } from '../lib/strings';
import { ModalSheet } from './ModalSheet';

type AddContactModalProps = {
  companyId: string;
  // When set, whoever is added becomes this lead's point of contact. Used from
  // the lead's contact card, where "add a contact" can only mean "give this
  // lead the person it is missing".
  promoteForLeadId?: string;
  // When true (and a lead is being promoted for), the modal opens on a "select"
  // tab listing the company's existing contacts, so a call/demo/visit task can
  // pick who it is about without creating a duplicate. The pick promotes that
  // person to the lead's point of contact.
  enableSelectExisting?: boolean;
  // The lead's current point of contact, badged and non-selectable in the list.
  currentPrimaryId?: string;
  onClose: () => void;
  onSaved: (message: string) => void;
};

type Tab = 'select' | 'new' | 'existing';

const emptyDraft = {
  firstName: '',
  lastName: '',
  jobTitle: '',
  phone: '',
  email: '',
  city: '',
};

export const AddContactModal = ({
  companyId,
  promoteForLeadId,
  enableSelectExisting = false,
  currentPrimaryId,
  onClose,
  onSaved,
}: AddContactModalProps) => {
  // The "select" tab only makes sense when a pick can go somewhere — i.e. when
  // we are promoting for a lead. Without that it silently falls back to "new".
  const selectEnabled = enableSelectExisting && promoteForLeadId !== undefined;
  const [tab, setTab] = useState<Tab>(selectEnabled ? 'select' : 'new');
  const [draft, setDraft] = useState(emptyDraft);
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState<CompanyContact[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [companyContacts, setCompanyContacts] = useState<CompanyContact[] | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the company's own contacts for the "select" tab.
  useEffect(() => {
    if (!selectEnabled) return;
    let active = true;
    fetchCompanyContacts(companyId)
      .then((found) => {
        if (active) setCompanyContacts(found);
      })
      .catch(() => {
        if (active) setCompanyContacts([]);
      });
    return () => {
      active = false;
    };
  }, [selectEnabled, companyId]);

  const setField = (key: keyof typeof emptyDraft, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  // Debounced so typing a phone number doesn't fire a query per keystroke.
  useEffect(() => {
    const term = search.trim();
    if (tab !== 'existing' || term.length < 2) {
      setMatches(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    let active = true;
    const timer = window.setTimeout(() => {
      searchUnlinkedPeople(term, companyId)
        .then((found) => {
          if (active) setMatches(found);
        })
        .catch(() => {
          if (active) setMatches([]);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 320);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search, tab, companyId]);

  const done = (message: string) => {
    invalidateCache(`company:${companyId}`);
    onSaved(message);
  };

  // Promotion is a second write, and failing it must not read as "the contact
  // was not added" -- the person is on the company either way.
  const promoteIfAsked = async (personId: string) => {
    if (promoteForLeadId === undefined) return;
    try {
      await setLeadPrimaryContact(promoteForLeadId, personId);
    } catch {
      /* the contact is saved; the lead simply keeps its old point of contact */
    }
  };

  const handleCreate = async () => {
    if (draft.firstName.trim() === '') {
      setError(T8.contactFirstNameRequired);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createCompanyContact(companyId, draft);
      await promoteIfAsked(created.id);
      done(T8.contactAdded);
    } catch (err) {
      setError(err instanceof Error ? err.message : T8.contactSaveFailed);
    } finally {
      setBusy(false);
    }
  };

  // Picking an existing company contact just promotes it — the person is
  // already on the company, so no create/attach is needed.
  const handleSelect = async (person: CompanyContact) => {
    if (promoteForLeadId === undefined) return;
    setBusy(true);
    setError(null);
    try {
      await setLeadPrimaryContact(promoteForLeadId, person.id);
      done(T8.contactPrimaryChanged);
    } catch (err) {
      setError(err instanceof Error ? err.message : T8.contactPrimaryFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleAttach = async (person: CompanyContact) => {
    setBusy(true);
    setError(null);
    try {
      await attachExistingContact(person.id, companyId);
      await promoteIfAsked(person.id);
      done(T8.contactAdded);
    } catch (err) {
      setError(err instanceof Error ? err.message : T8.contactSaveFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalSheet title={T8.addContactTitle} onClose={onClose}>
      <div className="seg" style={{ marginBottom: 14 }}>
        {selectEnabled && (
          <button
            className={tab === 'select' ? 'on' : ''}
            onClick={() => {
              setTab('select');
              setError(null);
            }}
          >
            {T8.contactTabSelect}
          </button>
        )}
        <button
          className={tab === 'new' ? 'on' : ''}
          onClick={() => {
            setTab('new');
            setError(null);
          }}
        >
          {T8.contactTabNew}
        </button>
        <button
          className={tab === 'existing' ? 'on' : ''}
          onClick={() => {
            setTab('existing');
            setError(null);
          }}
        >
          {T8.contactTabExisting}
        </button>
      </div>

      {tab === 'select' && (
        <>
          <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '0 0 10px' }}>
            {T8.contactSelectHint}
          </p>

          {error !== null && <div className="error-banner">{error}</div>}

          {companyContacts === null && (
            <div className="empty-state" style={{ padding: '14px 0' }}>
              {T8.contactSearching}
            </div>
          )}

          {companyContacts !== null && companyContacts.length === 0 && (
            <div className="empty-state" style={{ padding: '14px 0' }}>
              {T8.contactSelectEmpty}
            </div>
          )}

          {companyContacts?.map((person) => {
            const phone = fullPhone(person.phones);
            const isCurrent = person.id === currentPrimaryId;
            return (
              <div key={person.id} className="task" style={{ padding: '9px 2px' }}>
                <span className="avatar av-26">{person.name.firstName.charAt(0)}</span>
                <div className="t-main" style={{ cursor: 'default' }}>
                  <div className="t-title" style={{ fontSize: 13 }}>
                    {personName(person)}
                    {isCurrent && (
                      <span className="pill ok" style={{ marginRight: 6, fontSize: 10.5 }}>
                        {T8.contactPrimaryBadge}
                      </span>
                    )}
                  </div>
                  <div className="t-sub num">
                    {person.jobTitle ? `${person.jobTitle} · ` : ''}
                    {phone ? toPersianDigits(phone) : '—'}
                  </div>
                </div>
                <button
                  className="btn line sm"
                  disabled={busy || isCurrent}
                  onClick={() => void handleSelect(person)}
                >
                  {T8.contactSelect}
                </button>
              </div>
            );
          })}
        </>
      )}

      {tab === 'new' && (
        <>
          <div className="f2">
            <div className="fld">
              <label htmlFor="ac-first">{T8.contactFirstNameLbl}</label>
              <input
                id="ac-first"
                value={draft.firstName}
                onChange={(e) => setField('firstName', e.target.value)}
                autoFocus
              />
            </div>
            <div className="fld">
              <label htmlFor="ac-last">{T8.contactLastNameLbl}</label>
              <input
                id="ac-last"
                value={draft.lastName}
                onChange={(e) => setField('lastName', e.target.value)}
              />
            </div>
          </div>

          <div className="fld">
            <label htmlFor="ac-job">{T8.contactJobTitleLbl}</label>
            <input
              id="ac-job"
              value={draft.jobTitle}
              onChange={(e) => setField('jobTitle', e.target.value)}
            />
          </div>

          <div className="f2">
            <div className="fld">
              <label htmlFor="ac-phone">{T8.contactPhoneLbl}</label>
              <input
                id="ac-phone"
                type="tel"
                dir="ltr"
                value={draft.phone}
                onChange={(e) => setField('phone', e.target.value)}
              />
            </div>
            <div className="fld">
              <label htmlFor="ac-city">{T8.contactCityLbl}</label>
              <input
                id="ac-city"
                value={draft.city}
                onChange={(e) => setField('city', e.target.value)}
              />
            </div>
          </div>

          <div className="fld">
            <label htmlFor="ac-email">{T8.contactEmailLbl}</label>
            <input
              id="ac-email"
              type="email"
              dir="ltr"
              value={draft.email}
              onChange={(e) => setField('email', e.target.value)}
            />
          </div>

          {error !== null && <div className="error-banner">{error}</div>}

          <button
            className="btn gold block"
            style={{ padding: 12 }}
            disabled={busy || draft.firstName.trim() === ''}
            onClick={handleCreate}
          >
            {busy ? T8.contactSaving : T8.contactSave}
          </button>
        </>
      )}

      {tab === 'existing' && (
        <>
          <div className="fld">
            <label htmlFor="ac-search">{T8.contactSearchLbl}</label>
            <input
              id="ac-search"
              value={search}
              placeholder={T8.contactSearchPlaceholder}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '0 0 10px' }}>
            {T8.contactAttachHint}
          </p>

          {error !== null && <div className="error-banner">{error}</div>}

          {searching && (
            <div className="empty-state" style={{ padding: '14px 0' }}>
              {T8.contactSearching}
            </div>
          )}

          {!searching && matches !== null && matches.length === 0 && (
            <div className="empty-state" style={{ padding: '14px 0' }}>
              {T8.contactSearchEmpty}
            </div>
          )}

          {!searching &&
            matches?.map((person) => {
              const phone = fullPhone(person.phones);
              return (
                <div key={person.id} className="task" style={{ padding: '9px 2px' }}>
                  <span className="avatar av-26">{person.name.firstName.charAt(0)}</span>
                  <div className="t-main" style={{ cursor: 'default' }}>
                    <div className="t-title" style={{ fontSize: 13 }}>
                      {personName(person)}
                    </div>
                    <div className="t-sub num">
                      {person.jobTitle ? `${person.jobTitle} · ` : ''}
                      {phone ? toPersianDigits(phone) : '—'}
                    </div>
                  </div>
                  <button
                    className="btn line sm"
                    disabled={busy}
                    onClick={() => void handleAttach(person)}
                  >
                    {T8.contactAttach}
                  </button>
                </div>
              );
            })}
        </>
      )}
    </ModalSheet>
  );
};
