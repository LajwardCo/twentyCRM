import { useCallback, useEffect, useState } from 'react';

import {
  addLeadReferrer,
  fetchLeadReferrers,
  type LeadReferrer,
  removeLeadReferrer,
  type ReferrerRole,
  totalCommissionPercent,
} from '../api/leadReferrers';
import { type Referrer } from '../api/records';
import { toPersianDigits } from '../lib/jalali';
import { REFERRER_ROLE_LABELS, T8, T9 } from '../lib/strings';

// Additional referrers credited on a lead, each with the commission share
// negotiated for THIS deal. The primary referrer (opportunity.referrer) is
// shown by the meta card above and is included in the total here, since what
// matters to the business is everything committed on the deal.
//
// Hides itself on an instance that hasn't run
// provision-subscriptions-referrals-offers.mjs.

type Props = {
  leadId: string;
  // The lead's primary referrer, so the total reflects the whole commitment.
  primaryReferrer: Referrer | null;
  partners: Referrer[];
};

const ROLES: ReferrerRole[] = ['FINDER', 'INTRODUCER', 'CLOSER', 'OTHER'];

export const LeadReferrersCard = ({ leadId, primaryReferrer, partners }: Props) => {
  const [entries, setEntries] = useState<LeadReferrer[]>([]);
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [partnerId, setPartnerId] = useState('');
  const [role, setRole] = useState<ReferrerRole>('FINDER');
  const [commissionInput, setCommissionInput] = useState('');
  const [noteInput, setNoteInput] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchLeadReferrers(leadId);
      if (!result.supported) {
        setSupported(false);
        return;
      }
      setEntries(result.value);
    } catch {
      setError(T9.referrersLoadFailed);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!supported) return null;

  // A partner already credited here (or already the primary) shouldn't be
  // offered again -- two rows for one person is a double commission, not a
  // second contribution.
  const creditedIds = new Set(
    [primaryReferrer?.id, ...entries.map((entry) => entry.partner?.id)].filter(
      (id): id is string => typeof id === 'string',
    ),
  );
  const selectable = partners.filter((partner) => !creditedIds.has(partner.id));

  const total = totalCommissionPercent(primaryReferrer, entries);

  const submit = async () => {
    if (partnerId === '') return;
    setBusy(true);
    setError(null);
    try {
      const commission = Number(commissionInput);
      const result = await addLeadReferrer({
        opportunityId: leadId,
        partnerId,
        commissionPercent:
          commissionInput.trim() === '' || !Number.isFinite(commission)
            ? null
            : commission,
        referrerRole: role,
        note: noteInput.trim() === '' ? null : noteInput.trim(),
      });
      if (!result.supported) {
        setSupported(false);
        return;
      }
      setPartnerId('');
      setCommissionInput('');
      setNoteInput('');
      setAdding(false);
      await load();
    } catch {
      setError(T9.referrerSaveFailed);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await removeLeadReferrer(id);
      await load();
    } catch {
      setError(T9.referrerSaveFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card card-pad anim d3">
      <h3>{T9.referrersSection}</h3>
      <div className="sub">{T9.referrersHint}</div>

      {error !== null && <div className="err">{error}</div>}

      {loading ? (
        <div className="sub">{T8.loading}</div>
      ) : entries.length === 0 ? (
        <div className="empty-state">{T9.noExtraReferrers}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {entries.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
                borderTop: '1px solid var(--line)',
                paddingTop: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ fontWeight: 700 }}>{item.partner?.name ?? '—'}</div>
                <div className="t-sub">
                  {REFERRER_ROLE_LABELS[item.referrerRole ?? ''] ?? '—'}
                  {item.note !== null && item.note !== '' && ` — ${item.note}`}
                </div>
              </div>
              <b className="num">
                {item.commissionPercent === null
                  ? '—'
                  : `${toPersianDigits(item.commissionPercent)}٪`}
              </b>
              <button
                type="button"
                className="btn line sm"
                disabled={busy}
                onClick={() => void remove(item.id)}
              >
                {T9.removeReferrer}
              </button>
            </div>
          ))}
        </div>
      )}

      {(entries.length > 0 || primaryReferrer !== null) && (
        <div className="c-row" style={{ marginTop: 8 }}>
          <span>{T9.totalCommissionLbl}</span>
          <b className="num">{toPersianDigits(Math.round(total * 100) / 100)}٪</b>
        </div>
      )}
      {total > 100 && <div className="err">{T9.commissionOverCommitted}</div>}

      {adding ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          <div className="fld">
            <label>{T9.referrerPartnerLbl}</label>
            <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
              <option value="">{T9.referrerPickPartner}</option>
              {selectable.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className="fld" style={{ flex: 1, minWidth: 120 }}>
              <label>{T9.referrerRoleLbl}</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as ReferrerRole)}
              >
                {ROLES.map((value) => (
                  <option key={value} value={value}>
                    {REFERRER_ROLE_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="fld" style={{ maxWidth: 140 }}>
              <label>{T9.referrerCommissionLbl}</label>
              <input
                inputMode="decimal"
                dir="ltr"
                value={commissionInput}
                onChange={(e) => setCommissionInput(e.target.value)}
              />
            </div>
          </div>
          <div className="fld">
            <label>{T9.referrerNoteLbl}</label>
            <input value={noteInput} onChange={(e) => setNoteInput(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn soft sm"
              disabled={busy || partnerId === ''}
              onClick={() => void submit()}
            >
              {T9.saveReferrer}
            </button>
            <button
              type="button"
              className="btn line sm"
              disabled={busy}
              onClick={() => setAdding(false)}
            >
              {T8.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <button type="button" className="btn soft sm" onClick={() => setAdding(true)}>
            {T9.addReferrer}
          </button>
        </div>
      )}
    </div>
  );
};
