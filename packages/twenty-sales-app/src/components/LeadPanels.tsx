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
  type CatalogDiscountRule,
} from '../api/catalog';
import { useCached } from '../lib/cache';
import { formatMoney, fullPhone, personName } from '../lib/format';
import { formatJalaliDate, toPersianDigits } from '../lib/jalali';
import { estimateProductPrice, hasPriceEstimate } from '../lib/productPricing';
import {
  CONDITION_TYPE_LABELS,
  LINE_STATUS_LABELS,
  MARKETER_LABELS,
  PARTNER_TYPE_LABELS,
  QUOTE_STATUS_LABELS,
  SOURCE_LABELS,
  T2,
  T4,
} from '../lib/strings';
import { IconBuilding, IconChevronDown, IconEdit, IconPackage, IconPhone } from './icons';

// One line describing what a Discount Rule needs to actually apply --
// enforcement is still server-side, this is just so the seller isn't
// guessing why a rule got rejected on submit.
const discountRuleHint = (rule: CatalogDiscountRule): string | null => {
  if (rule.conditionType === 'MIN_QUANTITY' && rule.conditionMinQuantity) {
    return T4.minQuantityHint(rule.conditionMinQuantity);
  }
  if (
    rule.conditionType === 'MIN_METRIC_QUANTITY' &&
    rule.conditionMinQuantity &&
    rule.conditionMetric
  ) {
    return T4.metricQuantityHint(rule.conditionMinQuantity, rule.conditionMetric);
  }
  if (rule.conditionType === 'SIBLING_PRODUCT_PURCHASED' && rule.conditionSiblingProduct) {
    return T4.siblingProductHint(rule.conditionSiblingProduct.name);
  }
  return null;
};

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

