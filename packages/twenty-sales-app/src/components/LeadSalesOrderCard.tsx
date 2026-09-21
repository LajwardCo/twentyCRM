import { useCallback, useEffect, useState } from 'react';

import { type DealProductLine, fetchLeadPricing, fetchProducts } from '../api/records';
import {
  fetchCompanyUsystemsContactId,
  fetchLeadUsystemsLink,
  fetchSalesOrderPrintDocument,
  fetchUsystemsStatus,
  type IssuedSalesOrder,
  type LeadUsystemsLink,
  type SalesOrderHistoryEntry,
  saveLeadUsystemsLink,
} from '../api/usystems';
import { useCached } from '../lib/cache';
import { formatMoney } from '../lib/format';
import { formatJalaliDate } from '../lib/jalali';
import {
  buildPrintableHtml,
  downloadSalesOrderPdf,
  openPrintWindow,
  renderSalesOrderDocument,
} from '../lib/salesOrderDocument';
import { orderHistory, withIssuedOrder } from '../lib/salesOrderHistory';
import { T18 } from '../lib/strings';
import { IssueSalesOrderModal } from './IssueSalesOrderModal';

// The formal, numbered offers for this lead, issued into Usystems Core.
//
// Lists every order the CRM issued for the lead, newest first, with whether
// its deadline has passed, and the actions: issue another, download one as a
// PDF, or print it through the tenant's Template Studio template.
//
// Hides itself when the server has no Usystems connection configured, and
// when the instance hasn't run provision-usystems-link.mjs.

type Props = {
  leadId: string;
  leadName: string;
  companyId: string | null;
  companyName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  city: string | null;
  // Inside the Deal card: no outer card or title, the host draws those.
  embedded?: boolean;
  // The host hides the tab when the server is not connected or the instance
  // is not provisioned, instead of the component hiding itself.
  onSupported?: (supported: boolean) => void;
  onLinkChange?: (link: LeadUsystemsLink | null) => void;
};

type Busy = { id: string; action: 'download' | 'print' } | null;

const isPast = (isoDate: string | null): boolean =>
  Boolean(isoDate) && new Date(`${isoDate}T23:59:59`) < new Date();

const describeError = (err: unknown): string =>
  `${T18.printFailed} ${err instanceof Error ? err.message : ''}`.trim();

