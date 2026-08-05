import { useCallback, useEffect, useState } from 'react';

import { type DealProductLine, fetchLeadPricing } from '../api/records';
import {
  createSubscriptionsFromDrafts,
  fetchLeadSubscriptions,
  type Subscription,
  updateSubscriptionStatus,
} from '../api/subscriptions';
import { useCached } from '../lib/cache';
import { formatMoney } from '../lib/format';
import { formatJalaliDate } from '../lib/jalali';
import {
  buildSubscriptionDrafts,
  type SubscriptionDraft,
} from '../lib/subscriptionDrafts';
import {
  BILLING_PERIOD_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  T7,
  T10,
} from '../lib/strings';

// What the customer pays after the deal closes, plus the conversion that
// creates it from the won lead's product lines.
//
// Conversion is a reviewed action rather than an automatic trigger on stage
// change: the annual price on a line is not always the recurring price, and a
// wrong subscription becomes a renewal reminder for money nobody agreed to.
//
// Hides itself on an instance that hasn't run
// provision-subscriptions-referrals-offers.mjs.

type Props = {
  leadId: string;
  companyId: string | null;
  // Won leads are where conversion makes sense; the button is hidden
  // elsewhere rather than disabled, since there is nothing to explain.
  isWon: boolean;
};

const STATUS_TONE: Record<string, string> = {
  PENDING: 'later',
  ACTIVE: 'ok',
  EXPIRED: 'over',
  CANCELLED: 'muted',
};

export const LeadSubscriptionsCard = ({ leadId, companyId, isWon }: Props) => {
  // Same cache key the pricing card uses, so opening a lead doesn't fetch the
  // deal lines twice.
  const { data: pricing } = useCached(`pricing:${leadId}`, () =>
    fetchLeadPricing(leadId),
  );
  const dealLines: DealProductLine[] = pricing?.dealProducts ?? [];

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<SubscriptionDraft[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchLeadSubscriptions(leadId);
      if (!result.supported) {
        setSupported(false);
        return;
      }
      setSubscriptions(result.value);
    } catch {
      setError(T10.subscriptionsLoadFailed);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!supported) return null;

  const startConversion = () => {
    setError(null);
    setDrafts(buildSubscriptionDrafts(dealLines));
  };

  const confirmConversion = async () => {
    if (drafts === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createSubscriptionsFromDrafts({
        drafts,
        opportunityId: leadId,
        companyId,
      });
      if (!result.supported) {
        setSupported(false);
        return;
      }
      setDrafts(null);
    } catch {
      // A part-way failure leaves the rows that landed, so reload either way
      // rather than assume nothing was written.
      setError(T10.convertFailed);
    } finally {
      setBusy(false);
      await load();
    }
  };

  const setStatus = async (
    subscription: Subscription,
    status: 'ACTIVE' | 'CANCELLED',
  ) => {
    setBusy(true);
    setError(null);
    try {
      await updateSubscriptionStatus(subscription.id, status);
      await load();
    } catch {
      setError(T10.convertFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card card-pad anim d3">
      <h3>{T10.subscriptionsSection}</h3>
      <div className="sub">{T10.subscriptionsHint}</div>

      {error !== null && <div className="err">{error}</div>}

      {loading ? (
        <div className="sub">{T7.loading}</div>
      ) : subscriptions.length === 0 ? (
        <div className="empty-state">{T10.noSubscriptions}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {subscriptions.map((subscription) => (
            <div
              key={subscription.id}
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
                <div style={{ fontWeight: 700 }}>
                  {subscription.product?.name ?? '—'}
                </div>
                <div className="num" style={{ fontWeight: 700 }}>
                  {formatMoney(
                    subscription.recurringAmount?.amountMicros,
                    subscription.recurringAmount?.currencyCode,
                  )}
                  {subscription.billingPeriod !== null &&
                    ` / ${BILLING_PERIOD_LABELS[subscription.billingPeriod] ?? ''}`}
                </div>
                <div className="t-sub">
                  {formatJalaliDate(subscription.startDate)} —{' '}
                  {formatJalaliDate(subscription.endDate)}
                </div>
              </div>
              <span
                className={`due ${STATUS_TONE[subscription.subscriptionStatus ?? ''] ?? 'later'}`}
              >
                {SUBSCRIPTION_STATUS_LABELS[subscription.subscriptionStatus ?? ''] ??
                  '—'}
              </span>
              {subscription.subscriptionStatus === 'PENDING' && (
                <button
                  type="button"
                  className="btn soft sm"
                  disabled={busy}
                  onClick={() => void setStatus(subscription, 'ACTIVE')}
                >
                  {T10.activateSubscription}
                </button>
              )}
              {(subscription.subscriptionStatus === 'ACTIVE' ||
                subscription.subscriptionStatus === 'PENDING') && (
                <button
                  type="button"
                  className="btn line sm"
                  disabled={busy}
                  onClick={() => void setStatus(subscription, 'CANCELLED')}
                >
                  {T10.cancelSubscription}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {drafts !== null && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <h3>{T10.convertTitle}</h3>
          <div className="sub">{T10.convertHint}</div>
          {drafts.length === 0 ? (
            <div className="empty-state">{T10.convertNothing}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {drafts.map((entry) => (
                <div className="c-row" key={entry.dealLineId}>
                  <span>{entry.productName}</span>
                  <b className="num">
                    {formatMoney(entry.recurringAmountMicros, entry.currencyCode)} /{' '}
                    {BILLING_PERIOD_LABELS[entry.billingPeriod]}
                  </b>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              type="button"
              className="btn gold sm"
              disabled={busy || drafts.length === 0}
              onClick={() => void confirmConversion()}
            >
              {T10.convertConfirm}
            </button>
            <button
              type="button"
              className="btn line sm"
              disabled={busy}
              onClick={() => setDrafts(null)}
            >
              {T7.cancel}
            </button>
          </div>
        </div>
      )}

      {isWon && drafts === null && (
        <div style={{ marginTop: 10 }}>
          <button type="button" className="btn soft sm" onClick={startConversion}>
            {T10.convertLead}
          </button>
        </div>
      )}
    </div>
  );
};
