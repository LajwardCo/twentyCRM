import { useImperativeHandle, useState, type RefObject } from 'react';

import {
  deleteCompetitorProduct,
  saveCompetitorProduct,
  type CompetitorProduct,
  type CompetitorProductInput,
} from '../../api/competitors';
import { formatMoney } from '../../lib/format';
import { toPersianDigits } from '../../lib/jalali';
import {
  COMPETITOR_PRICING_MODEL_LABELS,
  COMPETITOR_PRODUCT_CATEGORY_LABELS,
  T4,
  T5,
} from '../../lib/strings';

// Lets the mobile action bar open this section's blank form.
export type CompetitorSectionHandle = { openNewDraft: () => void };

type CompetitorProductsSectionProps = {
  competitorId: string;
  products: CompetitorProduct[] | null;
  error: string | null;
  updateCounts: Record<string, number>;
  usageCounts: Record<string, number>;
  onChanged: () => Promise<void>;
  ref?: RefObject<CompetitorSectionHandle | null>;
};

const EMPTY = (competitorId: string): CompetitorProductInput => ({
  name: '',
  competitorId,
  pricingModel: 'SUBSCRIPTION',
});

const toDraft = (p: CompetitorProduct, competitorId: string): CompetitorProductInput => ({
  name: p.name,
  competitorId,
  category: p.category,
  description: p.description,
  demoUrl: p.demoUrl?.primaryLinkUrl ?? null,
  pricingModel: p.pricingModel,
  startingPriceAfn: p.startingPrice?.amountMicros
    ? p.startingPrice.amountMicros / 1_000_000
    : null,
  pricingSummary: p.pricingSummary,
  strengths: p.strengths,
  weaknesses: p.weaknesses,
});

