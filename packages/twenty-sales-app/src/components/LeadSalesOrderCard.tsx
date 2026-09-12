import { useCallback, useEffect, useState } from 'react';

import { type DealProductLine, fetchLeadPricing } from '../api/records';
import {
  fetchCompanyUsystemsContactId,
  fetchLeadUsystemsLink,
  fetchSalesOrderPrintDocument,
  fetchUsystemsStatus,
  type IssuedSalesOrder,
  type LeadUsystemsLink,
  saveLeadUsystemsLink,
} from '../api/usystems';
import { useCached } from '../lib/cache';
import { formatJalaliDate } from '../lib/jalali';
import {
  buildPrintableHtml,
  openPrintWindow,
  renderSalesOrderDocument,
} from '../lib/salesOrderDocument';
import { T9, T18 } from '../lib/strings';
import { IssueSalesOrderModal } from './IssueSalesOrderModal';

// The formal, numbered offer for this lead, issued into Usystems Core.
//
// Shows the most recently issued order (the CRM keeps only the latest on the
// lead; Core is the list of record), whether its deadline has passed, and the
// two actions: issue one, and print the one that exists through the tenant's
// Template Studio template.
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

const isPast = (isoDate: string | null): boolean =>
  Boolean(isoDate) && new Date(`${isoDate}T23:59:59`) < new Date();

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

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [link, setLink] = useState<LeadUsystemsLink | null | 'unsupported'>(null);
  const [linkedContactId, setLinkedContactId] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [printing, setPrinting] = useState(false);
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

  const code = link.usystemsSalesOrderCode;
  const orderId = link.usystemsSalesOrderId ? Number(link.usystemsSalesOrderId) : null;
  const validUntil = link.usystemsSalesOrderValidUntil;
  const expired = isPast(validUntil);

  const onIssued = async (order: IssuedSalesOrder) => {
    setIssuing(false);
    setNotice(`${T18.issued}: ${order.code}`);
    setError(null);
    const next: LeadUsystemsLink = {
      usystemsSalesOrderCode: order.code,
      usystemsSalesOrderId: order.id ? String(order.id) : null,
      usystemsSalesOrderValidUntil: order.validUntil,
    };
    try {
      await saveLeadUsystemsLink(leadId, next);
      setLink(next);
    } catch {
      setError(T18.linkSaveFailed);
      setLink(next);
    }
    onLinkChange?.(next);
    if (order.id) await print(order.id);
  };

  const print = async (id: number) => {
    setPrinting(true);
    setError(null);
    try {
      const doc = await fetchSalesOrderPrintDocument(id);
      const rendered = renderSalesOrderDocument(doc);
      if (!rendered.ok) {
        setError(`${T18.printFailed} ${rendered.error ?? ''}`.trim());
        return;
      }
      if (!openPrintWindow(buildPrintableHtml(doc, rendered))) {
        setError(T18.popupBlocked);
      }
    } catch (err) {
      setError(`${T18.printFailed} ${err instanceof Error ? err.message : ''}`.trim());
    } finally {
      setPrinting(false);
    }
  };

  const body = (
    <>
      {!embedded && <h3>{T18.salesOrderSection}</h3>}
      <div className="sub">{T18.salesOrderHint}</div>

      {notice !== null && (
        <div className="pill ok" style={{ marginTop: 8, display: 'inline-block' }}>{notice}</div>
      )}
      {error !== null && <div className="error-banner" style={{ marginTop: 8 }}>{error}</div>}

      {code ? (
        <div className="c-row" style={{ marginTop: 10, alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span>
            <span className="t-sub">{T18.latestOrder}: </span>
            <b className="num">{code}</b>
            {validUntil && (
              <span className="t-sub" style={{ marginInlineStart: 8 }}>
                {T18.validUntil} {formatJalaliDate(validUntil)}
              </span>
            )}
          </span>
          <span className={`due ${expired ? 'over' : 'later'}`}>
            {expired ? T18.expired : T18.validUntil}
          </span>
        </div>
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
          {code ? T18.reissueOrder : T18.issueOrder}
        </button>
        {orderId !== null && (
          <button
            type="button"
            className="btn line sm"
            disabled={printing}
            onClick={() => void print(orderId)}
            data-testid="lead-print-sales-order"
          >
            {printing ? T9.loading : T18.printPdf}
          </button>
        )}
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
