import { useState } from 'react';

import {
  fetchPackagesForProduct,
  fetchPackageById,
  fetchPricingVersionsForPackage,
  fetchProductById,
  savePackage,
  saveCatalogProduct,
  savePricingVersion,
  type CatalogPackage,
  type CatalogPackageInput,
  type CatalogPricingVersion,
  type CatalogPricingVersionInput,
  type CatalogProductInput,
  type ProductCurrencyCode,
} from '../api/catalog';
import { JalaliDatePicker } from '../components/JalaliDatePicker';
import { ProductPricingFields } from '../components/ProductPricingFields';
import { TierScheduleEditor } from '../components/TierScheduleEditor';
import { useCached } from '../lib/cache';
import { formatMoney, toLocalInputValue } from '../lib/format';
import { formatJalaliDate } from '../lib/jalali';
import { navigate } from '../lib/router';
import {
  BILLING_FREQUENCY_LABELS,
  CATALOG_STATUS_LABELS,
  CURRENCY_LABELS,
  PRICING_MODEL_LABELS,
  T4,
} from '../lib/strings';


const ViewSkeleton = () => (
  <main className="page">
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="skeleton" style={{ height: 56, maxWidth: 420 }} />
      <div className="skeleton" style={{ height: 200 }} />
    </div>
  </main>
);

// ---------- product detail: fields + its packages ----------

