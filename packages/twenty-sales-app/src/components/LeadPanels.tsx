import { useState } from 'react';

import {
  addProductToLead,
  fetchCompanyContacts,
  fetchCompanyExtras,
  fetchCompanyInfo,
  fetchLeadMarketer,
  fetchLeadPricing,
  fetchProducts,
  LEAD_SOURCES,
  updateLead,
  type LeadSummary,
  type ProductOption,
  type Referrer,
} from '../api/records';
import {
  fetchDiscountRules,
  fetchPackagesForProduct,
  fetchPricingVersionsForPackage,
} from '../api/catalog';
import { useCached } from '../lib/cache';
import {
  buildFactorQuantities,
  buildPriceOverrides,
  type DealLineDraft,
  emptyDealLineDraft,
  productPrimaryCurrency,
} from '../lib/dealLinePricing';
import {
  addCurrencyTotals,
  type CurrencyTotals,
  formatMoney,
  formatMoneyTotals,
  fullPhone,
  personName,
  totalsAreEmpty,
} from '../lib/format';
import { formatJalaliDate, toPersianDigits } from '../lib/jalali';
import {
  LINE_STATUS_LABELS,
  MARKETER_LABELS,
  PARTNER_TYPE_LABELS,
  QUOTE_STATUS_LABELS,
  SOURCE_LABELS,
  T,
  T2,
  T6,
} from '../lib/strings';
import { DealLinePricingEditor, lineMetricNames } from './DealLinePricingEditor';
import { ModalSheet } from './ModalSheet';
import { IconBuilding, IconChevronDown, IconEdit, IconPackage, IconPhone } from './icons';

// ---------- company info + other contacts ----------

