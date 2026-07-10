import { useState } from 'react';

import {
  addProductToLead,
  fetchCompanyContacts,
  fetchCompanyExtras,
  fetchCompanyInfo,
  fetchLeadMarketer,
  fetchLeadPricing,
  fetchProducts,
  type LeadSummary,
  type ProductOption,
} from '../api/records';
import {
  fetchDiscountRules,
  fetchPackagesForProduct,
  fetchPricingVersionsForPackage,
  type CatalogDiscountRule,
} from '../api/catalog';
import { useCached } from '../lib/cache';
import { formatAfn, fullPhone, personName } from '../lib/format';
import { formatJalaliDate, toPersianDigits } from '../lib/jalali';
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
import { IconBuilding, IconChevronDown, IconPackage, IconPhone } from './icons';

// One line describing what a Discount Rule needs to actually apply --
// enforcement is still server-side, this is just so the seller isn't
// guessing why a rule got rejected on submit.
const discountRuleHint = (rule: CatalogDiscountRule): string | null => {
  if (rule.conditionType === 'MIN_QUANTITY' && rule.conditionMinQuantity) {
    return T4.minQuantityHint(rule.conditionMinQuantity);
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

export const MetaCard = ({ lead }: { lead: LeadSummary }) => {
  const { data: marketer } = useCached(`marketer:${lead.id}`, () =>
    fetchLeadMarketer(lead.id),
  );

  return (
    <div className="card card-pad anim">
      <h3>{T2.metaSection}</h3>
      <div className="contact-rows">
        <div className="c-row">
          <span>منبع لید</span>
          <b>{SOURCE_LABELS[lead.leadSource ?? ''] ?? '—'}</b>
        </div>
        {lead.referrer && (
          <div className="c-row">
            <span>
              {T2.referrerLbl}
              {lead.referrer.partnerType
                ? ` (${PARTNER_TYPE_LABELS[lead.referrer.partnerType] ?? lead.referrer.partnerType})`
                : ''}
            </span>
            <b>
              {lead.referrer.name}
              {lead.referrer.commissionPercent
                ? ` · ${T2.commission} ${toPersianDigits(lead.referrer.commissionPercent)}٪`
                : ''}
            </b>
          </div>
        )}
        {marketer && (
          <div className="c-row">
            <span>{T2.marketerLbl}</span>
            <b>{MARKETER_LABELS[marketer] ?? marketer}</b>
          </div>
        )}
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
      const numericFactorQuantities = Object.fromEntries(
        Object.entries(factorQuantities)
          .filter(([, v]) => v.trim() !== '')
          .map(([k, v]) => [k, Number(v)]),
      );
      await addProductToLead({
        opportunityId: lead.id,
        productId: product.id,
        productName: product.name,
        quantity: Math.max(1, Number(quantity) || 1),
        ...(activeVersion && Object.keys(numericFactorQuantities).length > 0
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
                      ? ` — ${formatAfn(p.baseInstallPrice.amountMicros)}`
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

          {tierSchedule.length > 0 && (
            <div className="f2">
              {tierSchedule.map((factor) => (
                <div className="fld" style={{ marginBottom: 8 }} key={factor.factor}>
                  <label dir="ltr">{factor.factor}</label>
                  <input
                    inputMode="numeric"
                    dir="ltr"
                    value={factorQuantities[factor.factor] ?? ''}
                    onChange={(e) =>
                      setFactorQuantities((prev) => ({ ...prev, [factor.factor]: e.target.value }))
                    }
                  />
                </div>
              ))}
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
                  {formatAfn(line.installPrice?.amountMicros)}
                </div>
                {(line.annualPrice?.amountMicros ?? 0) > 0 && (
                  <div className="num" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>
                    سالانه {formatAfn(line.annualPrice?.amountMicros)}
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
              <b className="num">{formatAfn(totalInstall)}</b>
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
                {formatAfn(q.agreedPrice?.amountMicros)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