export const ProductCatalogDetailView = ({ productId }: { productId: string }) => {
  const [editing, setEditing] = useState<CatalogProductInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPackage, setNewPackage] = useState<CatalogPackageInput | null>(null);
  const [packageBusy, setPackageBusy] = useState(false);
  const [packageError, setPackageError] = useState<string | null>(null);

  const { data: product, error: loadError, refresh } = useCached(
    `catalog:product:${productId}`,
    () => fetchProductById(productId),
  );
  const {
    data: packages,
    error: packagesError,
    refresh: refreshPackages,
  } = useCached(`catalog:packages:${productId}`, () => fetchPackagesForProduct(productId));

  if (product === null && loadError === null) return <ViewSkeleton />;
  if (!product) {
    return (
      <main className="page">
        <div className="error-banner">{loadError ?? 'محصول یافت نشد'}</div>
      </main>
    );
  }

  const startEdit = () => {
    setEditing({
      name: product.name,
      currencyCode:
        (product.baseInstallPrice?.currencyCode as ProductCurrencyCode | null) ??
        (product.baseAnnualPrice?.currencyCode as ProductCurrencyCode | null) ??
        'AFN',
      baseInstallPriceAmount: product.baseInstallPrice?.amountMicros
        ? product.baseInstallPrice.amountMicros / 1_000_000
        : null,
      baseAnnualPriceAmount: product.baseAnnualPrice?.amountMicros
        ? product.baseAnnualPrice.amountMicros / 1_000_000
        : null,
      maxDiscountPercent: product.maxDiscountPercent,
      pricingModel: product.pricingModel,
      pricingFactors: product.pricingFactors ?? [],
      pricingFactorNotes: product.pricingFactorNotes,
      isSellable: product.isSellable,
    });
    setError(null);
  };

  const set = (patch: Partial<CatalogProductInput>) =>
    setEditing((prev) => (prev ? { ...prev, ...patch } : prev));

  const save = async () => {
    if (!editing || editing.name.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      await saveCatalogProduct(editing, productId);
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ذخیره');
    } finally {
      setBusy(false);
    }
  };

  const startNewPackage = () => {
    setNewPackage({ name: '', productId, status: 'ACTIVE', allowsCustomPricing: false });
    setPackageError(null);
  };

  const savePkg = async () => {
    if (!newPackage || newPackage.name.trim() === '') return;
    setPackageBusy(true);
    setPackageError(null);
    try {
      await savePackage(newPackage);
      setNewPackage(null);
      await refreshPackages();
    } catch (err) {
      setPackageError(err instanceof Error ? err.message : 'خطا در ذخیره');
    } finally {
      setPackageBusy(false);
    }
  };

  return (
    <main className="page" style={{ maxWidth: 860 }}>
      <div className="lead-hero anim">
        <div className="hero-logo">{product.name.charAt(0)}</div>
        <div className="hero-main">
          <h1>{product.name}</h1>
          <div className="hero-meta">
            {product.pricingModel && <span>{PRICING_MODEL_LABELS[product.pricingModel] ?? product.pricingModel}</span>}
            {product.isSellable === false && <span>غیرفعال</span>}
          </div>
        </div>
      </div>

      {editing === null ? (
        <div className="card card-pad anim d1" style={{ marginBottom: 16 }}>
          <div className="contact-rows">
            <div className="c-row">
              <span>
                {product.pricingModel === 'PER_FACTOR'
                  ? T4.fixedInstallLbl
                  : T4.baseInstallPriceLbl}
              </span>
              <b className="num">
                {formatMoney(
                  product.baseInstallPrice?.amountMicros,
                  product.baseInstallPrice?.currencyCode,
                )}
              </b>
            </div>
            <div className="c-row">
              <span>
                {product.pricingModel === 'PER_FACTOR'
                  ? T4.fixedAnnualLbl
                  : T4.baseAnnualPriceLbl}
              </span>
              <b className="num">
                {formatMoney(
                  product.baseAnnualPrice?.amountMicros,
                  product.baseAnnualPrice?.currencyCode,
                )}
              </b>
            </div>
            {product.pricingModel === 'PER_FACTOR' &&
              (product.pricingFactors ?? []).map((m) => (
                <div className="c-row" key={m.name}>
                  <span>
                    {m.name}
                    {' · '}
                    {BILLING_FREQUENCY_LABELS[m.billingFrequency ?? 'MONTHLY']}
                  </span>
                  <b className="num">
                    {formatMoney(
                      m.unitPrice * 1_000_000,
                      product.baseInstallPrice?.currencyCode ??
                        product.baseAnnualPrice?.currencyCode,
                    )}
                  </b>
                </div>
              ))}
            <div className="c-row">
              <span>{T4.maxDiscountPercentLbl}</span>
              <b className="num">{product.maxDiscountPercent ?? '—'}</b>
            </div>
            {product.pricingFactorNotes && (
              <div className="c-row">
                <span>{T4.pricingFactorNotesLbl}</span>
                <b>{product.pricingFactorNotes}</b>
              </div>
            )}
          </div>
          <button className="btn line sm" style={{ marginTop: 12 }} onClick={startEdit}>
            {T4.edit}
          </button>
        </div>
      ) : (
        <div className="card card-pad anim" style={{ marginBottom: 16 }}>
          <h3>{T4.editProduct}</h3>
          <div className="f2" style={{ marginTop: 10 }}>
            <div className="fld">
              <label>{T4.nameLbl}</label>
              <input value={editing.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div className="fld">
              <label>{T4.currencyLbl}</label>
              <select
                value={editing.currencyCode ?? 'AFN'}
                onChange={(e) => set({ currencyCode: e.target.value as ProductCurrencyCode })}
              >
                {Object.entries(CURRENCY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="f2">
            <div className="fld">
              <label>{T4.pricingModelLbl}</label>
              <select
                value={editing.pricingModel ?? 'FLAT'}
                onChange={(e) => set({ pricingModel: e.target.value })}
              >
                {Object.entries(PRICING_MODEL_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label>{T4.maxDiscountPercentLbl}</label>
              <input
                inputMode="numeric"
                dir="ltr"
                value={editing.maxDiscountPercent ?? ''}
                onChange={(e) =>
                  set({ maxDiscountPercent: e.target.value === '' ? null : Number(e.target.value) })
                }
              />
            </div>
          </div>
          <ProductPricingFields value={editing} onChange={set} />
          <div className="fld">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={editing.isSellable ?? true}
                onChange={(e) => set({ isSellable: e.target.checked })}
              />
              {T4.isSellableLbl}
            </label>
          </div>
          <div className="fld">
            <label>{T4.pricingFactorNotesLbl}</label>
            <textarea
              value={editing.pricingFactorNotes ?? ''}
              onChange={(e) => set({ pricingFactorNotes: e.target.value })}
            />
          </div>
          {error !== null && <div className="error-banner">{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" disabled={busy || editing.name.trim() === ''} onClick={save}>
              {busy ? '…' : T4.save}
            </button>
            <button className="btn line" onClick={() => setEditing(null)}>
              {T4.cancel}
            </button>
          </div>
        </div>
      )}

      <div className="card anim d2">
        <div className="card-pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>{T4.packagesSection}</h3>
          <button className="btn soft sm" onClick={startNewPackage}>
            ＋ {T4.newPackage}
          </button>
        </div>

        {newPackage !== null && (
          <div className="card-pad" style={{ paddingTop: 0 }}>
            <div className="f2">
              <div className="fld">
                <label>{T4.nameLbl}</label>
                <input
                  value={newPackage.name}
                  onChange={(e) => setNewPackage({ ...newPackage, name: e.target.value })}
                />
              </div>
              <div className="fld">
                <label>{T4.statusLbl}</label>
                <select
                  value={newPackage.status ?? 'ACTIVE'}
                  onChange={(e) => setNewPackage({ ...newPackage, status: e.target.value })}
                >
                  {Object.entries(CATALOG_STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="fld">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={newPackage.allowsCustomPricing ?? false}
                  onChange={(e) => setNewPackage({ ...newPackage, allowsCustomPricing: e.target.checked })}
                />
                {T4.allowsCustomPricingLbl}
              </label>
            </div>
            <div className="fld">
              <label>{T4.notesLbl}</label>
              <textarea
                value={newPackage.notes ?? ''}
                onChange={(e) => setNewPackage({ ...newPackage, notes: e.target.value })}
              />
            </div>
            {packageError !== null && <div className="error-banner">{packageError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn sm"
                disabled={packageBusy || newPackage.name.trim() === ''}
                onClick={savePkg}
              >
                {packageBusy ? '…' : T4.save}
              </button>
              <button className="btn line sm" onClick={() => setNewPackage(null)}>
                {T4.cancel}
              </button>
            </div>
          </div>
        )}

        {packagesError !== null && (
          <div className="card-pad">
            <div className="error-banner">{packagesError}</div>
          </div>
        )}
        {packages === null && packagesError === null && (
          <div className="card-pad">
            <div className="skeleton" style={{ height: 60 }} />
          </div>
        )}
        {packages !== null && packages.length === 0 && newPackage === null && (
          <div className="empty-state">{T4.noPackages}</div>
        )}
        {packages?.map((pkg: CatalogPackage) => (
          <div className="task" key={pkg.id} onClick={() => navigate(`/catalog/package/${pkg.id}`)}>
            <div className="t-main">
              <div className="t-title">{pkg.name}</div>
              <div className="t-sub">
                {pkg.status && <span className={`pill ${pkg.status === 'ARCHIVED' ? 'cold' : 'ok'}`}>{CATALOG_STATUS_LABELS[pkg.status] ?? pkg.status}</span>}
                {pkg.allowsCustomPricing && <span className="pill">{T4.allowsCustomPricingLbl}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
};

// ---------- package detail: fields + its pricing versions ----------

const EMPTY_VERSION_DRAFT = (packageId: string): CatalogPricingVersionInput => ({
  packageId,
  isActive: true,
  effectiveFrom: new Date().toISOString(),
  currencyCode: 'AFN',
  tierSchedule: [{ factor: '', billingFrequency: 'MONTHLY', bands: [{ minQty: 1, maxQty: null, mode: 'FLAT', amount: 0 }] }],
});

export const PackageCatalogDetailView = ({ packageId }: { packageId: string }) => {
  const [editing, setEditing] = useState<CatalogPackageInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versionDraft, setVersionDraft] = useState<{ input: CatalogPricingVersionInput; id?: string } | null>(
    null,
  );
  const [versionBusy, setVersionBusy] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);

  const { data: pkg, error: loadError, refresh } = useCached(
    `catalog:package:${packageId}`,
    () => fetchPackageById(packageId),
  );
  const {
    data: versions,
    error: versionsError,
    refresh: refreshVersions,
  } = useCached(`catalog:pricingVersions:${packageId}`, () => fetchPricingVersionsForPackage(packageId));

  if (pkg === null && loadError === null) return <ViewSkeleton />;
  if (!pkg) {
    return (
      <main className="page">
        <div className="error-banner">{loadError ?? 'بسته یافت نشد'}</div>
      </main>
    );
  }

  const startEdit = () => {
    setEditing({
      name: pkg.name,
      productId: pkg.productId ?? '',
      status: pkg.status,
      allowsCustomPricing: pkg.allowsCustomPricing,
      notes: pkg.notes,
    });
    setError(null);
  };

  const set = (patch: Partial<CatalogPackageInput>) =>
    setEditing((prev) => (prev ? { ...prev, ...patch } : prev));

  const save = async () => {
    if (!editing || editing.name.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      await savePackage(editing, packageId);
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ذخیره');
    } finally {
      setBusy(false);
    }
  };

  const startNewVersion = () => {
    setVersionDraft({ input: EMPTY_VERSION_DRAFT(packageId) });
    setVersionError(null);
  };

  const startEditVersion = (v: CatalogPricingVersion) => {
    setVersionDraft({
      input: {
        packageId,
        isActive: v.isActive ?? false,
        effectiveFrom: v.effectiveFrom ?? new Date().toISOString(),
        currencyCode: v.currencyCode ?? 'AFN',
        tierSchedule: v.tierSchedule ?? [],
      },
      id: v.id,
    });
    setVersionError(null);
  };

  const saveVersion = async () => {
    if (!versionDraft || versionDraft.input.tierSchedule.length === 0) return;
    setVersionBusy(true);
    setVersionError(null);
    try {
      await savePricingVersion(versionDraft.input, versionDraft.id);
      setVersionDraft(null);
      await refreshVersions();
    } catch (err) {
      setVersionError(err instanceof Error ? err.message : 'خطا در ذخیره');
    } finally {
      setVersionBusy(false);
    }
  };

  return (
    <main className="page" style={{ maxWidth: 900 }}>
      <div className="lead-hero anim">
        <div className="hero-logo">{pkg.name.charAt(0)}</div>
        <div className="hero-main">
          <h1>{pkg.name}</h1>
          <div className="hero-meta">
            <button
              type="button"
              className="lead-chip"
              style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 12 }}
              onClick={() => pkg.productId && navigate(`/catalog/product/${pkg.productId}`)}
            >
              {T4.back} ←
            </button>
          </div>
        </div>
      </div>

      {editing === null ? (
        <div className="card card-pad anim d1" style={{ marginBottom: 16 }}>
          <div className="contact-rows">
            <div className="c-row">
              <span>{T4.statusLbl}</span>
              <b>{pkg.status ? CATALOG_STATUS_LABELS[pkg.status] ?? pkg.status : '—'}</b>
            </div>
            <div className="c-row">
              <span>{T4.allowsCustomPricingLbl}</span>
              <b>{pkg.allowsCustomPricing ? 'بله' : 'خیر'}</b>
            </div>
            {pkg.notes && (
              <div className="c-row">
                <span>{T4.notesLbl}</span>
                <b>{pkg.notes}</b>
              </div>
            )}
          </div>
          <button className="btn line sm" style={{ marginTop: 12 }} onClick={startEdit}>
            {T4.edit}
          </button>
        </div>
      ) : (
        <div className="card card-pad anim" style={{ marginBottom: 16 }}>
          <h3>{T4.editPackage}</h3>
          <div className="f2" style={{ marginTop: 10 }}>
            <div className="fld">
              <label>{T4.nameLbl}</label>
              <input value={editing.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div className="fld">
              <label>{T4.statusLbl}</label>
              <select value={editing.status ?? 'ACTIVE'} onChange={(e) => set({ status: e.target.value })}>
                {Object.entries(CATALOG_STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="fld">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={editing.allowsCustomPricing ?? false}
                onChange={(e) => set({ allowsCustomPricing: e.target.checked })}
              />
              {T4.allowsCustomPricingLbl}
            </label>
          </div>
          <div className="fld">
            <label>{T4.notesLbl}</label>
            <textarea value={editing.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
          </div>
          {error !== null && <div className="error-banner">{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" disabled={busy || editing.name.trim() === ''} onClick={save}>
              {busy ? '…' : T4.save}
            </button>
            <button className="btn line" onClick={() => setEditing(null)}>
              {T4.cancel}
            </button>
          </div>
        </div>
      )}

      <div className="card anim d2">
        <div className="card-pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>{T4.pricingVersionsSection}</h3>
          <button className="btn soft sm" onClick={startNewVersion}>
            ＋ {T4.newPricingVersion}
          </button>
        </div>

        {versionDraft !== null && (
          <div className="card-pad" style={{ paddingTop: 0 }}>
            {!versionDraft.id && (
              <div className="sub" style={{ marginBottom: 10 }}>
                {T4.deactivatedVersionNote}
              </div>
            )}
            <div className="f2">
              <div className="fld">
                <label>{T4.effectiveFromLbl}</label>
                <JalaliDatePicker
                  value={toLocalInputValue(new Date(versionDraft.input.effectiveFrom ?? Date.now()))}
                  onChange={(v) =>
                    setVersionDraft({
                      ...versionDraft,
                      input: { ...versionDraft.input, effectiveFrom: new Date(v).toISOString() },
                    })
                  }
                />
              </div>
              <div className="fld">
                <label>{T4.currencyCodeLbl}</label>
                <input
                  dir="ltr"
                  value={versionDraft.input.currencyCode ?? 'AFN'}
                  onChange={(e) =>
                    setVersionDraft({ ...versionDraft, input: { ...versionDraft.input, currencyCode: e.target.value } })
                  }
                />
              </div>
            </div>
            <div className="fld">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={versionDraft.input.isActive ?? true}
                  onChange={(e) =>
                    setVersionDraft({ ...versionDraft, input: { ...versionDraft.input, isActive: e.target.checked } })
                  }
                />
                {T4.isActiveLbl}
              </label>
            </div>

            <div className="sub" style={{ margin: '14px 0 8px' }}>
              جدول قیمت
            </div>
            <TierScheduleEditor
              value={versionDraft.input.tierSchedule}
              onChange={(next) =>
                setVersionDraft({ ...versionDraft, input: { ...versionDraft.input, tierSchedule: next } })
              }
            />

            {versionError !== null && <div className="error-banner" style={{ marginTop: 10 }}>{versionError}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn sm" disabled={versionBusy} onClick={saveVersion}>
                {versionBusy ? '…' : T4.save}
              </button>
              <button className="btn line sm" onClick={() => setVersionDraft(null)}>
                {T4.cancel}
              </button>
            </div>
          </div>
        )}

        {versionsError !== null && (
          <div className="card-pad">
            <div className="error-banner">{versionsError}</div>
          </div>
        )}
        {versions === null && versionsError === null && (
          <div className="card-pad">
            <div className="skeleton" style={{ height: 60 }} />
          </div>
        )}
        {versions !== null && versions.length === 0 && versionDraft === null && (
          <div className="empty-state">{T4.noPricingVersions}</div>
        )}
        {versions?.map((v) => (
          <div className="task" key={v.id} style={{ cursor: 'pointer' }} onClick={() => startEditVersion(v)}>
            <div className="t-main" style={{ cursor: 'pointer' }}>
              <div className="t-title">
                {T4.version} {v.versionNumber ?? '—'}
              </div>
              <div className="t-sub">
                <span className={`pill ${v.isActive ? 'ok' : 'cold'}`}>
                  {v.isActive ? T4.activeVersionBadge : 'غیرفعال'}
                </span>
                {v.effectiveFrom && <span className="num">{formatJalaliDate(v.effectiveFrom)}</span>}
                {v.currencyCode && <span dir="ltr">{v.currencyCode}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
};
