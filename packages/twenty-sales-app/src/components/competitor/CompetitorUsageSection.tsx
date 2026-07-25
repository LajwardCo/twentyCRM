import { useState } from 'react';

import {
  deleteCompetitorUsage,
  saveCompetitorUsage,
  type CompetitorProduct,
  type CompetitorUsage,
  type CompetitorUsageInput,
} from '../../api/competitors';
import { fetchLeads } from '../../api/records';
import { useCached } from '../../lib/cache';
import { toLocalInputValue } from '../../lib/format';
import { formatJalaliDate } from '../../lib/jalali';
import { navigate } from '../../lib/router';
import {
  COMPETITOR_SATISFACTION_LABELS,
  COMPETITOR_SWITCHING_SIGNAL_LABELS,
  COMPETITOR_USAGE_STATUS_LABELS,
  T4,
  T5,
} from '../../lib/strings';
import { JalaliDatePicker } from '../JalaliDatePicker';

type CompetitorUsageSectionProps = {
  competitorId: string;
  usages: CompetitorUsage[] | null;
  error: string | null;
  products: CompetitorProduct[] | null;
  onChanged: () => Promise<void>;
};

const EMPTY = (competitorId: string): CompetitorUsageInput => ({
  competitorId,
  status: 'CURRENT_USER',
  satisfaction: 'NEUTRAL',
  switchingSignal: 'NONE',
});

const toDraft = (u: CompetitorUsage, competitorId: string): CompetitorUsageInput => ({
  competitorId,
  name: u.name,
  status: u.status,
  satisfaction: u.satisfaction,
  switchingSignal: u.switchingSignal,
  renewalDate: u.renewalDate,
  notes: u.notes,
  productId: u.productId,
  opportunityId: u.opportunityId,
});

const usageTitle = (u: CompetitorUsage): string =>
  u.person
    ? `${u.person.name.firstName} ${u.person.name.lastName}`.trim() || T5.noValue
    : u.name || u.opportunity?.name || T5.noValue;

// Who on our side is on this competitor today, how happy they are, and when
// their renewal lands — the switching signals here are what turns competitor
// research into a pipeline of takeout opportunities.
export const CompetitorUsageSection = ({
  competitorId,
  usages,
  error,
  products,
  onChanged,
}: CompetitorUsageSectionProps) => {
  const [draft, setDraft] = useState<{ input: CompetitorUsageInput; id?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Only loaded once the form opens — the list itself never needs it.
  const { data: leads } = useCached('competitor-usage:leads', () => fetchLeads({ limit: 200 }));

  const setInput = (patch: Partial<CompetitorUsageInput>) =>
    setDraft((prev) => (prev ? { ...prev, input: { ...prev.input, ...patch } } : prev));

  const save = async () => {
    if (!draft) return;
    const { name, opportunityId } = draft.input;
    if (!name?.trim() && !opportunityId) {
      setFormError(T5.usageNeedsIdentity);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await saveCompetitorUsage(draft.input, draft.id);
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
      await deleteCompetitorUsage(draft.id);
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

  return (
    <div className="card anim d4" style={{ marginBottom: 16 }}>
      <div className="card-pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3>{T5.usageSection}</h3>
        <button
          className="btn soft sm"
          onClick={() => {
            setDraft({ input: EMPTY(competitorId) });
            setFormError(null);
          }}
        >
          ＋ {T5.newCompetitorUsage}
        </button>
      </div>

      {draft !== null && (
        <div className="card-pad" style={{ paddingTop: 0 }}>
          <div className="f2">
            <div className="fld">
              <label>{T5.customerNameLbl}</label>
              <input value={draft.input.name ?? ''} onChange={(e) => setInput({ name: e.target.value })} />
            </div>
            <div className="fld">
              <label>{T5.linkedLeadLbl}</label>
              <select
                value={draft.input.opportunityId ?? ''}
                onChange={(e) => setInput({ opportunityId: e.target.value || null })}
              >
                <option value="">—</option>
                {leads?.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="f2">
            <div className="fld">
              <label>{T5.usageStatusLbl}</label>
              <select
                value={draft.input.status ?? ''}
                onChange={(e) => setInput({ status: e.target.value || null })}
              >
                <option value="">—</option>
                {Object.entries(COMPETITOR_USAGE_STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label>{T5.satisfactionLbl}</label>
              <select
                value={draft.input.satisfaction ?? ''}
                onChange={(e) => setInput({ satisfaction: e.target.value || null })}
              >
                <option value="">—</option>
                {Object.entries(COMPETITOR_SATISFACTION_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="f2">
            <div className="fld">
              <label>{T5.switchingSignalLbl}</label>
              <select
                value={draft.input.switchingSignal ?? ''}
                onChange={(e) => setInput({ switchingSignal: e.target.value || null })}
              >
                <option value="">—</option>
                {Object.entries(COMPETITOR_SWITCHING_SIGNAL_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
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
            <label>{T5.renewalDateLbl}</label>
            <JalaliDatePicker
              value={
                draft.input.renewalDate
                  ? toLocalInputValue(new Date(draft.input.renewalDate))
                  : ''
              }
              onChange={(v) => setInput({ renewalDate: v ? new Date(v).toISOString() : null })}
            />
          </div>
          <div className="fld">
            <label>{T5.notesLbl}</label>
            <textarea value={draft.input.notes ?? ''} onChange={(e) => setInput({ notes: e.target.value })} />
          </div>
          {formError !== null && <div className="error-banner">{formError}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn sm" disabled={busy} onClick={save}>
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
      {usages === null && error === null && (
        <div className="card-pad"><div className="skeleton" style={{ height: 60 }} /></div>
      )}
      {usages !== null && usages.length === 0 && draft === null && (
        <div className="empty-state">{T5.noCompetitorUsages}</div>
      )}
      {usages?.map((u) => (
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
            <div className="t-title">{usageTitle(u)}</div>
            <div className="t-sub">
              {u.status && (
                <span className="pill">{COMPETITOR_USAGE_STATUS_LABELS[u.status] ?? u.status}</span>
              )}
              {u.satisfaction && (
                <span className={`pill ${u.satisfaction === 'HAPPY' ? 'ok' : u.satisfaction === 'UNHAPPY' ? 'hot' : ''}`}>
                  {COMPETITOR_SATISFACTION_LABELS[u.satisfaction] ?? u.satisfaction}
                </span>
              )}
              {u.switchingSignal && u.switchingSignal !== 'NONE' && (
                <span className="pill warm">
                  {COMPETITOR_SWITCHING_SIGNAL_LABELS[u.switchingSignal] ?? u.switchingSignal}
                </span>
              )}
              {productName(u.productId) && (
                <span className="pill stage">{productName(u.productId)}</span>
              )}
              {u.renewalDate && (
                <span className="num">
                  {T5.renewalDateLbl}: {formatJalaliDate(u.renewalDate)}
                </span>
              )}
              {u.opportunity && (
                <button
                  type="button"
                  className="lead-chip"
                  style={{ background: 'none', border: 0, cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/lead/${u.opportunity!.id}`);
                  }}
                >
                  {u.opportunity.name} ↗
                </button>
              )}
            </div>
            {u.notes && <div className="sub" style={{ marginTop: 4 }}>{u.notes}</div>}
          </div>
        </div>
      ))}
    </div>
  );
};