// Click-to-edit row: shows a value that turns into a <select> on click. The
// server still enforces permissions — a rejected save just reverts on reload.
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

  const handleChange = async (value: string) => {
    setSaving(true);
    try {
      await onSave(value);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  return (
    <div className="c-row">
      <span>{label}</span>
      {editing ? (
        <select
          className="meta-edit"
          autoFocus
          defaultValue={currentValue}
          disabled={saving}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => setEditing(false)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
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

  const referrerOptions: MetaOption[] = [
    { value: '', label: '—' },
    ...referrers.map((r) => ({
      value: r.id,
      label: r.partnerType
        ? `${r.name} (${PARTNER_TYPE_LABELS[r.partnerType] ?? r.partnerType})`
        : r.name,
    })),
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
          editable={canEdit && referrers.length > 0}
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
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [packageId, setPackageId] = useState('');
  const [factorQuantities, setFactorQuantities] = useState<Record<string, string>>({});
  const [discountRuleId, setDiscountRuleId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: pricing, refresh } = useCached(`pricing:${lead.id}`, () =>
    fetchLeadPricing(lead.id),
  );
  const { data: products } = useCached('products', fetchProducts);
  const { data: packages } = useCached(`catalog:packages:${productId}`, () =>
    productId ? fetchPackagesForProduct(productId) : Promise.resolve([]),
  );
  const { data: pricingVersions } = useCached(`catalog:pricingVersions:${packageId}`, () =>
    packageId ? fetchPricingVersionsForPackage(packageId) : Promise.resolve([]),
  );
  const { data: discountRules } = useCached('catalog:discountRules', fetchDiscountRules);

  const activePackages = (packages ?? []).filter((p) => p.status === 'ACTIVE');
  const activeVersion = (pricingVersions ?? []).find((v) => v.isActive) ?? null;
  const tierSchedule = activeVersion?.tierSchedule ?? [];
  const eligibleRules = (discountRules ?? []).filter(
    (r) => r.appliesToProductId === productId && r.status === 'ACTIVE',
  );
  const selectedRule = eligibleRules.find((r) => r.id === discountRuleId);

  const selectedProduct = (products ?? []).find(
    (p: ProductOption) => p.id === productId,
  );
  // Without an active package version the line prices off the product's own
  // metric table (plus its fixed amounts) -- so those metrics need quantity
  // inputs too, otherwise a PER_FACTOR product can never be priced here.
  const productMetrics =
    activeVersion === null && selectedProduct?.pricingModel === 'PER_FACTOR'
      ? (selectedProduct.pricingFactors ?? [])
      : [];
  const metricNames =
    tierSchedule.length > 0
      ? tierSchedule.map((factor) => factor.factor)
      : productMetrics.map((metric) => metric.name);

  const numericFactorQuantities = Object.fromEntries(
    Object.entries(factorQuantities)
      .filter(([, v]) => v.trim() !== '')
      .map(([k, v]) => [k, Number(v)]),
  );

  const currencyCode =
    selectedProduct?.baseInstallPrice?.currencyCode ??
    selectedProduct?.baseAnnualPrice?.currencyCode ??
    'AFN';
  const estimate =
    productMetrics.length > 0 || selectedProduct?.pricingModel === 'PER_FACTOR'
      ? estimateProductPrice({
          pricingFactors: productMetrics,
          factorQuantities: numericFactorQuantities,
          fixedInstall: (selectedProduct?.baseInstallPrice?.amountMicros ?? 0) / 1_000_000,
          fixedAnnual: (selectedProduct?.baseAnnualPrice?.amountMicros ?? 0) / 1_000_000,
        })
      : null;

  const selectProduct = (nextProductId: string) => {
    setProductId(nextProductId);
    setPackageId('');
    setFactorQuantities({});
    setDiscountRuleId('');
  };

  const selectPackage = (nextPackageId: string) => {
    setPackageId(nextPackageId);
    setFactorQuantities({});
  };

  const resetForm = () => {
    setShowAdd(false);
    selectProduct('');
    setQuantity('1');
  };

  const addProduct = async () => {
    const product = (products ?? []).find((p: ProductOption) => p.id === productId);
    if (!product) return;
    setBusy(true);
    setError(null);
    try {
      await addProductToLead({
        opportunityId: lead.id,
        productId: product.id,
        productName: product.name,
        quantity: Math.max(1, Number(quantity) || 1),
        // Sent for both pricing paths: the package's tier schedule when one is
        // selected, the product's own metric table otherwise.
        ...(Object.keys(numericFactorQuantities).length > 0
          ? { factorQuantities: numericFactorQuantities }
          : {}),
        ...(activeVersion ? { pricingVersionId: activeVersion.id } : {}),
        ...(discountRuleId ? { discountRuleId } : {}),
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
  const totalInstall = lines.reduce(
    (sum, l) => sum + (l.installPrice?.amountMicros ?? 0),
    0,
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
          <div className="f2">
            <div className="fld" style={{ marginBottom: 8 }}>
              <label>{T2.productLbl}</label>
              <select value={productId} onChange={(e) => selectProduct(e.target.value)}>
                <option value="">انتخاب…</option>
                {(products ?? []).map((p: ProductOption) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.baseInstallPrice?.amountMicros
                      ? ` — ${formatMoney(p.baseInstallPrice.amountMicros, p.baseInstallPrice.currencyCode)}`
                      : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="fld" style={{ marginBottom: 8 }}>
              <label>{T2.quantityLbl}</label>
              <input
                inputMode="numeric"
                dir="ltr"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          </div>

          {productId !== '' && activePackages.length > 0 && (
            <div className="fld" style={{ marginBottom: 8 }}>
              <label>{T4.packageLbl}</label>
              <select value={packageId} onChange={(e) => selectPackage(e.target.value)}>
                <option value="">{T4.noPackageOption}</option>
                {activePackages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name}
                  </option>
                ))}
              </select>
              {packageId !== '' && !activeVersion && (
                <div className="sub" style={{ marginTop: 4 }}>
                  {T4.noActiveVersionNote}
                </div>
              )}
            </div>
          )}

          {metricNames.length > 0 && (
            <>
              <div className="sub" style={{ marginBottom: 6 }}>
                {T4.metricQuantitiesHint}
              </div>
              <div className="f2">
                {metricNames.map((metricName) => (
                  <div className="fld" style={{ marginBottom: 8 }} key={metricName}>
                    <label dir="ltr">{metricName}</label>
                    <input
                      inputMode="numeric"
                      dir="ltr"
                      value={factorQuantities[metricName] ?? ''}
                      onChange={(e) =>
                        setFactorQuantities((prev) => ({ ...prev, [metricName]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {estimate !== null && hasPriceEstimate(estimate) && (
            <div
              className="card card-pad"
              style={{ background: 'var(--surface-2, rgba(127,127,127,.06))', marginBottom: 8 }}
            >
              <div className="sub" style={{ marginBottom: 6 }}>
                {T4.estimateSection}
              </div>
              <div className="contact-rows">
                <div className="c-row">
                  <span>{T4.estimateInstallLbl}</span>
                  <b className="num">
                    {formatMoney(estimate.installTotal * 1_000_000, currencyCode)}
                  </b>
                </div>
                {estimate.annualTotal > 0 && (
                  <div className="c-row">
                    <span>{T4.estimateAnnualLbl}</span>
                    <b className="num">
                      {formatMoney(estimate.annualTotal * 1_000_000, currencyCode)}
                    </b>
                  </div>
                )}
              </div>
              <div className="sub" style={{ marginTop: 6 }}>
                {[
                  estimate.fixedInstall > 0 &&
                    `${T4.estimateFixedPart} ${formatMoney(estimate.fixedInstall * 1_000_000, currencyCode)}`,
                  estimate.monthly > 0 &&
                    `${T4.estimateMonthlyPart} ${formatMoney(estimate.monthly * 1_000_000, currencyCode)}`,
                  estimate.hourly > 0 &&
                    `${T4.estimateHourlyPart} ${formatMoney(estimate.hourly * 1_000_000, currencyCode)}`,
                  estimate.annualTotal > 0 &&
                    `${T4.estimateAnnualPart} ${formatMoney(estimate.annualTotal * 1_000_000, currencyCode)}`,
                ]
                  .filter(Boolean)
                  .join(' + ')}
              </div>
              <div className="sub" style={{ marginTop: 4 }}>
                {T4.estimateNote}
              </div>
            </div>
          )}

          {productId !== '' && eligibleRules.length > 0 && (
            <div className="fld" style={{ marginBottom: 8 }}>
              <label>{T4.discountRuleLbl}</label>
              <select value={discountRuleId} onChange={(e) => setDiscountRuleId(e.target.value)}>
                <option value="">{T4.noDiscountOption}</option>
                {eligibleRules.map((rule) => (
                  <option key={rule.id} value={rule.id}>
                    {rule.name} ({CONDITION_TYPE_LABELS[rule.conditionType ?? ''] ?? rule.conditionType})
                  </option>
                ))}
              </select>
              {selectedRule && discountRuleHint(selectedRule) && (
                <div className="sub" style={{ marginTop: 4 }}>
                  {discountRuleHint(selectedRule)}
                </div>
              )}
            </div>
          )}

          {error !== null && <div className="error-banner">{error}</div>}
          <button
            className="btn sm"
            disabled={busy || productId === ''}
            onClick={addProduct}
          >
            {busy ? '…' : `＋ ${T2.addProduct}`}
          </button>
        </div>
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
          {totalInstall > 0 && (
            <div
              className="c-row"
              style={{
                borderTop: '1px solid var(--line-soft)',
                paddingTop: 9,
                marginTop: 4,
              }}
            >
              <span>{T2.total}</span>
              <b className="num">{formatMoney(totalInstall, lines[0]?.installPrice?.currencyCode)}</b>
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
