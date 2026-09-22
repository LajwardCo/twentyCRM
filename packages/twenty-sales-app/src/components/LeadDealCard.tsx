import { useState } from 'react';

import { type LeadOffer } from '../api/offers';
import {
  type DealProductLine,
  fetchLeadPricing,
  fetchProducts,
  type LeadSummary,
  type ProductOption,
} from '../api/records';
import { splitDealLineCadence } from '../lib/salesOrderLineDetails';
import { type LeadUsystemsLink } from '../api/usystems';
import { useCached } from '../lib/cache';
import {
  addCurrencyTotals,
  type CurrencyTotals,
  formatMoney,
  formatMoneyTotals,
  totalsAreEmpty,
} from '../lib/format';
import { formatJalaliDate, toPersianDigits } from '../lib/jalali';
import { T19 } from '../lib/strings';
import { IconPackage } from './icons';
import { LeadOffersCard } from './LeadOffersCard';
import { PricingCard } from './LeadPanels';
import { LeadSalesOrderCard } from './LeadSalesOrderCard';

// The commercial thread of a lead in one card: what we sell (product lines
// and quotations), what price was negotiated (offers), and the formal order
// issued into Usystems Core -- three tabs over the same deal, with a summary
// strip that reads the same whichever tab is open.
//
// Each tab body is the previous standalone card in embedded mode, so the
// logic, API calls and copy of each section are unchanged; only the frame is.
// A tab whose section is unavailable on this instance (offers not provisioned,
// Usystems not connected) is dropped rather than shown empty.

type Tab = 'products' | 'offers' | 'order';

type Props = {
  lead: LeadSummary;
  currentUserId: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  onAgreed: () => void;
};

const isPast = (isoDate: string | null | undefined): boolean =>
  Boolean(isoDate) && new Date(`${isoDate}T23:59:59`) < new Date();

