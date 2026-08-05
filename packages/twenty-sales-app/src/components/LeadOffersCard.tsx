import { useCallback, useEffect, useState } from 'react';

import {
  acceptLeadOffer,
  createLeadOffer,
  fetchLeadOffers,
  type LeadOffer,
  rejectLeadOffer,
} from '../api/offers';
import {
  CURRENCY_SYMBOLS,
  type CurrencyCode,
  DEFAULT_CURRENCY,
  formatDateTime,
  formatMoney,
  SUPPORTED_CURRENCIES,
} from '../lib/format';
import { OFFER_STATUS_LABELS, T7 } from '../lib/strings';

// Negotiation history on a lead: what was offered, when, by whom, and which
// offer was finally accepted. The card hides itself entirely on an instance
// that hasn't run provision-subscriptions-referrals-offers.mjs -- the whole
// object is missing there, and a blank section is better than an error.

type Props = {
  leadId: string;
  currentUserId: string | null;
  // Lets the lead screen refresh its own agreed-price display once an offer is
  // accepted, since accepting writes to the opportunity too.
  onAgreed: () => void;
};

const STATUS_TONE: Record<string, string> = {
  PROPOSED: 'later',
  ACCEPTED: 'ok',
  REJECTED: 'over',
  SUPERSEDED: 'muted',
};

export const LeadOffersCard = ({ leadId, currentUserId, onAgreed }: Props) => {
  const [offers, setOffers] = useState<LeadOffer[]>([]);
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [amountInput, setAmountInput] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [noteInput, setNoteInput] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchLeadOffers(leadId);
      if (!result.supported) {
        setSupported(false);
        return;
      }
      setOffers(result.value);
    } catch {
      setError(T7.offersLoadFailed);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!supported) return null;

  const amount = Number(amountInput);
  const canSubmit = Number.isFinite(amount) && amount > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createLeadOffer({
        opportunityId: leadId,
        amountMicros: Math.round(amount * 1_000_000),
        currencyCode: currency,
        note: noteInput.trim() === '' ? null : noteInput.trim(),
        offeredById: currentUserId,
      });
      if (!result.supported) {
        setSupported(false);
        return;
      }
      setAmountInput('');
      setNoteInput('');
      setAdding(false);
      await load();
    } catch {
      setError(T7.offerSaveFailed);
    } finally {
      setBusy(false);
    }
  };

  const accept = async (offer: LeadOffer) => {
    setBusy(true);
    setError(null);
    try {
      await acceptLeadOffer({ offer, opportunityId: leadId, otherOffers: offers });
      await load();
      onAgreed();
    } catch {
      setError(T7.offerSaveFailed);
    } finally {
      setBusy(false);
    }
  };

  const reject = async (offer: LeadOffer) => {
    setBusy(true);
    setError(null);
    try {
      await rejectLeadOffer(offer.id);
      await load();
    } catch {
      setError(T7.offerSaveFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card card-pad anim d3">
      <h3>{T7.offersSection}</h3>
      <div className="sub">{T7.offersHint}</div>

      {error !== null && <div className="err">{error}</div>}

      {loading ? (
        <div className="sub">{T7.loading}</div>
      ) : offers.length === 0 ? (
        <div className="empty-state">{T7.noOffersYet}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {offers.map((offer) => (
            <div
              key={offer.id}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                borderTop: '1px solid var(--line)',
                paddingTop: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 140 }}>
                <div className="num" style={{ fontWeight: 700 }}>
                  {formatMoney(offer.amount?.amountMicros, offer.amount?.currencyCode)}
                </div>
                <div className="t-sub">
                  {formatDateTime(offer.offeredAt ?? offer.createdAt)}
                  {offer.offeredBy !== null &&
                    ` — ${offer.offeredBy.name.firstName} ${offer.offeredBy.name.lastName}`}
                </div>
                {offer.note !== null && offer.note !== '' && (
                  <div className="t-sub">{offer.note}</div>
                )}
              </div>
              <span className={`due ${STATUS_TONE[offer.offerStatus ?? ''] ?? 'later'}`}>
                {OFFER_STATUS_LABELS[offer.offerStatus ?? ''] ?? '—'}
              </span>
              {offer.offerStatus === 'PROPOSED' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn soft sm"
                    disabled={busy}
                    onClick={() => void accept(offer)}
                  >
                    {T7.acceptOffer}
                  </button>
                  <button
                    type="button"
                    className="btn line sm"
                    disabled={busy}
                    onClick={() => void reject(offer)}
                  >
                    {T7.rejectOffer}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className="fld" style={{ flex: 1, minWidth: 120 }}>
              <label>
                {T7.offerAmountLbl} ({CURRENCY_SYMBOLS[currency] ?? currency})
              </label>
              <input
                inputMode="decimal"
                dir="ltr"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
            </div>
            <div className="fld" style={{ maxWidth: 110 }}>
              <label>{T7.offerCurrencyLbl}</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              >
                {SUPPORTED_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="fld">
            <label>{T7.offerNoteLbl}</label>
            <input
              value={noteInput}
              placeholder={T7.offerNotePlaceholder}
              onChange={(e) => setNoteInput(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn soft sm"
              disabled={!canSubmit}
              onClick={() => void submit()}
            >
              {T7.saveOffer}
            </button>
            <button
              type="button"
              className="btn line sm"
              disabled={busy}
              onClick={() => setAdding(false)}
            >
              {T7.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <button type="button" className="btn soft sm" onClick={() => setAdding(true)}>
            {T7.addOffer}
          </button>
        </div>
      )}
    </div>
  );
};
