import { useImperativeHandle, useState, type RefObject } from 'react';

import {
  deleteCompetitorUpdate,
  saveCompetitorUpdate,
  type CompetitorProduct,
  type CompetitorUpdateEntry,
  type CompetitorUpdateInput,
} from '../../api/competitors';
import { toLocalInputValue } from '../../lib/format';
import { formatJalaliDate } from '../../lib/jalali';
import { COMPETITOR_UPDATE_TYPE_LABELS, T4, T5 } from '../../lib/strings';
import { JalaliDatePicker } from '../JalaliDatePicker';
import { type CompetitorSectionHandle } from './CompetitorProductsSection';

type CompetitorUpdatesSectionProps = {
  competitorId: string;
  updates: CompetitorUpdateEntry[] | null;
  error: string | null;
  products: CompetitorProduct[] | null;
  onChanged: () => Promise<void>;
  ref?: RefObject<CompetitorSectionHandle | null>;
};

const EMPTY = (competitorId: string): CompetitorUpdateInput => ({
  title: '',
  competitorId,
  updateType: 'NEWS',
  date: new Date().toISOString(),
});

const toDraft = (u: CompetitorUpdateEntry, competitorId: string): CompetitorUpdateInput => ({
  title: u.title,
  competitorId,
  updateType: u.updateType,
  date: u.date,
  body: u.body,
  source: u.source?.primaryLinkUrl ?? null,
  productId: u.productId,
});

const typeClass = (type: string | null) =>
  type === 'LOSS' ? 'hot' : type === 'WIN' ? 'ok' : type === 'PRICING_CHANGE' ? 'warm' : '';

// Timeline of what the competitor did and when — news, pricing moves, wins and
// losses. Filterable by type because a pricing review only cares about
// PRICING_CHANGE, while a QBR wants the wins and losses.
export const CompetitorUpdatesSection = ({
  competitorId,
  updates,
  error,
  products,
  onChanged,
  ref,
}: CompetitorUpdatesSectionProps) => {
  const [draft, setDraft] = useState<{ input: CompetitorUpdateInput; id?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const startNewDraft = () => {
    setDraft({ input: EMPTY(competitorId) });
    setFormError(null);
  };

  useImperativeHandle(ref, () => ({ openNewDraft: startNewDraft }));

  const setInput = (patch: Partial<CompetitorUpdateInput>) =>
    setDraft((prev) => (prev ? { ...prev, input: { ...prev.input, ...patch } } : prev));

  const save = async () => {
    if (!draft || draft.input.title.trim() === '') return;
    setBusy(true);
    setFormError(null);
    try {
      await saveCompetitorUpdate(draft.input, draft.id);
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
      await deleteCompetitorUpdate(draft.id);
      setDraft(null);
      await onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'خطا در حذف');
    } finally {
      setBusy(false);
    }
  };

  const productName = (productId: string | null) =>
    products?.find((p) => p.id === productId)?.name ?? null;

  // Only offer filters for types that are actually present.
  const presentTypes = Array.from(
    new Set((updates ?? []).map((u) => u.updateType).filter((t): t is string => t !== null)),
  );
  const visible = (updates ?? []).filter(
    (u) => typeFilter === 'ALL' || u.updateType === typeFilter,
  );

  return (
    <div className="card anim d3" style={{ marginBottom: 16 }}>
      <div className="card-pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3>{T5.updatesSection}</h3>
        <button className="btn soft sm" onClick={startNewDraft}>
          ＋ {T5.newCompetitorUpdate}
        </button>
      </div>

      {presentTypes.length > 1 && (
        <div className="card-pad" style={{ paddingTop: 0 }}>
          <div className="tab-row">
            <button
              className={typeFilter === 'ALL' ? 'on' : ''}
              onClick={() => setTypeFilter('ALL')}
            >
              {T5.allFilter}
            </button>
            {presentTypes.map((t) => (
              <button key={t} className={typeFilter === t ? 'on' : ''} onClick={() => setTypeFilter(t)}>
                {COMPETITOR_UPDATE_TYPE_LABELS[t] ?? t}
              </button>
            ))}
          </div>
        </div>
      )}

      {draft !== null && (
        <div className="card-pad" style={{ paddingTop: 0 }}>
          <div className="f2">
            <div className="fld">
              <label>{T5.titleLbl}</label>
              <input value={draft.input.title} onChange={(e) => setInput({ title: e.target.value })} />
            </div>
            <div className="fld">
              <label>{T5.updateTypeLbl}</label>
              <select
                value={draft.input.updateType ?? 'NEWS'}
                onChange={(e) => setInput({ updateType: e.target.value })}
              >
                {Object.entries(COMPETITOR_UPDATE_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="f2">
            <div className="fld">
              <label>{T5.dateLbl}</label>
              <JalaliDatePicker
                value={toLocalInputValue(new Date(draft.input.date ?? Date.now()))}
                onChange={(v) => setInput({ date: new Date(v).toISOString() })}
              />
            </div>
            <div className="fld">
              <label>{T5.relatedProductLbl}</label>
              <select
                value={draft.input.productId ?? ''}
                onChange={(e) => setInput({ productId: e.target.value || null })}
              >
                <option value="">—</option>
                {products?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="fld">
            <label>{T5.bodyLbl}</label>
            <textarea value={draft.input.body ?? ''} onChange={(e) => setInput({ body: e.target.value })} />
          </div>
          <div className="fld">
            <label>{T5.sourceLbl}</label>
            <input
              dir="ltr"
              value={draft.input.source ?? ''}
              onChange={(e) => setInput({ source: e.target.value })}
            />
          </div>
          {formError !== null && <div className="error-banner">{formError}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn sm" disabled={busy || draft.input.title.trim() === ''} onClick={save}>
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
      {updates === null && error === null && (
        <div className="card-pad"><div className="skeleton" style={{ height: 60 }} /></div>
      )}
      {updates !== null && visible.length === 0 && draft === null && (
        <div className="empty-state">{T5.noCompetitorUpdates}</div>
      )}
      {visible.map((u) => (
        <div
          className="task expand"
          key={u.id}
          style={{ cursor: 'pointer' }}
          onClick={() => {
            setDraft({ input: toDraft(u, competitorId), id: u.id });
            setFormError(null);
          }}
        >
          <div className="t-main">
            <div className="t-title">{u.title}</div>
            <div className="t-sub">
              {u.updateType && (
                <span className={`pill ${typeClass(u.updateType)}`}>
                  {COMPETITOR_UPDATE_TYPE_LABELS[u.updateType] ?? u.updateType}
                </span>
              )}
              {u.date && <span className="num">{formatJalaliDate(u.date)}</span>}
              {productName(u.productId) && (
                <span className="pill stage">{productName(u.productId)}</span>
              )}
              {u.source?.primaryLinkUrl && (
                <a
                  href={u.source.primaryLinkUrl}
                  target="_blank"
                  rel="noreferrer"
                  dir="ltr"
                  onClick={(e) => e.stopPropagation()}
                >
                  {T5.sourceLink} ↗
                </a>
              )}
            </div>
            {u.body && <div className="sub" style={{ marginTop: 4 }}>{u.body}</div>}
          </div>
        </div>
      ))}
    </div>
  );
};