export const LeadDealCard = ({ lead, currentUserId, contactPhone, contactEmail, onAgreed }: Props) => {
  const [tab, setTab] = useState<Tab>('products');
  const [offersSupported, setOffersSupported] = useState<boolean | null>(null);
  const [orderSupported, setOrderSupported] = useState<boolean | null>(null);
  const [offers, setOffers] = useState<LeadOffer[]>([]);
  const [orderLink, setOrderLink] = useState<LeadUsystemsLink | null>(null);

  // Same cache key the pricing tab uses, so the strip costs no extra request.
  const { data: pricing } = useCached(`pricing:${lead.id}`, () => fetchLeadPricing(lead.id));
  // Same cache key the pricing tab uses, so the split costs no extra request.
  const { data: products } = useCached('products', fetchProducts);
  const lines: DealProductLine[] = pricing?.dealProducts ?? [];
  // installPrice folds the monthly metrics into it; keep one-time and recurring
  // apart even in the strip total (see splitDealLineCadence).
  const cadenceTotals = lines.reduce(
    (acc, line) => {
      const product = (products ?? []).find((p: ProductOption) => p.id === line.product?.id);
      const split = splitDealLineCadence(line, product);
      return {
        oneTime: addCurrencyTotals(acc.oneTime, split.oneTimeMicros, split.currencyCode),
        monthly: addCurrencyTotals(acc.monthly, split.monthlyMicros, split.currencyCode),
        annual: addCurrencyTotals(acc.annual, split.annualMicros, split.currencyCode),
      };
    },
    { oneTime: {} as CurrencyTotals, monthly: {} as CurrencyTotals, annual: {} as CurrencyTotals },
  );

  const openOffers = offers.filter((o) => o.offerStatus === 'PROPOSED').length;
  const orderCode = orderLink?.usystemsSalesOrderCode ?? null;
  const orderExpired = isPast(orderLink?.usystemsSalesOrderValidUntil);

  // A tab that turned out unsupported after being selected falls back to the
  // first one rather than leaving the card body blank.
  const activeTab: Tab =
    (tab === 'offers' && offersSupported === false) || (tab === 'order' && orderSupported === false)
      ? 'products'
      : tab;

  return (
    <div className="card card-pad anim" data-testid="lead-deal-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ display: 'flex', gap: 8, alignItems: 'center', margin: 0 }}>
          <IconPackage size={16} />
          {T19.dealSection}
        </h3>
        <div className="tab-row" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'products'}
            className={activeTab === 'products' ? 'on' : ''}
            onClick={() => setTab('products')}
          >
            {T19.tabProducts}
            {lines.length > 0 && <span className="deal-tab-count num">{toPersianDigits(lines.length)}</span>}
          </button>
          {offersSupported !== false && (
            <button
              role="tab"
              aria-selected={activeTab === 'offers'}
              className={activeTab === 'offers' ? 'on' : ''}
              onClick={() => setTab('offers')}
            >
              {T19.tabOffers}
              {openOffers > 0 && <span className="deal-tab-count num">{toPersianDigits(openOffers)}</span>}
            </button>
          )}
          {orderSupported !== false && (
            <button
              role="tab"
              aria-selected={activeTab === 'order'}
              className={activeTab === 'order' ? 'on' : ''}
              onClick={() => setTab('order')}
              data-testid="deal-tab-order"
            >
              {T19.tabOrder}
              {orderCode && <span className={`deal-tab-count num ${orderExpired ? 'over' : ''}`}>{orderCode}</span>}
            </button>
          )}
        </div>
      </div>

      {/* summary strip: the deal at a glance, on every tab */}
      <div className="deal-strip">
        <div className="deal-stat">
          <span>{T19.stripLines}</span>
          <b className="num">
            {totalsAreEmpty(cadenceTotals.oneTime) ? '—' : formatMoneyTotals(cadenceTotals.oneTime)}
          </b>
          {!totalsAreEmpty(cadenceTotals.monthly) && (
            <span className="num" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
              ماهانه {formatMoneyTotals(cadenceTotals.monthly)}
            </span>
          )}
          {!totalsAreEmpty(cadenceTotals.annual) && (
            <span className="num" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
              سالانه {formatMoneyTotals(cadenceTotals.annual)}
            </span>
          )}
        </div>
        <div className="deal-stat">
          <span>{T19.stripAgreed}</span>
          <b className="num">
            {lead.agreedPrice?.amountMicros != null
              ? formatMoney(lead.agreedPrice.amountMicros, lead.agreedPrice.currencyCode)
              : openOffers > 0
                ? `${toPersianDigits(openOffers)} ${T19.stripOpenOffers}`
                : '—'}
          </b>
        </div>
        {orderSupported !== false && (
          <div className="deal-stat">
            <span>{T19.stripOrder}</span>
            <b className="num" style={{ color: orderExpired ? 'var(--danger)' : undefined }}>
              {orderCode
                ? `${orderCode}${
                    orderLink?.usystemsSalesOrderValidUntil
                      ? ` · ${orderExpired ? T19.stripExpired : T19.stripValidUntil} ${formatJalaliDate(orderLink.usystemsSalesOrderValidUntil)}`
                      : ''
                  }`
                : '—'}
            </b>
          </div>
        )}
      </div>

      <div className="deal-body">
        {/* All three stay mounted: switching tabs must not refetch, and the
            hidden ones keep reporting support and counts for the strip. */}
        <div hidden={activeTab !== 'products'}>
          <PricingCard lead={lead} embedded />
        </div>
        <div hidden={activeTab !== 'offers'}>
          <LeadOffersCard
            leadId={lead.id}
            currentUserId={currentUserId}
            onAgreed={onAgreed}
            embedded
            onSupported={setOffersSupported}
            onOffersChange={setOffers}
          />
        </div>
        <div hidden={activeTab !== 'order'}>
          <LeadSalesOrderCard
            leadId={lead.id}
            leadName={lead.name}
            companyId={lead.company?.id ?? null}
            companyName={lead.company?.name ?? null}
            contactPhone={contactPhone}
            contactEmail={contactEmail}
            city={null}
            embedded
            onSupported={setOrderSupported}
            onLinkChange={setOrderLink}
          />
        </div>
      </div>
    </div>
  );
};
