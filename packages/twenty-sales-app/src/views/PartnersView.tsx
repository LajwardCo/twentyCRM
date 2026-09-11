import { useCallback, useEffect, useState } from 'react';

import {
  createPartner,
  deletePartner,
  fetchPartnerLeadCounts,
  fetchPartners,
  type Partner,
  type PartnerInput,
  PARTNER_TYPES,
  type PartnerType,
  updatePartner,
} from '../api/partners';
import { toPersianDigits } from '../lib/jalali';
import { parseDecimalInput } from '../lib/numberInput';
import { PARTNER_TYPE_LABELS, T9, T13 } from '../lib/strings';

// Managing marketers, referrers and partners.
//
// Everything on a lead that credits an outside person -- the marketer picker,
// the referrer picker, the additional-referrers card -- picks from this list
// and nothing else, so before this screen existed a name that no provisioning
// script had seeded simply could not be entered.

type Draft = PartnerInput & { id: string | null };

const emptyDraft = (): Draft => ({
  id: null,
  name: '',
  partnerType: 'MARKETER',
  commissionPercent: null,
});

export const PartnersView = () => {
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [supported, setSupported] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [commissionInput, setCommissionInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await fetchPartners();
      if (!result.supported) {
        setSupported(false);
        setPartners([]);
        return;
      }
      setPartners(result.value);
      setCounts(await fetchPartnerLeadCounts());
    } catch {
      setError(T13.partnersLoadFailed);
      setPartners([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2200);
  };

  const startEdit = (partner?: Partner) => {
    setError(null);
    if (partner === undefined) {
      setDraft(emptyDraft());
      setCommissionInput('');
      return;
    }
    setDraft({
      id: partner.id,
      name: partner.name,
      partnerType: (partner.partnerType as PartnerType | null) ?? 'MARKETER',
      commissionPercent: partner.commissionPercent,
    });
    setCommissionInput(
      partner.commissionPercent === null ? '' : String(partner.commissionPercent),
    );
  };

  const save = async () => {
    if (draft === null) return;
    const name = draft.name.trim();
    if (name === '') {
      setError(T13.partnerNameRequired);
      return;
    }
    // Two partners with the same name are indistinguishable in every picker
    // that reads this list, and the commission would then be credited to
    // whichever one happened to be chosen.
    const clash = (partners ?? []).some(
      (p) => p.id !== draft.id && p.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (clash) {
      setError(T13.partnerDuplicateName);
      return;
    }

    const input: PartnerInput = {
      name,
      partnerType: draft.partnerType,
      commissionPercent: parseDecimalInput(commissionInput),
    };

    setBusy(true);
    setError(null);
    try {
      if (draft.id === null) {
        const result = await createPartner(input);
        if (!result.supported) {
          setSupported(false);
          return;
        }
      } else {
        await updatePartner(draft.id, input);
      }
      setDraft(null);
      flash(T13.partnerSaved);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : T13.partnerSaveFailed);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await deletePartner(id);
      setConfirmingDelete(null);
      flash(T13.partnerDeleted);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : T13.partnerDeleteFailed);
    } finally {
      setBusy(false);
    }
  };

  if (!supported) {
    return (
      <div className="card card-pad">
        <h3>{T13.partners}</h3>
        <div className="empty-state">{T13.partnersUnsupported}</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card card-pad anim">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3>{T13.partners}</h3>
            <div className="sub">{T13.partnersHint}</div>
          </div>
          {draft === null && (
            <button type="button" className="btn gold sm" onClick={() => startEdit()}>
              {T13.addPartner}
            </button>
          )}
        </div>

        {error !== null && <div className="err">{error}</div>}
        {notice !== null && (
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 8 }}>
            {notice}
          </div>
        )}

        {draft !== null && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginTop: 12,
              borderTop: '1px solid var(--line)',
              paddingTop: 12,
            }}
          >
            <strong style={{ fontSize: 14 }}>
              {draft.id === null ? T13.newPartnerTitle : T13.editPartnerTitle}
            </strong>
            <div className="fld">
              <label htmlFor="pt-name">{T13.partnerNameLbl}</label>
              <input
                id="pt-name"
                value={draft.name}
                autoFocus
                onChange={(e) =>
                  setDraft((prev) =>
                    prev === null ? prev : { ...prev, name: e.target.value },
                  )
                }
              />
            </div>
            <div className="f2">
              <div className="fld">
                <label htmlFor="pt-type">{T13.partnerTypeLbl}</label>
                <select
                  id="pt-type"
                  value={draft.partnerType}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev === null
                        ? prev
                        : { ...prev, partnerType: e.target.value as PartnerType },
                    )
                  }
                >
                  {PARTNER_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {PARTNER_TYPE_LABELS[value] ?? value}
                    </option>
                  ))}
                </select>
              </div>
              <div className="fld">
                <label htmlFor="pt-commission">{T13.partnerCommissionLbl}</label>
                <input
                  id="pt-commission"
                  inputMode="decimal"
                  dir="ltr"
                  value={commissionInput}
                  onChange={(e) => setCommissionInput(e.target.value)}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn soft sm"
                disabled={busy || draft.name.trim() === ''}
                onClick={() => void save()}
              >
                {T13.savePartner}
              </button>
              <button
                type="button"
                className="btn line sm"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                {T9.cancel}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card card-pad anim d2">
        {partners === null ? (
          <div className="sub">{T9.loading}</div>
        ) : partners.length === 0 ? (
          <div className="empty-state">{T13.noPartners}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {partners.map((partner) => {
              const leads = counts[partner.id] ?? 0;
              return (
                <div
                  key={partner.id}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    borderBottom: '1px solid var(--line)',
                    padding: '10px 0',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontWeight: 700 }}>{partner.name}</div>
                    <div className="t-sub">
                      {PARTNER_TYPE_LABELS[partner.partnerType ?? ''] ?? '—'}
                      {leads > 0 &&
                        ` · ${toPersianDigits(leads)} ${T13.partnerLeadsCount}`}
                    </div>
                  </div>
                  {partner.commissionPercent !== null && (
                    <b className="num">
                      {toPersianDigits(partner.commissionPercent)}٪
                    </b>
                  )}
                  <button
                    type="button"
                    className="btn line sm"
                    disabled={busy}
                    onClick={() => startEdit(partner)}
                  >
                    {T13.editPartnerTitle}
                  </button>
                  {confirmingDelete === partner.id ? (
                    <>
                      <span className="t-sub">{T13.confirmDeletePartner}</span>
                      <button
                        type="button"
                        className="btn line sm"
                        disabled={busy}
                        onClick={() => void remove(partner.id)}
                      >
                        {T13.deletePartner}
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm"
                        disabled={busy}
                        onClick={() => setConfirmingDelete(null)}
                      >
                        {T9.cancel}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn ghost sm"
                      disabled={busy}
                      onClick={() => setConfirmingDelete(partner.id)}
                    >
                      {T13.deletePartner}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