export const CompanyCard = ({ companyId }: { companyId: string }) => {
  const [showContacts, setShowContacts] = useState(false);

  const { data } = useCached(`company:${companyId}`, async () => {
    const [info, extras, contacts] = await Promise.all([
      fetchCompanyInfo(companyId),
      fetchCompanyExtras(companyId),
      fetchCompanyContacts(companyId),
    ]);
    return { info, extras, contacts };
  });

  if (!data) {
    return (
      <div className="card card-pad">
        <div className="skeleton" style={{ height: 90 }} />
      </div>
    );
  }

  const { info, extras, contacts } = data;

  return (
    <div className="card card-pad anim">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <IconBuilding size={16} />
          {T2.companySection}
        </h3>
      </div>
      <div className="contact-rows">
        <div className="c-row">
          <span>نام</span>
          <b>{info.name}</b>
        </div>
        {info.employees !== null && info.employees > 0 && (
          <div className="c-row">
            <span>{T2.employees}</span>
            <b className="num">{toPersianDigits(info.employees)}</b>
          </div>
        )}
        {info.domainName?.primaryLinkUrl && (
          <div className="c-row">
            <span>{T2.website}</span>
            <b dir="ltr" style={{ fontSize: 12 }}>
              {info.domainName.primaryLinkUrl.replace(/^https?:\/\//, '')}
            </b>
          </div>
        )}
        {(info.address?.addressCity || info.address?.addressStreet1) && (
          <div className="c-row">
            <span>{T2.addressLbl}</span>
            <b>
              {[info.address?.addressCity, info.address?.addressStreet1]
                .filter(Boolean)
                .join('، ')}
            </b>
          </div>
        )}
        {extras.businessType && (
          <div className="c-row">
            <span>{T2.businessType}</span>
            <b>{extras.businessType}</b>
          </div>
        )}
        {extras.productsServices && (
          <div className="c-row">
            <span>{T2.productsServices}</span>
            <b style={{ fontSize: 12 }}>{extras.productsServices}</b>
          </div>
        )}
      </div>

      <button
        className="btn line sm"
        style={{ width: '100%', marginTop: 13, justifyContent: 'space-between' }}
        onClick={() => setShowContacts((v) => !v)}
      >
        <span>
          {T2.showContacts}{' '}
          <span className="num" style={{ color: 'var(--ink-3)' }}>
            ({toPersianDigits(contacts.length)})
          </span>
        </span>
        <span
          style={{
            display: 'inline-flex',
            transform: showContacts ? 'rotate(180deg)' : 'none',
            transition: 'transform .2s',
          }}
        >
          <IconChevronDown size={15} />
        </span>
      </button>

      {showContacts && (
        <div style={{ marginTop: 8 }}>
          {contacts.length === 0 && (
            <div className="empty-state" style={{ padding: '14px 0' }}>
              مخاطبی ثبت نشده
            </div>
          )}
          {contacts.map((c) => {
            const phone = fullPhone(c.phones);
            return (
              <div
                key={c.id}
                className="task"
                style={{ padding: '9px 2px', animation: 'rise-in .25s both' }}
              >
                <span className="avatar av-26">{c.name.firstName.charAt(0)}</span>
                <div className="t-main" style={{ cursor: 'default' }}>
                  <div className="t-title" style={{ fontSize: 13 }}>
                    {personName(c)}
                  </div>
                  <div className="t-sub num">
                    {c.jobTitle ? `${c.jobTitle} · ` : ''}
                    {phone ? toPersianDigits(phone) : '—'}
                  </div>
                </div>
                {phone && (
                  <button
                    className="icon-btn"
                    style={{ width: 30, height: 30 }}
                    onClick={() => (window.location.href = `tel:${phone}`)}
                    aria-label="تماس"
                  >
                    <IconPhone size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ---------- metadata: source, referrer, marketer, created-by ----------

type MetaOption = { value: string; label: string };

// Click-to-edit row: shows a value that turns into a <select> on click.
//
// The select deliberately does NOT close on blur. Mobile browsers fire blur on
// the select when the native option picker opens, which unmounted the control
// before the user could choose — the edit looked like it simply did nothing.
// Selecting commits and closes; Escape cancels.
const EditableMetaRow = ({
  label,
  display,
  currentValue,
  options,
  editable,
  onSave,
}: {
  label: React.ReactNode;
  display: React.ReactNode;
  currentValue: string;
  options: MetaOption[];
  editable: boolean;
  onSave: (value: string) => Promise<void>;
}) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (value: string) => {
    if (value === currentValue) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(value);
      setEditing(false);
    } catch (err) {
      // A rejected save used to reject silently, so a permission error was
      // indistinguishable from a control that did nothing.
      setError(err instanceof Error ? err.message : T2.metaSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="c-row" style={editing ? { alignItems: 'flex-start' } : undefined}>
      <span>{label}</span>
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <select
            className="meta-edit"
            autoFocus
            defaultValue={currentValue}
            disabled={saving}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(false);
            }}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {error !== null && (
            <span style={{ fontSize: 11, color: 'var(--hot)', maxWidth: 200 }}>
              {error}
            </span>
          )}
        </div>
      ) : editable ? (
        <button type="button" className="meta-editable" onClick={() => setEditing(true)}>
          {display}
          <IconEdit size={12} />
        </button>
      ) : (
        <b>{display}</b>
      )}
    </div>
  );
};

type MetaCardProps = {
  lead: LeadSummary;
  referrers?: Referrer[];
  editable?: boolean;
  onSaveLead?: (patch: Record<string, unknown>) => Promise<void>;
};

export const MetaCard = ({
  lead,
  referrers = [],
  editable = false,
  onSaveLead,
}: MetaCardProps) => {
  const { data: marketer, refresh: refreshMarketer } = useCached(
    `marketer:${lead.id}`,
    () => fetchLeadMarketer(lead.id),
  );

  const canEdit = editable && !!onSaveLead;

  const sourceOptions: MetaOption[] = [
    { value: '', label: '—' },
    ...LEAD_SOURCES.map((s) => ({
      value: s.value,
      label: SOURCE_LABELS[s.value] ?? s.label,
    })),
  ];

  // The lead's current referrer is added when the fetched list doesn't contain
  // it (the partner query is bounded, and an inactive partner may be absent).
  // Without it the select would open showing "—" and a stray change could clear
  // a referrer the seller never meant to touch.
  const referrerLabelFor = (r: {
    name: string;
    partnerType: string | null;
  }): string =>
    r.partnerType
      ? `${r.name} (${PARTNER_TYPE_LABELS[r.partnerType] ?? r.partnerType})`
      : r.name;

  const referrerOptions: MetaOption[] = [
    { value: '', label: '—' },
    ...referrers.map((r) => ({ value: r.id, label: referrerLabelFor(r) })),
    ...(lead.referrer && !referrers.some((r) => r.id === lead.referrer?.id)
      ? [{ value: lead.referrer.id, label: referrerLabelFor(lead.referrer) }]
      : []),
  ];

  const marketerOptions: MetaOption[] = [
    { value: '', label: '—' },
    ...Object.entries(MARKETER_LABELS).map(([value, label]) => ({ value, label })),
  ];

  const referrerDisplay = lead.referrer ? (
    <>
      {lead.referrer.name}
      {lead.referrer.commissionPercent
        ? ` · ${T2.commission} ${toPersianDigits(lead.referrer.commissionPercent)}٪`
        : ''}
    </>
  ) : (
    '—'
  );

  const referrerLabel = (
    <>
      {T2.referrerLbl}
      {lead.referrer?.partnerType
        ? ` (${PARTNER_TYPE_LABELS[lead.referrer.partnerType] ?? lead.referrer.partnerType})`
        : ''}
    </>
  );

  return (
    <div className="card card-pad anim">
      <h3>{T2.metaSection}</h3>
      <div className="contact-rows">
        <EditableMetaRow
          label="منبع لید"
          display={SOURCE_LABELS[lead.leadSource ?? ''] ?? '—'}
          currentValue={lead.leadSource ?? ''}
          options={sourceOptions}
          editable={canEdit}
          onSave={(value) => onSaveLead!({ leadSource: value || null })}
        />
        <EditableMetaRow
          label={referrerLabel}
          display={referrerDisplay}
          currentValue={lead.referrer?.id ?? ''}
          options={referrerOptions}
          // Editable whenever there is something to choose — clearing an
          // existing referrer counts, so an empty partner list no longer makes
          // the row silently read-only.
          editable={canEdit && referrerOptions.length > 1}
          onSave={(value) => onSaveLead!({ referrerId: value || null })}
        />
        <EditableMetaRow
          label={T2.marketerLbl}
          display={marketer ? (MARKETER_LABELS[marketer] ?? marketer) : '—'}
          currentValue={marketer ?? ''}
          options={marketerOptions}
          editable={canEdit}
          onSave={async (value) => {
            try {
              await updateLead(lead.id, { marketer: value || null });
            } finally {
              await refreshMarketer();
            }
          }}
        />
        {lead.createdBy?.name && (
          <div className="c-row">
            <span>{T2.registeredBy}</span>
            <b>{lead.createdBy.name}</b>
          </div>
        )}
        <div className="c-row">
          <span>تاریخ ثبت</span>
          <b className="num">{formatJalaliDate(lead.createdAt)}</b>
        </div>
      </div>
    </div>
  );
};

// ---------- pricing: deal products + quotations + assign product ----------

export const PricingCard = ({ lead }: { lead: LeadSummary }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<DealLineDraft>(emptyDealLineDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateProduct, setDuplicateProduct] = useState<string | null>(null);

  const { data: pricing, refresh } = useCached(`pricing:${lead.id}`, () =>
    fetchLeadPricing(lead.id),
  );
  const { data: products } = useCached('products', fetchProducts);
  const { data: packages } = useCached(`catalog:packages:${draft.productId}`, () =>
    draft.productId ? fetchPackagesForProduct(draft.productId) : Promise.resolve([]),
  );
  const { data: pricingVersions } = useCached(
    `catalog:pricingVersions:${draft.packageId}`,
    () =>
      draft.packageId
        ? fetchPricingVersionsForPackage(draft.packageId)
        : Promise.resolve([]),
  );
  const { data: discountRules } = useCached('catalog:discountRules', fetchDiscountRules);

  const activeVersion = (pricingVersions ?? []).find((v) => v.isActive) ?? null;
  const selectedProduct = (products ?? []).find(
    (p: ProductOption) => p.id === draft.productId,
  );
  const metricNames = lineMetricNames(selectedProduct, activeVersion?.tierSchedule ?? []);

  // Switching product invalidates the package, the rates typed against the old
  // metric table and the discount rule; switching currency invalidates the
  // rates, which were quoted in the previous one.
  const changeDraft = (patch: Partial<DealLineDraft>) =>
    setDraft((prev) => {
      const next = { ...prev, ...patch };

      if (patch.productId !== undefined && patch.productId !== prev.productId) {
        return {
          ...emptyDealLineDraft(),
          productId: patch.productId,
          quantity: prev.quantity,
          currencyCode: productPrimaryCurrency(
            (products ?? []).find((p: ProductOption) => p.id === patch.productId),
          ),
        };
      }

      if (patch.currencyCode !== undefined && patch.currencyCode !== prev.currencyCode) {
        return { ...next, fixedInstall: '', fixedAnnual: '', metricRates: {} };
      }

      return next;
    });

  const resetForm = () => {
    setShowAdd(false);
    setDraft(emptyDealLineDraft());
  };

  // Adding the same product twice is nearly always a double-tap or a seller
  // who forgot the line is already there, so it is confirmed once rather than
  // silently creating a second line that inflates the deal.
  const addProduct = async (confirmedDuplicate = false) => {
    const product = selectedProduct;
    if (!product) return;

    const alreadyOnLead = (pricing?.dealProducts ?? []).some(
      (line) => line.product?.id === product.id,
    );
    if (alreadyOnLead && !confirmedDuplicate) {
      setDuplicateProduct(product.name);
      return;
    }

    setDuplicateProduct(null);
    setBusy(true);
    setError(null);
    try {
      const factorQuantities = buildFactorQuantities(draft, metricNames);
      const priceOverrides = buildPriceOverrides(product, draft, metricNames);

      await addProductToLead({
        opportunityId: lead.id,
        productId: product.id,
        productName: product.name,
        quantity: Math.max(1, Number(draft.quantity) || 1),
        // Sent for both pricing paths: the package's tier schedule when one is
        // selected, plus whichever product metrics it doesn't tier.
        ...(Object.keys(factorQuantities).length > 0 ? { factorQuantities } : {}),
        ...(activeVersion ? { pricingVersionId: activeVersion.id } : {}),
        ...(draft.discountRuleId ? { discountRuleId: draft.discountRuleId } : {}),
        ...(priceOverrides ? { priceOverrides } : {}),
      });
      resetForm();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در افزودن محصول');
    } finally {
      setBusy(false);
    }
  };

  const lines = pricing?.dealProducts ?? [];
  const quotes = pricing?.quotations ?? [];
  // A lead can hold lines quoted in different currencies, so the total is kept
  // per currency rather than added up and labelled with the first line's code.
  const totalInstall = lines.reduce<CurrencyTotals>(
    (totals, line) =>
      addCurrencyTotals(
        totals,
        line.installPrice?.amountMicros,
        line.installPrice?.currencyCode,
      ),
    {},
  );

  return (
    <div className="card card-pad anim">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <IconPackage size={16} />
          {T2.pricingSection}
        </h3>
        <button className="btn soft sm" onClick={() => setShowAdd((v) => !v)}>
          ＋ {T2.addProduct}
        </button>
      </div>

      {showAdd && (
        <div style={{ marginTop: 12, animation: 'rise-in .25s both' }}>
          <DealLinePricingEditor
            draft={draft}
            onChange={changeDraft}
            products={products ?? []}
            packages={packages ?? []}
            pricingVersions={pricingVersions ?? []}
            discountRules={discountRules ?? []}
          />

          {error !== null && <div className="error-banner">{error}</div>}
          <button
            className="btn sm"
            disabled={busy || draft.productId === ''}
            onClick={() => addProduct()}
          >
            {busy ? '…' : `＋ ${T2.addProduct}`}
          </button>
        </div>
      )}

      {duplicateProduct !== null && (
        <ModalSheet
          title={T6.duplicateProductTitle}
          onClose={() => setDuplicateProduct(null)}
        >
          <div className="sub" style={{ marginBottom: 12 }}>
            <b style={{ color: 'var(--ink)' }}>{duplicateProduct}</b>
            <div style={{ marginTop: 4 }}>{T6.duplicateProductHint}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn line sm"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => setDuplicateProduct(null)}
            >
              {T.close}
            </button>
            <button
              className="btn gold"
              style={{ flex: 2, padding: 12 }}
              onClick={() => addProduct(true)}
            >
              {T6.duplicateAddAnyway}
            </button>
          </div>
        </ModalSheet>
      )}

      {pricing === null && <div className="skeleton" style={{ height: 60, marginTop: 12 }} />}

      {pricing !== null && lines.length === 0 && quotes.length === 0 && !showAdd && (
        <div className="empty-state" style={{ padding: '16px 0 6px' }}>
          {T2.noPricing}
        </div>
      )}

      {lines.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="sub" style={{ marginBottom: 6 }}>
            {T2.dealProducts}
          </div>
          {lines.map((line) => (
            <div key={line.id} className="task" style={{ padding: '9px 2px' }}>
              <div className="t-main" style={{ cursor: 'default' }}>
                <div className="t-title" style={{ fontSize: 13 }}>
                  {line.product?.name ?? line.name}
                  {line.quantity && line.quantity > 1 && (
                    <span className="num" style={{ color: 'var(--ink-3)' }}>
                      {' '}
                      × {toPersianDigits(line.quantity)}
                    </span>
                  )}
                </div>
                <div className="t-sub">
                  {line.lineStatus && (
                    <span className="pill stage" style={{ fontSize: 10.5 }}>
                      {LINE_STATUS_LABELS[line.lineStatus] ?? line.lineStatus}
                    </span>
                  )}
                  {(line.discountPercent ?? 0) > 0 && (
                    <span className="num">
                      {T2.discount} {toPersianDigits(line.discountPercent ?? 0)}٪
                    </span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div className="deal-val num" style={{ fontSize: 12.5 }}>
                  {formatMoney(line.installPrice?.amountMicros, line.installPrice?.currencyCode)}
                </div>
                {(line.annualPrice?.amountMicros ?? 0) > 0 && (
                  <div className="num" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>
                    سالانه {formatMoney(line.annualPrice?.amountMicros, line.annualPrice?.currencyCode)}
                  </div>
                )}
              </div>
            </div>
          ))}
          {!totalsAreEmpty(totalInstall) && (
            <div
              className="c-row"
              style={{
                borderTop: '1px solid var(--line-soft)',
                paddingTop: 9,
                marginTop: 4,
              }}
            >
              <span>{T2.total}</span>
              <b className="num">{formatMoneyTotals(totalInstall)}</b>
            </div>
          )}
        </div>
      )}

      {quotes.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="sub" style={{ marginBottom: 6 }}>
            {T2.quotations}
          </div>
          {quotes.map((q) => (
            <div key={q.id} className="task" style={{ padding: '9px 2px' }}>
              <div className="t-main" style={{ cursor: 'default' }}>
                <div className="t-title" style={{ fontSize: 13 }}>
                  {q.quoteNumber ? `${T2.quoteNumber} ${toPersianDigits(q.quoteNumber)}` : q.name}
                  {q.status && (
                    <span
                      className={`pill ${q.status === 'ACCEPTED' || q.status === 'CONVERTED' ? 'ok' : 'stage'}`}
                      style={{ fontSize: 10.5, marginRight: 6 }}
                    >
                      {QUOTE_STATUS_LABELS[q.status] ?? q.status}
                    </span>
                  )}
                </div>
                <div className="t-sub num">
                  {q.validUntil ? `${T2.validUntil} ${formatJalaliDate(q.validUntil)}` : ''}
                </div>
              </div>
              <span className="deal-val num" style={{ fontSize: 12.5 }}>
                {formatMoney(q.agreedPrice?.amountMicros, q.agreedPrice?.currencyCode)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
