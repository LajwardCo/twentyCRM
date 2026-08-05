import { useMemo, useState } from 'react';

import {
  fetchCatalogProducts,
  fetchDiscountRules,
  saveCatalogProduct,
  saveDiscountRule,
  type CatalogDiscountRule,
  type CatalogProduct,
  type CatalogProductInput,
  type CatalogDiscountRuleInput,
  type ProductCurrencyCode,
} from '../api/catalog';
import { FilterBar } from '../components/FilterBar';
import { ProductPricingFields } from '../components/ProductPricingFields';
import { ProductTaxonomyFields } from '../components/ProductTaxonomyFields';
import { useCached } from '../lib/cache';
import { applyFilters } from '../lib/filters';
import { formatMoney } from '../lib/format';
import { navigate, useRoute } from '../lib/router';
import { catalogFilterFields } from '../lib/screenFilters';
import { useFilters } from '../lib/useFilters';
import {
  CATALOG_STATUS_LABELS,
  CONDITION_TYPE_LABELS,
  DISCOUNT_TYPE_LABELS,
  PRICING_MODEL_LABELS,
  T4,
} from '../lib/strings';

type Tab = 'products' | 'discountRules';

const EMPTY_PRODUCT: CatalogProductInput = {
  name: '',
  brand: '',
  category: '',
  isSellable: true,
  pricingModel: 'FLAT',
  currencyCode: 'AFN',
  pricingFactors: [],
};

const CURRENCY_SYMBOLS: Record<string, string> = { AFN: '؋', USD: '$' };

const ProductsTab = () => {
  const [editing, setEditing] = useState<CatalogProductInput | null>(null);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: products, error: loadError, refresh } = useCached(
    'catalog:products',
    fetchCatalogProducts,
  );

  const startEdit = (p?: CatalogProduct) => {
    setEditing(
      p
        ? {
            name: p.name,
            brand: p.brand,
            category: p.category,
            currencyCode:
              (p.baseInstallPrice?.currencyCode as ProductCurrencyCode | null) ??
              (p.baseAnnualPrice?.currencyCode as ProductCurrencyCode | null) ??
              'AFN',
            baseInstallPriceAmount: p.baseInstallPrice?.amountMicros
              ? p.baseInstallPrice.amountMicros / 1_000_000
              : null,
            baseAnnualPriceAmount: p.baseAnnualPrice?.amountMicros
              ? p.baseAnnualPrice.amountMicros / 1_000_000
              : null,
            priceBook: p.priceBook,
            maxDiscountPercent: p.maxDiscountPercent,
            pricingModel: p.pricingModel,
            pricingFactors: p.pricingFactors ?? [],
            pricingFactorNotes: p.pricingFactorNotes,
            isSellable: p.isSellable,
          }
        : { ...EMPTY_PRODUCT, pricingFactors: [] },
    );
    setEditingId(p?.id);
    setError(null);
  };

  const set = (patch: Partial<CatalogProductInput>) =>
    setEditing((prev) => (prev ? { ...prev, ...patch } : prev));

  const save = async () => {
    if (!editing || editing.name.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      await saveCatalogProduct(editing, editingId);
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ذخیره');
    } finally {
      setBusy(false);
    }
  };

  // The catalog is small and already fully loaded, so it filters in memory.
  const fields = useMemo(() => catalogFilterFields(products ?? []), [products]);
  const route = useRoute();
  const filters = useFilters('catalog', fields, route.query);
  const visibleProducts = useMemo(
    () => applyFilters(fields, filters.state, products ?? []),
    [fields, filters.state, products],
  );

  return (
    <>
      <div className="page-head anim" style={{ marginTop: 4 }}>
        <div className="sub">{T4.productsTab}</div>
        <button className="btn gold" onClick={() => startEdit()}>
          ＋ {T4.newProduct}
        </button>
      </div>

      {loadError !== null && <div className="error-banner">{loadError}</div>}

      <div className="toolbar anim d1">
        <FilterBar
          fields={fields}
          filters={filters}
          resultCount={visibleProducts.length}
        />
        <div className="grow" />
      </div>

      {editing !== null && (
        <div className="card card-pad anim" style={{ marginBottom: 16 }}>
          <h3>{editingId ? T4.editProduct : T4.newProduct}</h3>
          {/* Currency lives with the prices it denominates, in the pricing
              section below, so a product priced in two currencies isn't set up
              from two places. */}
          <div className="fld" style={{ marginTop: 10 }}>
            <label>{T4.nameLbl}</label>
            <input value={editing.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <ProductTaxonomyFields
            brand={editing.brand}
            category={editing.category}
            onChange={set}
          />
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

      {products === null && loadError === null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 64 }} />
          ))}
        </div>
      )}

      {products !== null && visibleProducts.length === 0 && editing === null && (
        <div className="empty-state">
          {filters.count === 0 ? T4.noProducts : T4.noProductsInCategory}
        </div>
      )}

      {visibleProducts.map((p) => (
        <div
          className="card card-pad anim"
          key={p.id}
          style={{ marginBottom: 10, cursor: 'pointer' }}
          onClick={() => navigate(`/catalog/product/${p.id}`)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="deal-logo">{p.name.charAt(0)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 750 }}>{p.name}</div>
              {p.brand && <div className="sub">{p.brand}</div>}
              <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                {p.category && <span className="pill ok">{p.category}</span>}
                {p.pricingModel && (
                  <span className="pill stage">{PRICING_MODEL_LABELS[p.pricingModel] ?? p.pricingModel}</span>
                )}
                {p.isSellable === false && <span className="pill cold">غیرفعال</span>}
                {p.baseInstallPrice?.amountMicros ? (
                  <span className="sub num">
                    {formatMoney(p.baseInstallPrice.amountMicros, p.baseInstallPrice.currencyCode)}
                  </span>
                ) : null}
              </div>
            </div>
            <button
              className="btn line sm"
              onClick={(e) => {
                e.stopPropagation();
                startEdit(p);
              }}
            >
              {T4.edit}
            </button>
          </div>
        </div>
      ))}
    </>
  );
};