export const LeadSalesOrderCard = ({
  leadId,
  leadName,
  companyId,
  companyName,
  contactPhone,
  contactEmail,
  city,
  embedded = false,
  onSupported,
  onLinkChange,
}: Props) => {
  const { data: pricing } = useCached(`pricing:${leadId}`, () => fetchLeadPricing(leadId));
  const dealLines: DealProductLine[] = pricing?.dealProducts ?? [];
  // Same key the products tab caches under, so this costs no extra request.
  const { data: products } = useCached('products', fetchProducts);

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [link, setLink] = useState<LeadUsystemsLink | null | 'unsupported'>(null);
  const [linkedContactId, setLinkedContactId] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [status, leadLink, contactId] = await Promise.all([
        fetchUsystemsStatus().catch(() => ({ configured: false })),
        fetchLeadUsystemsLink(leadId),
        companyId ? fetchCompanyUsystemsContactId(companyId) : Promise.resolve(null),
      ]);
      setConfigured(status.configured);
      setLink(leadLink === null ? 'unsupported' : leadLink);
      setLinkedContactId(contactId);
      const ok = status.configured && leadLink !== null;
      onSupported?.(ok);
      onLinkChange?.(ok ? leadLink : null);
    } catch {
      setConfigured(false);
      onSupported?.(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (configured === null || link === null) return null;
  if (link === 'unsupported' || !configured) return null;

  const orders = orderHistory(link);
  const hasOrders = orders.length > 0;

  const onIssued = async (order: IssuedSalesOrder) => {
    setIssuing(false);
    setNotice(`${T18.issued}: ${order.code}`);
    setError(null);
    const next = withIssuedOrder(link, order);
    try {
      await saveLeadUsystemsLink(leadId, next);
    } catch {
      setError(T18.linkSaveFailed);
    }
    setLink(next);
    onLinkChange?.(next);
    if (order.id) await print(String(order.id));
  };

  const withDocument = async (
    id: string,
    action: 'download' | 'print',
    run: (doc: Awaited<ReturnType<typeof fetchSalesOrderPrintDocument>>) => Promise<void> | void,
  ) => {
    setBusy({ id, action });
    setError(null);
    try {
      await run(await fetchSalesOrderPrintDocument(Number(id)));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  };

  const print = (id: string) =>
    withDocument(id, 'print', (doc) => {
      const rendered = renderSalesOrderDocument(doc);
      if (!rendered.ok) throw new Error(rendered.error ?? '');
      if (!openPrintWindow(buildPrintableHtml(doc, rendered))) setError(T18.popupBlocked);
    });

  const download = (id: string) =>
    withDocument(id, 'download', async (doc) => {
      const rendered = renderSalesOrderDocument(doc);
      if (!rendered.ok) throw new Error(rendered.error ?? '');
      await downloadSalesOrderPdf(doc, rendered);
    });

  const row = (order: SalesOrderHistoryEntry) => {
    const expired = isPast(order.validUntil);
    const busyHere = busy !== null && busy.id === order.id;
    return (
      <div className="so-row" key={order.code} data-testid="lead-sales-order-row">
        <div className="so-row-main">
          <span>
            <span className="so-row-code num">{order.code}</span>
            {order.validUntil && (
              <span className={`due ${expired ? 'over' : 'later'}`} style={{ marginInlineStart: 8 }}>
                {expired ? T18.expired : T18.validUntil} <bdi>{formatJalaliDate(order.validUntil)}</bdi>
              </span>
            )}
          </span>
          <span className="so-row-meta">
            {order.documentDate && (
              <span>
                {T18.orderDate}: <bdi className="num">{formatJalaliDate(order.documentDate)}</bdi>
              </span>
            )}
            {order.total && (
              <span>
                {T18.orderTotal}:{' '}
                <b className="num">{formatMoney(Number(order.total) * 1_000_000, order.currencyCode)}</b>
              </span>
            )}
          </span>
        </div>
        {order.id && (
          <div className="so-row-actions">
            <button
              type="button"
              className="btn soft sm"
              disabled={busy !== null}
              onClick={() => void download(order.id as string)}
              data-testid="lead-download-sales-order"
            >
              {busyHere && busy?.action === 'download' ? T18.preparing : T18.downloadPdf}
            </button>
            <button
              type="button"
              className="btn line sm"
              disabled={busy !== null}
              onClick={() => void print(order.id as string)}
              data-testid="lead-print-sales-order"
            >
              {busyHere && busy?.action === 'print' ? T18.preparing : T18.printPdf}
            </button>
          </div>
        )}
      </div>
    );
  };

  const body = (
    <>
      {!embedded && <h3>{T18.salesOrderSection}</h3>}
      <div className="sub">{T18.salesOrderHint}</div>

      {notice !== null && (
        <div className="pill ok" style={{ marginTop: 8, display: 'inline-block' }}>{notice}</div>
      )}
      {error !== null && <div className="error-banner" style={{ marginTop: 8 }}>{error}</div>}

      {hasOrders ? (
        <div className="so-list" data-testid="lead-sales-order-list">{orders.map(row)}</div>
      ) : (
        <div className="empty-state" style={{ marginTop: 8 }}>{T18.noOrderYet}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn soft sm"
          onClick={() => setIssuing(true)}
          data-testid="lead-issue-sales-order"
        >
          {hasOrders ? T18.reissueOrder : T18.issueOrder}
        </button>
      </div>

      {issuing && (
        <IssueSalesOrderModal
          leadName={leadName}
          companyId={companyId}
          companyName={companyName}
          contactPhone={contactPhone}
          contactEmail={contactEmail}
          city={city}
          linkedContactId={linkedContactId}
          dealLines={dealLines}
          products={products ?? []}
          onClose={() => setIssuing(false)}
          onIssued={onIssued}
        />
      )}
    </>
  );

  return embedded ? (
    <div data-testid="lead-sales-order-card">{body}</div>
  ) : (
    <div className="card card-pad anim d3" data-testid="lead-sales-order-card">
      {body}
    </div>
  );
};
