import { useCallback, useEffect, useMemo, useState } from 'react';

import { type DealProductLine } from '../api/records';
import {
  fetchUsystemsCurrencies,
  type IssuedSalesOrder,
  issueSalesOrder,
  registerUsystemsContact,
  saveCompanyUsystemsContactId,
  searchUsystemsContacts,
  type UsystemsContact,
  type UsystemsCurrency,
  UsystemsError,
} from '../api/usystems';
import { formatMoney } from '../lib/format';
import { formatJalaliDate } from '../lib/jalali';
import {
  defaultValidUntil,
  type DraftLine,
  draftLinesFromDeal,
  draftTotal,
  emptyLine,
  today,
  validDraftLines,
} from '../lib/salesOrderDraft';
import { T9, T18 } from '../lib/strings';
import { JalaliDatePicker } from './JalaliDatePicker';
import { ModalSheet } from './ModalSheet';

// Issuing a Sales Order into Usystems Core from a lead.
//
// Two steps in one sheet. First the client: a sales order needs a registered
// Core contact, so the seller searches Core and links a match, or registers
// the lead's company as a new customer. The link is written back onto the CRM
// company so it is made once. Then the lines, pre-filled from the lead's deal
// products, with the currency, the order date and -- the point of the
// document -- the date until which the offer stands.

type Props = {
  leadName: string;
  companyId: string | null;
  companyName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  city: string | null;
  /** Already-linked Core contact id, if the company was linked before. */
  linkedContactId: string | null;
  dealLines: DealProductLine[];
  onClose: () => void;
  onIssued: (order: IssuedSalesOrder) => void;
};

const describeError = (error: unknown): string => {
  if (error instanceof UsystemsError) {
    const details = error.details;
    if (details && typeof details === 'object') {
      const firstField = Object.entries(details as Record<string, unknown>)[0];
      if (firstField) {
        const [field, value] = firstField;
        const text = Array.isArray(value) ? value.join(', ') : String(value);
        return `${field}: ${text}`;
      }
    }
    return error.message;
  }
  return error instanceof Error ? error.message : T18.issueFailed;
};