const EMPTY_RULE: CatalogDiscountRuleInput = {
  name: '',
  appliesToProductId: '',
  conditionType: 'ALWAYS',
  discountType: 'PERCENTAGE',
};

const DiscountRulesTab = () => {
  const [editing, setEditing] = useState<CatalogDiscountRuleInput | null>(null);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: rules, error: loadError, refresh } = useCached(
    'catalog:discountRules',
    fetchDiscountRules,
  );
  const { data: products } = useCached('catalog:products', fetchCatalogProducts);

  const startEdit = (r?: CatalogDiscountRule) => {
    setEditing(
      r
        ? {
            name: r.name,
            status: r.status,
            appliesToProductId: r.appliesToProductId ?? '',
            conditionType: r.conditionType ?? 'ALWAYS',
            conditionMinQuantity: r.conditionMinQuantity,
            conditionMetric: r.conditionMetric ?? undefined,
            conditionSiblingProductId: r.conditionSiblingProductId ?? undefined,
            discountType: r.discountType ?? 'PERCENTAGE',
            discountPercentValue: r.discountPercentValue,
            discountFixedAmount: r.discountFixedAmount?.amountMicros
              ? r.discountFixedAmount.amountMicros / 1_000_000
              : null,
            notes: r.notes,
          }
        : { ...EMPTY_RULE },
    );
    setEditingId(r?.id);
    setError(null);
  };

  const set = (patch: Partial<CatalogDiscountRuleInput>) =>
    setEditing((prev) => (prev ? { ...prev, ...patch } : prev));

  // The fixed-amount discount is denominated in the applies-to product's
  // currency, and the metric-condition dropdown draws from that product's
  // defined pricing metrics.
  const selectedProduct = (products ?? []).find(
    (p) => p.id === editing?.appliesToProductId,
  );
  const selectedCurrency =
    (selectedProduct?.baseInstallPrice?.currencyCode as ProductCurrencyCode | null) ?? 'AFN';
  const selectedMetrics = selectedProduct?.pricingFactors ?? [];

  const save = async () => {
    if (!editing || editing.name.trim() === '' || editing.appliesToProductId === '') return;
    setBusy(true);
    setError(null);
    try {
      await saveDiscountRule({ ...editing, currencyCode: selectedCurrency }, editingId);
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ذخیره');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head anim" style={{ marginTop: 4 }}>
        <div className="sub">{T4.discountRulesTab}</div>
        <button className="btn gold" onClick={() => startEdit()}>
          ＋ {T4.newDiscountRule}
        </button>
      </div>

      {loadError !== null && <div className="error-banner">{loadError}</div>}

      {editing !== null && (
        <div className="card card-pad anim" style={{ marginBottom: 16 }}>
          <h3>{editingId ? T4.editDiscountRule : T4.newDiscountRule}</h3>
          <div className="f2" style={{ marginTop: 10 }}>
            <div className="fld">
              <label>{T4.nameLbl}</label>
              <input value={editing.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div className="fld">
              <label>{T4.appliesToProductLbl} *</label>
              <select
                value={editing.appliesToProductId}
                onChange={(e) => set({ appliesToProductId: e.target.value })}
              >
                <option value="">انتخاب…</option>
                {(products ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="f2">
            <div className="fld">
              <label>{T4.conditionTypeLbl}</label>
              <select
                value={editing.conditionType}
                onChange={(e) => set({ conditionType: e.target.value })}
              >
                {Object.entries(CONDITION_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            {editing.conditionType === 'MIN_QUANTITY' && (
              <div className="fld">
                <label>{T4.conditionMinQuantityLbl}</label>
                <input
                  inputMode="numeric"
                  dir="ltr"
                  value={editing.conditionMinQuantity ?? ''}
                  onChange={(e) =>
                    set({
                      conditionMinQuantity: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
            )}
            {editing.conditionType === 'SIBLING_PRODUCT_PURCHASED' && (
              <div className="fld">
                <label>{T4.conditionSiblingProductLbl}</label>
                <select
                  value={editing.conditionSiblingProductId ?? ''}
                  onChange={(e) => set({ conditionSiblingProductId: e.target.value || undefined })}
                >
                  <option value="">انتخاب…</option>
                  {(products ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {editing.conditionType === 'MIN_METRIC_QUANTITY' && (
            <div className="f2">
              <div className="fld">
                <label>{T4.conditionMetricLbl}</label>
                <select
                  value={editing.conditionMetric ?? ''}
                  onChange={(e) => set({ conditionMetric: e.target.value || undefined })}
                  disabled={editing.appliesToProductId === '' || selectedMetrics.length === 0}
                >
                  <option value="">
                    {editing.appliesToProductId === ''
                      ? T4.conditionMetricPickProductFirst
                      : selectedMetrics.length === 0
                        ? T4.conditionMetricProductHasNoMetrics
                        : 'انتخاب…'}
                  </option>
                  {selectedMetrics.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="fld">
                <label>{T4.conditionMinQuantityLbl}</label>
                <input
                  inputMode="numeric"
                  dir="ltr"
                  value={editing.conditionMinQuantity ?? ''}
                  onChange={(e) =>
                    set({
                      conditionMinQuantity: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
          )}

          <div className="f2">
            <div className="fld">
              <label>{T4.discountTypeLbl}</label>
              <select value={editing.discountType} onChange={(e) => set({ discountType: e.target.value })}>
                {Object.entries(DISCOUNT_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            {editing.discountType === 'PERCENTAGE' && (
              <div className="fld">
                <label>{T4.discountPercentValueLbl}</label>
                <input
                  inputMode="numeric"
                  dir="ltr"
                  value={editing.discountPercentValue ?? ''}
                  onChange={(e) =>
                    set({
                      discountPercentValue: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
            )}
            {editing.discountType === 'FIXED_AMOUNT' && (
              <div className="fld">
                <label>
                  {T4.discountFixedAmountLbl} ({CURRENCY_SYMBOLS[selectedCurrency]})
                </label>
                <input
                  inputMode="decimal"
                  dir="ltr"
                  value={editing.discountFixedAmount ?? ''}
                  onChange={(e) =>
                    set({
                      discountFixedAmount: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
            )}
          </div>

          <div className="f2">
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
            <div className="fld">
              <label>{T4.notesLbl}</label>
              <input value={editing.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
            </div>
          </div>

          {error !== null && <div className="error-banner">{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn"
              disabled={busy || editing.name.trim() === '' || editing.appliesToProductId === ''}
              onClick={save}
            >
              {busy ? '…' : T4.save}
            </button>
            <button className="btn line" onClick={() => setEditing(null)}>
              {T4.cancel}
            </button>
          </div>
        </div>
      )}

      {rules === null && loadError === null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1].map((i) => (
            <div key={i} className="skeleton" style={{ height: 64 }} />
          ))}
        </div>
      )}

      {rules !== null && rules.length === 0 && editing === null && (
        <div className="empty-state">{T4.noDiscountRules}</div>
      )}

      {rules?.map((r) => (
        <div className="card card-pad anim" key={r.id} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="deal-logo">{r.name.charAt(0)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 750 }}>{r.name}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                {r.appliesToProduct && <span className="pill stage">{r.appliesToProduct.name}</span>}
                {r.conditionType && (
                  <span className="pill">{CONDITION_TYPE_LABELS[r.conditionType] ?? r.conditionType}</span>
                )}
                {r.discountType === 'PERCENTAGE' && r.discountPercentValue != null && (
                  <span className="pill ok">٪{r.discountPercentValue}</span>
                )}
                {r.discountType === 'FIXED_AMOUNT' && (
                  <span className="pill ok">
                    {formatMoney(r.discountFixedAmount?.amountMicros, r.discountFixedAmount?.currencyCode)}
                  </span>
                )}
                {r.status === 'ARCHIVED' && <span className="pill cold">{CATALOG_STATUS_LABELS.ARCHIVED}</span>}
              </div>
            </div>
            <button className="btn line sm" onClick={() => startEdit(r)}>
              {T4.edit}
            </button>
          </div>
        </div>
      ))}
    </>
  );
};

export const CatalogView = () => {
  const [tab, setTab] = useState<Tab>('products');

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>{T4.catalog}</h1>
          <div className="sub">{T4.catalogSub}</div>
        </div>
      </div>

      <div className="seg">
        <button className={tab === 'products' ? 'on' : ''} onClick={() => setTab('products')}>
          {T4.productsTab}
        </button>
        <button className={tab === 'discountRules' ? 'on' : ''} onClick={() => setTab('discountRules')}>
          {T4.discountRulesTab}
        </button>
      </div>

      {tab === 'products' ? <ProductsTab /> : <DiscountRulesTab />}
    </main>
  );
};