// The competitor's offering: what they sell, at what price, and how each item
// scores against us. Counts on each row link the product to its own notes and
// customer usages so a seller can tell which line is actually in play.
export const CompetitorProductsSection = ({
  competitorId,
  products,
  error,
  updateCounts,
  usageCounts,
  onChanged,
  ref,
}: CompetitorProductsSectionProps) => {
  const [draft, setDraft] = useState<{ input: CompetitorProductInput; id?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const startNewDraft = () => {
    setDraft({ input: EMPTY(competitorId) });
    setFormError(null);
  };

  useImperativeHandle(ref, () => ({ openNewDraft: startNewDraft }));

  const setInput = (patch: Partial<CompetitorProductInput>) =>
    setDraft((prev) => (prev ? { ...prev, input: { ...prev.input, ...patch } } : prev));

  const save = async () => {
    if (!draft || draft.input.name.trim() === '') return;
    setBusy(true);
    setFormError(null);
    try {
      await saveCompetitorProduct(draft.input, draft.id);
      setDraft(null);
      await onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'خطا در ذخیره');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft?.id || !window.confirm(T5.confirmDelete)) return;
    setBusy(true);
    setFormError(null);
    try {
      await deleteCompetitorProduct(draft.id);
      setDraft(null);
      await onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'خطا در حذف');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card anim d2" style={{ marginBottom: 16 }}>
      <div className="card-pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>{T5.productsSection}</h3>
        <button className="btn soft sm" onClick={startNewDraft}>
          ＋ {T5.newCompetitorProduct}
        </button>
      </div>

      {draft !== null && (
        <div className="card-pad" style={{ paddingTop: 0 }}>
          <div className="f2">
            <div className="fld">
              <label>{T4.nameLbl}</label>
              <input value={draft.input.name} onChange={(e) => setInput({ name: e.target.value })} />
            </div>
            <div className="fld">
              <label>{T5.categoryLbl}</label>
              <select
                value={draft.input.category ?? ''}
                onChange={(e) => setInput({ category: e.target.value || null })}
              >
                <option value="">—</option>
                {Object.entries(COMPETITOR_PRODUCT_CATEGORY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="f2">
            <div className="fld">
              <label>{T5.pricingModelLbl}</label>
              <select
                value={draft.input.pricingModel ?? 'SUBSCRIPTION'}
                onChange={(e) => setInput({ pricingModel: e.target.value })}
              >
                {Object.entries(COMPETITOR_PRICING_MODEL_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label>{T5.startingPriceLbl}</label>
              <input
                inputMode="decimal"
                dir="ltr"
                value={draft.input.startingPriceAfn ?? ''}
                onChange={(e) =>
                  setInput({ startingPriceAfn: e.target.value === '' ? null : Number(e.target.value) })
                }
              />
            </div>
          </div>
          <div className="fld">
            <label>{T5.descriptionLbl}</label>
            <textarea
              value={draft.input.description ?? ''}
              onChange={(e) => setInput({ description: e.target.value })}
            />
          </div>
          <div className="fld">
            <label>{T5.pricingSummaryLbl}</label>
            <textarea
              value={draft.input.pricingSummary ?? ''}
              onChange={(e) => setInput({ pricingSummary: e.target.value })}
            />
          </div>
          <div className="f2">
            <div className="fld">
              <label>{T5.strengthsLbl}</label>
              <textarea
                value={draft.input.strengths ?? ''}
                onChange={(e) => setInput({ strengths: e.target.value })}
              />
            </div>
            <div className="fld">
              <label>{T5.weaknessesLbl}</label>
              <textarea
                value={draft.input.weaknesses ?? ''}
                onChange={(e) => setInput({ weaknesses: e.target.value })}
              />
            </div>
          </div>
          <div className="fld">
            <label>{T5.demoUrlLbl}</label>
            <input
              dir="ltr"
              value={draft.input.demoUrl ?? ''}
              onChange={(e) => setInput({ demoUrl: e.target.value })}
            />
          </div>
          {formError !== null && <div className="error-banner">{formError}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn sm" disabled={busy || draft.input.name.trim() === ''} onClick={save}>
              {busy ? '…' : T4.save}
            </button>
            <button className="btn line sm" onClick={() => setDraft(null)}>
              {T4.cancel}
            </button>
            {draft.id && (
              <button
                className="btn line sm"
                style={{ marginInlineStart: 'auto', color: 'var(--hot)' }}
                disabled={busy}
                onClick={remove}
              >
                {T5.deleteAction}
              </button>
            )}
          </div>
        </div>
      )}

      {error !== null && <div className="card-pad"><div className="error-banner">{error}</div></div>}
      {products === null && error === null && (
        <div className="card-pad"><div className="skeleton" style={{ height: 60 }} /></div>
      )}
      {products !== null && products.length === 0 && draft === null && (
        <div className="empty-state">{T5.noCompetitorProducts}</div>
      )}
      {products?.map((p) => (
        <div
          className="task expand"
          key={p.id}
          style={{ cursor: 'pointer' }}
          onClick={() => {
            setDraft({ input: toDraft(p, competitorId), id: p.id });
            setFormError(null);
          }}
        >
          <div className="t-main">
            <div className="t-title">{p.name}</div>
            <div className="t-sub">
              {p.category && (
                <span className="pill stage">
                  {COMPETITOR_PRODUCT_CATEGORY_LABELS[p.category] ?? p.category}
                </span>
              )}
              {p.pricingModel && (
                <span className="pill">
                  {COMPETITOR_PRICING_MODEL_LABELS[p.pricingModel] ?? p.pricingModel}
                </span>
              )}
              {p.startingPrice?.amountMicros ? (
                <span className="num">
                  {formatMoney(p.startingPrice.amountMicros, p.startingPrice.currencyCode)}
                </span>
              ) : null}
              {(updateCounts[p.id] ?? 0) > 0 && (
                <span className="sub">
                  {toPersianDigits(updateCounts[p.id])} {T5.productUpdateCount}
                </span>
              )}
              {(usageCounts[p.id] ?? 0) > 0 && (
                <span className="sub">
                  {toPersianDigits(usageCounts[p.id])} {T5.productUsageCount}
                </span>
              )}
              {p.demoUrl?.primaryLinkUrl && (
                <a
                  href={p.demoUrl.primaryLinkUrl}
                  target="_blank"
                  rel="noreferrer"
                  dir="ltr"
                  onClick={(e) => e.stopPropagation()}
                >
                  {T5.demoLink} ↗
                </a>
              )}
            </div>
            {p.description && <div className="sub" style={{ marginTop: 4 }}>{p.description}</div>}
            {p.pricingSummary && <div className="sub" style={{ marginTop: 4 }}>{p.pricingSummary}</div>}
            {(p.strengths || p.weaknesses) && (
              <div className="contact-rows" style={{ marginTop: 8 }}>
                {p.strengths && (
                  <div className="c-row">
                    <span style={{ color: 'var(--ok)' }}>{T5.strengthsLbl}</span>
                    <b style={{ fontWeight: 500 }}>{p.strengths}</b>
                  </div>
                )}
                {p.weaknesses && (
                  <div className="c-row">
                    <span style={{ color: 'var(--hot)' }}>{T5.weaknessesLbl}</span>
                    <b style={{ fontWeight: 500 }}>{p.weaknesses}</b>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