export const IssueSalesOrderModal = ({
  leadName,
  companyId,
  companyName,
  contactPhone,
  contactEmail,
  city,
  linkedContactId,
  dealLines,
  onClose,
  onIssued,
}: Props) => {
  // --- client ---
  const [client, setClient] = useState<UsystemsContact | null>(null);
  const [query, setQuery] = useState(companyName ?? leadName);
  const [results, setResults] = useState<UsystemsContact[]>([]);
  const [searching, setSearching] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  // --- order ---
  const [lines, setLines] = useState<DraftLine[]>(() => draftLinesFromDeal(dealLines));
  const [currencies, setCurrencies] = useState<UsystemsCurrency[]>([]);
  const [currencyId, setCurrencyId] = useState<number | null>(null);
  const [documentDate, setDocumentDate] = useState(today());
  const [validUntil, setValidUntil] = useState(defaultValidUntil());
  const [memo, setMemo] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A previously linked company resolves straight to its Core contact.
  useEffect(() => {
    if (!linkedContactId) return;
    let cancelled = false;
    void searchUsystemsContacts(companyName ?? leadName)
      .then((found) => {
        if (cancelled) return;
        const match = found.find((c) => String(c.id) === String(linkedContactId));
        if (match) setClient(match);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [linkedContactId, companyName, leadName]);

  useEffect(() => {
    void fetchUsystemsCurrencies()
      .then((list) => {
        setCurrencies(list);
        const preferred = list.find((c) => c.is_default) ?? list[0];
        if (preferred) setCurrencyId(preferred.id);
      })
      .catch((err) => setError(describeError(err)));
  }, []);

  const search = useCallback(async (text: string) => {
    const q = text.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    setClientError(null);
    try {
      setResults(await searchUsystemsContacts(q));
    } catch (err) {
      setClientError(describeError(err));
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (client) return;
    const handle = setTimeout(() => void search(query), 350);
    return () => clearTimeout(handle);
  }, [query, client, search]);

  const link = async (contact: UsystemsContact) => {
    setClient(contact);
    setClientError(null);
    if (companyId) {
      try {
        await saveCompanyUsystemsContactId(companyId, String(contact.id));
      } catch {
        // The order can still be issued; the link is retried next time.
      }
    }
  };

  const register = async () => {
    setRegistering(true);
    setClientError(null);
    try {
      const created = await registerUsystemsContact({
        name: (companyName ?? leadName).slice(0, 50),
        phone: contactPhone ?? undefined,
        email: contactEmail ?? undefined,
        organization: companyName ?? undefined,
        city: city ?? undefined,
      });
      await link(created);
    } catch (err) {
      setClientError(`${T18.registerFailed} ${describeError(err)}`);
    } finally {
      setRegistering(false);
    }
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const currency = useMemo(
    () => currencies.find((c) => c.id === currencyId) ?? null,
    [currencies, currencyId],
  );
  const payloadLines = validDraftLines(lines);
  const total = draftTotal(lines);
  const canIssue = client !== null && payloadLines.length > 0 && !issuing && validUntil !== '';

  const issue = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!client || payloadLines.length === 0) return;
    setIssuing(true);
    setError(null);
    try {
      const order = await issueSalesOrder({
        contactId: client.id,
        currencyId: currencyId ?? undefined,
        documentDate,
        validUntil,
        memo: memo.trim() || undefined,
        lines: payloadLines,
      });
      onIssued(order);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setIssuing(false);
    }
  };

  return (
    <ModalSheet title={T18.issueTitle} onClose={onClose}>
      <form onSubmit={issue} data-testid="issue-sales-order-form">
        {/* ---- step 1: the client in Core ---- */}
        <h3 style={{ margin: '4px 0 2px' }}>{T18.clientStep}</h3>
        <div className="sub" style={{ marginBottom: 8 }}>{T18.clientHint}</div>

        {client ? (
          <div className="c-row" style={{ alignItems: 'center' }}>
            <span>
              <span className="pill ok" style={{ marginInlineEnd: 6 }}>{T18.linkedClient}</span>
              <b>{client.name}</b>
              <span className="t-sub" style={{ marginInlineStart: 6 }}>
                {client.code}
                {client.phone ? ` · ${client.phone}` : ''}
              </span>
            </span>
            <button type="button" className="btn line sm" onClick={() => setClient(null)}>
              {T18.changeClient}
            </button>
          </div>
        ) : (
          <>
            <div className="fld">
              <input
                value={query}
                placeholder={T18.searchClient}
                onChange={(e) => setQuery(e.target.value)}
                data-testid="usystems-client-search"
              />
            </div>
            {searching && <div className="sub">{T18.searching}</div>}
            {!searching && query.trim().length >= 2 && results.length === 0 && (
              <div className="empty-state">{T18.noClientFound}</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {results.map((contact) => (
                <div className="c-row" key={contact.id} style={{ alignItems: 'center' }}>
                  <span>
                    <b>{contact.name}</b>
                    <span className="t-sub" style={{ marginInlineStart: 6 }}>
                      {contact.code}
                      {contact.phone ? ` · ${contact.phone}` : ''}
                      {contact.organization ? ` · ${contact.organization}` : ''}
                    </span>
                  </span>
                  <button type="button" className="btn soft sm" onClick={() => void link(contact)}>
                    {T18.linkClient}
                  </button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                className="btn line sm"
                disabled={registering}
                onClick={() => void register()}
                data-testid="usystems-register-client"
              >
                {registering ? T18.registering : T18.registerClient}
              </button>
              <div className="t-sub" style={{ marginTop: 4 }}>{T18.registerClientHint}</div>
            </div>
          </>
        )}
        {clientError !== null && <div className="error-banner">{clientError}</div>}

        {/* ---- step 2: the order ---- */}
        <h3 style={{ margin: '16px 0 2px' }}>{T18.linesStep}</h3>
        <div className="sub" style={{ marginBottom: 8 }}>{T18.linesHint}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lines.map((line) => (
            <div
              key={line.key}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 64px 110px 64px auto',
                gap: 6,
                alignItems: 'center',
              }}
            >
              <input
                aria-label={T18.lineDescription}
                placeholder={T18.lineDescription}
                value={line.description}
                onChange={(e) => updateLine(line.key, { description: e.target.value })}
              />
              <input
                aria-label={T18.lineQty}
                type="number"
                min={0}
                step="any"
                value={line.quantity}
                onChange={(e) => updateLine(line.key, { quantity: Number(e.target.value) })}
              />
              <input
                aria-label={T18.lineUnitPrice}
                type="number"
                min={0}
                step="any"
                value={line.unitPrice}
                onChange={(e) => updateLine(line.key, { unitPrice: Number(e.target.value) })}
              />
              <input
                aria-label={T18.lineUnit}
                placeholder={T18.lineUnit}
                value={line.unit ?? ''}
                onChange={(e) => updateLine(line.key, { unit: e.target.value })}
              />
              <button
                type="button"
                className="btn line sm"
                aria-label={T18.removeLine}
                onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <button type="button" className="btn line sm" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
            {T18.addLine}
          </button>
          <span>
            {T18.total}:{' '}
            <b className="num">{formatMoney(total * 1_000_000, currency?.code ?? null)}</b>
          </span>
        </div>
        {payloadLines.length === 0 && <div className="sub">{T18.noLines}</div>}

        <div className="form-grid" style={{ marginTop: 12 }}>
          <div className="fld">
            <label htmlFor="so-currency">{T18.currency}</label>
            <select
              id="so-currency"
              value={currencyId ?? ''}
              onChange={(e) => setCurrencyId(Number(e.target.value) || null)}
            >
              {currencies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                  {c.symbol && c.symbol !== c.code ? ` (${c.symbol})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="so-date">{T18.documentDate}</label>
            <JalaliDatePicker id="so-date" value={documentDate} onChange={setDocumentDate} withTime={false} />
          </div>
          <div className="fld">
            <label htmlFor="so-valid-until">{T18.validUntilField} *</label>
            <JalaliDatePicker id="so-valid-until" value={validUntil} onChange={setValidUntil} withTime={false} />
            <div className="t-sub">{T18.validUntilHint}</div>
          </div>
        </div>
        <div className="fld">
          <label htmlFor="so-memo">{T18.memo}</label>
          <textarea id="so-memo" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>

        {error !== null && <div className="error-banner">{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn gold" type="submit" disabled={!canIssue} data-testid="usystems-issue-submit">
            {issuing ? T18.issuing : T18.issue}
            {validUntil ? ` · ${T18.validUntil} ${formatJalaliDate(validUntil)}` : ''}
          </button>
          <button className="btn line" type="button" onClick={onClose} disabled={issuing}>
            {T9.cancel}
          </button>
        </div>
      </form>
    </ModalSheet>
  );
};
