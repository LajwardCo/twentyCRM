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
import { parseDecimalInput } from '../lib/numberInput';
import {
  PARTNER_TYPE_LABELS,
  REFERRER_ROLE_LABELS,
  T9,
  T10,
  T13,
} from '../lib/strings';
import { PartnerQuickAddModal } from './PartnerQuickAddModal';
import { SearchSelect } from './SearchSelect';

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
  // Refetches the partner list after one is created here, so the new name is
  // selectable straight away rather than after a reload.
  onPartnersChanged?: () => void | Promise<void>;
};

const ROLES: ReferrerRole[] = ['FINDER', 'INTRODUCER', 'CLOSER', 'OTHER'];

export const LeadReferrersCard = ({
  leadId,
  primaryReferrer,
  partners,
  onPartnersChanged,
}: Props) => {
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

  // Creating a referrer without leaving the lead. Every picker here reads the
  // partner list, so a referral for someone not already in it was previously
  // impossible to record at the moment the seller actually learned about it.
  // Non-null while the picker's "add new" dialog is open, holding what was
  // typed so the dialog starts from that name.
  const [newPartnerName, setNewPartnerName] = useState<string | null>(null);

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
      setError(T10.referrersLoadFailed);
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
      const result = await addLeadReferrer({
        opportunityId: leadId,
        partnerId,
        commissionPercent: parseDecimalInput(commissionInput),
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
      setError(T10.referrerSaveFailed);
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
      setError(T10.referrerSaveFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card card-pad anim d3">
      <h3>{T10.referrersSection}</h3>
      <div className="sub">{T10.referrersHint}</div>

      {error !== null && <div className="err">{error}</div>}

      {loading ? (
        <div className="sub">{T9.loading}</div>
      ) : entries.length === 0 ? (
        <div className="empty-state">{T10.noExtraReferrers}</div>
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
                {T10.removeReferrer}
              </button>
            </div>
          ))}
        </div>
      )}

      {(entries.length > 0 || primaryReferrer !== null) && (
        <div className="c-row" style={{ marginTop: 8 }}>
          <span>{T10.totalCommissionLbl}</span>
          <b className="num">{toPersianDigits(Math.round(total * 100) / 100)}٪</b>
        </div>
      )}
      {total > 100 && <div className="err">{T10.commissionOverCommitted}</div>}

      {adding ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          <div className="fld">
            <label>{T10.referrerPartnerLbl}</label>
            <SearchSelect
              value={partnerId}
              onChange={setPartnerId}
              options={selectable.map((partner) => ({
                value: partner.id,
                label: partner.name,
                hint: partner.partnerType
                  ? (PARTNER_TYPE_LABELS[partner.partnerType] ?? partner.partnerType)
                  : undefined,
              }))}
              emptyLabel={T10.referrerPickPartner}
              placeholder={T10.referrerPickPartner}
              ariaLabel={T10.referrerPartnerLbl}
              onCreate={setNewPartnerName}
              createLabel={T13.addReferrerInline}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className="fld" style={{ flex: 1, minWidth: 120 }}>
              <label>{T10.referrerRoleLbl}</label>
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
              <label>{T10.referrerCommissionLbl}</label>
              <input
                inputMode="decimal"
                dir="ltr"
                value={commissionInput}
                onChange={(e) => setCommissionInput(e.target.value)}
              />
            </div>
          </div>
          <div className="fld">
            <label>{T10.referrerNoteLbl}</label>
            <input value={noteInput} onChange={(e) => setNoteInput(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn soft sm"
              disabled={busy || partnerId === ''}
              onClick={() => void submit()}
            >
              {T10.saveReferrer}
            </button>
            <button
              type="button"
              className="btn line sm"
              disabled={busy}
              onClick={() => setAdding(false)}
            >
              {T9.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <button type="button" className="btn soft sm" onClick={() => setAdding(true)}>
            {T10.addReferrer}
          </button>
        </div>
      )}

      {newPartnerName !== null && (
        <PartnerQuickAddModal
          initialName={newPartnerName}
          defaultType="OTHER"
          existingNames={partners.map((partner) => partner.name)}
          onCancel={() => setNewPartnerName(null)}
          onCreated={async (partner) => {
            setNewPartnerName(null);
            setPartnerId(partner.id);
            // The picker reads the parent's list; until it is refetched the
            // new id has no label to show.
            await onPartnersChanged?.();
          }}
        />
      )}
    </div>
  );
};
