import { useState } from 'react';

import { saveCompetitor, type Competitor } from '../api/admin';
import {
  fetchCompetitorById,
  fetchCompetitorProducts,
  fetchCompetitorUpdates,
  fetchCompetitorUsages,
  saveCompetitorProduct,
  saveCompetitorUpdate,
  type CompetitorProduct,
  type CompetitorProductInput,
  type CompetitorUpdateEntry,
  type CompetitorUpdateInput,
} from '../api/competitors';
import { JalaliDatePicker } from '../components/JalaliDatePicker';
import { useCached } from '../lib/cache';
import { formatAfn, toLocalInputValue } from '../lib/format';
import { formatJalaliDate, relativeDueLabel } from '../lib/jalali';
import { navigate } from '../lib/router';
import {
  COMPETITOR_PRICING_MODEL_LABELS,
  COMPETITOR_PRODUCT_CATEGORY_LABELS,
  COMPETITOR_SATISFACTION_LABELS,
  COMPETITOR_STATUS_LABELS,
  COMPETITOR_SWITCHING_SIGNAL_LABELS,
  COMPETITOR_THREAT_LABELS,
  COMPETITOR_TIER_LABELS,
  COMPETITOR_UPDATE_TYPE_LABELS,
  COMPETITOR_USAGE_STATUS_LABELS,
  T4,
  T5,
} from '../lib/strings';

const threatClass = (t: string | null) =>
  t === 'HIGH' ? 'hot' : t === 'MEDIUM' ? 'warm' : 'cold';

const ViewSkeleton = () => (
  <main className="page">
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="skeleton" style={{ height: 56, maxWidth: 420 }} />
      <div className="skeleton" style={{ height: 200 }} />
    </div>
  </main>
);

type CompetitorFormState = Partial<Competitor> & { name: string };

const EMPTY_PRODUCT = (competitorId: string): CompetitorProductInput => ({
  name: '',
  competitorId,
  pricingModel: 'SUBSCRIPTION',
});

const EMPTY_UPDATE = (competitorId: string): CompetitorUpdateInput => ({
  title: '',
  competitorId,
  updateType: 'NEWS',
  date: new Date().toISOString(),
});

export const CompetitorDetailView = ({ competitorId }: { competitorId: string }) => {
  // metadata edit
  const [editing, setEditing] = useState<CompetitorFormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // product add/edit
  const [productDraft, setProductDraft] = useState<{ input: CompetitorProductInput; id?: string } | null>(null);
  const [productBusy, setProductBusy] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);

  // update ("note") add
  const [updateDraft, setUpdateDraft] = useState<CompetitorUpdateInput | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const { data: competitor, error: loadError, refresh } = useCached(
    `competitor:${competitorId}`,
    () => fetchCompetitorById(competitorId),
  );
  const {
    data: products,
    error: productsError,
    refresh: refreshProducts,
  } = useCached(`competitor:products:${competitorId}`, () => fetchCompetitorProducts(competitorId));
  const {
    data: updates,
    error: updatesError,
    refresh: refreshUpdates,
  } = useCached(`competitor:updates:${competitorId}`, () => fetchCompetitorUpdates(competitorId));
  const { data: usages, error: usagesError } = useCached(
    `competitor:usages:${competitorId}`,
    () => fetchCompetitorUsages(competitorId),
  );

  if (competitor === null && loadError === null) return <ViewSkeleton />;
  if (!competitor) {
    return (
      <main className="page">
        <div className="error-banner">{loadError ?? T5.competitorNotFound}</div>
      </main>
    );
  }

  const startEdit = () => {
    setEditing({ ...competitor });
    setError(null);
  };
  const set = (patch: Partial<CompetitorFormState>) =>
    setEditing((prev) => (prev ? { ...prev, ...patch } : prev));

  const save = async () => {
    if (!editing || editing.name.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      await saveCompetitor(editing, competitorId);
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ذخیره');
    } finally {
      setBusy(false);
    }
  };

  // ---- products ----
  const startNewProduct = () => {
    setProductDraft({ input: EMPTY_PRODUCT(competitorId) });
    setProductError(null);
  };
  const startEditProduct = (p: CompetitorProduct) => {
    setProductDraft({
      input: {
        name: p.name,
        competitorId,
        category: p.category,
        description: p.description,
        demoUrl: p.demoUrl?.primaryLinkUrl ?? null,
        pricingModel: p.pricingModel,
        startingPriceAfn: p.startingPrice?.amountMicros ? p.startingPrice.amountMicros / 1_000_000 : null,
        pricingSummary: p.pricingSummary,
        strengths: p.strengths,
        weaknesses: p.weaknesses,
      },
      id: p.id,
    });
    setProductError(null);
  };
  const saveProduct = async () => {
    if (!productDraft || productDraft.input.name.trim() === '') return;
    setProductBusy(true);
    setProductError(null);
    try {
      await saveCompetitorProduct(productDraft.input, productDraft.id);
      setProductDraft(null);
      await refreshProducts();
    } catch (err) {
      setProductError(err instanceof Error ? err.message : 'خطا در ذخیره');
    } finally {
      setProductBusy(false);
    }
  };

  // ---- updates / notes ----
  const startNewUpdate = () => {
    setUpdateDraft(EMPTY_UPDATE(competitorId));
    setUpdateError(null);
  };
  const saveUpdate = async () => {
    if (!updateDraft || updateDraft.title.trim() === '') return;
    setUpdateBusy(true);
    setUpdateError(null);
    try {
      await saveCompetitorUpdate(updateDraft);
      setUpdateDraft(null);
      await refreshUpdates();
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'خطا در ذخیره');
    } finally {
      setUpdateBusy(false);
    }
  };

  return (
    <main className="page" style={{ maxWidth: 900 }}>
      <div className="lead-hero anim">
        <div className="hero-logo">{competitor.name.charAt(0)}</div>
        <div className="hero-main">
          <h1>{competitor.name}</h1>
          <div className="hero-meta">
            {competitor.threatLevel && (
              <span className={`pill ${threatClass(competitor.threatLevel)}`}>
                {COMPETITOR_THREAT_LABELS[competitor.threatLevel]}
              </span>
            )}
            {competitor.tier && <span className="pill stage">{COMPETITOR_TIER_LABELS[competitor.tier]}</span>}
            {competitor.status && <span className="pill ok">{COMPETITOR_STATUS_LABELS[competitor.status]}</span>}
            {competitor.website?.primaryLinkUrl && (
              <a
                href={competitor.website.primaryLinkUrl}
                target="_blank"
                rel="noreferrer"
                className="lead-chip"
                dir="ltr"
              >
                {competitor.website.primaryLinkUrl.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ---------- metadata ---------- */}
      {editing === null ? (
        <div className="card card-pad anim d1" style={{ marginBottom: 16 }}>
          <div className="contact-rows">
            {competitor.description && (
              <div className="c-row"><span>{T5.descriptionLbl}</span><b style={{ fontWeight: 500 }}>{competitor.description}</b></div>
            )}
            {competitor.strengths && (
              <div className="c-row"><span style={{ color: 'var(--ok)' }}>{T5.strengthsLbl}</span><b style={{ fontWeight: 500 }}>{competitor.strengths}</b></div>
            )}
            {competitor.weaknesses && (
              <div className="c-row"><span style={{ color: 'var(--hot)' }}>{T5.weaknessesLbl}</span><b style={{ fontWeight: 500 }}>{competitor.weaknesses}</b></div>
            )}
            <div className="c-row"><span className="sub">{relativeDueLabel(competitor.createdAt)}</span></div>
          </div>
          <button className="btn line sm" style={{ marginTop: 12 }} onClick={startEdit}>
            {T4.edit}
          </button>
        </div>
      ) : (
        <div className="card card-pad anim" style={{ marginBottom: 16 }}>
          <h3>{T5.editCompetitor}</h3>
          <div className="f2" style={{ marginTop: 10 }}>
            <div className="fld">
              <label>{T4.nameLbl}</label>
              <input value={editing.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div className="fld">
              <label>{T5.websiteLbl}</label>
              <input
                dir="ltr"
                value={editing.website?.primaryLinkUrl ?? ''}
                onChange={(e) => set({ website: { primaryLinkUrl: e.target.value } })}
              />
            </div>
          </div>
          <div className="f2">
            <div className="fld">
              <label>{T5.threatLevelLbl}</label>
              <select
                value={editing.threatLevel ?? ''}
                onChange={(e) => set({ threatLevel: e.target.value || null })}
              >
                <option value="">—</option>
                {Object.entries(COMPETITOR_THREAT_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label>{T5.tierLbl}</label>
              <select value={editing.tier ?? ''} onChange={(e) => set({ tier: e.target.value || null })}>
                <option value="">—</option>
                {Object.entries(COMPETITOR_TIER_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="fld">
            <label>{T5.trackingStatusLbl}</label>
            <select value={editing.status ?? ''} onChange={(e) => set({ status: e.target.value || null })}>
              <option value="">—</option>
              {Object.entries(COMPETITOR_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="f2">
            <div className="fld">
              <label>{T5.strengthsLbl}</label>
              <textarea value={editing.strengths ?? ''} onChange={(e) => set({ strengths: e.target.value })} />
            </div>
            <div className="fld">
              <label>{T5.weaknessesLbl}</label>
              <textarea value={editing.weaknesses ?? ''} onChange={(e) => set({ weaknesses: e.target.value })} />
            </div>
          </div>
          <div className="fld">
            <label>{T5.descriptionLbl}</label>
            <textarea value={editing.description ?? ''} onChange={(e) => set({ description: e.target.value })} />
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

      {/* ---------- products & pricing ---------- */}
      <div className="card anim d2" style={{ marginBottom: 16 }}>
        <div className="card-pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>{T5.productsSection}</h3>
          <button className="btn soft sm" onClick={startNewProduct}>
            ＋ {T5.newCompetitorProduct}
          </button>
        </div>

        {productDraft !== null && (
          <div className="card-pad" style={{ paddingTop: 0 }}>
            <div className="f2">
              <div className="fld">
                <label>{T4.nameLbl}</label>
                <input
                  value={productDraft.input.name}
                  onChange={(e) => setProductDraft({ ...productDraft, input: { ...productDraft.input, name: e.target.value } })}
                />
              </div>
              <div className="fld">
                <label>{T5.categoryLbl}</label>
                <select
                  value={productDraft.input.category ?? ''}
                  onChange={(e) => setProductDraft({ ...productDraft, input: { ...productDraft.input, category: e.target.value || null } })}
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
                  value={productDraft.input.pricingModel ?? 'SUBSCRIPTION'}
                  onChange={(e) => setProductDraft({ ...productDraft, input: { ...productDraft.input, pricingModel: e.target.value } })}
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
                  value={productDraft.input.startingPriceAfn ?? ''}
                  onChange={(e) => setProductDraft({ ...productDraft, input: { ...productDraft.input, startingPriceAfn: e.target.value === '' ? null : Number(e.target.value) } })}
                />
              </div>
            </div>
            <div className="fld">
              <label>{T5.pricingSummaryLbl}</label>
              <textarea
                value={productDraft.input.pricingSummary ?? ''}
                onChange={(e) => setProductDraft({ ...productDraft, input: { ...productDraft.input, pricingSummary: e.target.value } })}
              />
            </div>
            <div className="f2">
              <div className="fld">
                <label>{T5.strengthsLbl}</label>
                <textarea
                  value={productDraft.input.strengths ?? ''}
                  onChange={(e) => setProductDraft({ ...productDraft, input: { ...productDraft.input, strengths: e.target.value } })}
                />
              </div>
              <div className="fld">
                <label>{T5.weaknessesLbl}</label>
                <textarea
                  value={productDraft.input.weaknesses ?? ''}
                  onChange={(e) => setProductDraft({ ...productDraft, input: { ...productDraft.input, weaknesses: e.target.value } })}
                />
              </div>
            </div>
            <div className="fld">
              <label>{T5.demoUrlLbl}</label>
              <input
                dir="ltr"
                value={productDraft.input.demoUrl ?? ''}
                onChange={(e) => setProductDraft({ ...productDraft, input: { ...productDraft.input, demoUrl: e.target.value } })}
              />
            </div>
            {productError !== null && <div className="error-banner">{productError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn sm"
                disabled={productBusy || productDraft.input.name.trim() === ''}
                onClick={saveProduct}
              >
                {productBusy ? '…' : T4.save}
              </button>
              <button className="btn line sm" onClick={() => setProductDraft(null)}>
                {T4.cancel}
              </button>
            </div>
          </div>
        )}

        {productsError !== null && (
          <div className="card-pad"><div className="error-banner">{productsError}</div></div>
        )}
        {products === null && productsError === null && (
          <div className="card-pad"><div className="skeleton" style={{ height: 60 }} /></div>
        )}
        {products !== null && products.length === 0 && productDraft === null && (
          <div className="empty-state">{T5.noCompetitorProducts}</div>
        )}
        {products?.map((p) => (
          <div className="task" key={p.id} style={{ cursor: 'pointer' }} onClick={() => startEditProduct(p)}>
            <div className="t-main">
              <div className="t-title">{p.name}</div>
              <div className="t-sub">
                {p.category && <span className="pill stage">{COMPETITOR_PRODUCT_CATEGORY_LABELS[p.category] ?? p.category}</span>}
                {p.pricingModel && <span className="pill">{COMPETITOR_PRICING_MODEL_LABELS[p.pricingModel] ?? p.pricingModel}</span>}
                {p.startingPrice?.amountMicros ? (
                  <span className="sub num">{formatAfn(p.startingPrice.amountMicros)}</span>
                ) : null}
              </div>
              {p.pricingSummary && <div className="sub" style={{ marginTop: 4 }}>{p.pricingSummary}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* ---------- updates / notes ---------- */}
      <div className="card anim d3" style={{ marginBottom: 16 }}>
        <div className="card-pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>{T5.updatesSection}</h3>
          <button className="btn soft sm" onClick={startNewUpdate}>
            ＋ {T5.newCompetitorUpdate}
          </button>
        </div>

        {updateDraft !== null && (
          <div className="card-pad" style={{ paddingTop: 0 }}>
            <div className="f2">
              <div className="fld">
                <label>{T5.titleLbl}</label>
                <input
                  value={updateDraft.title}
                  onChange={(e) => setUpdateDraft({ ...updateDraft, title: e.target.value })}
                />
              </div>
              <div className="fld">
                <label>{T5.updateTypeLbl}</label>
                <select
                  value={updateDraft.updateType ?? 'NEWS'}
                  onChange={(e) => setUpdateDraft({ ...updateDraft, updateType: e.target.value })}
                >
                  {Object.entries(COMPETITOR_UPDATE_TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="fld">
              <label>{T5.dateLbl}</label>
              <JalaliDatePicker
                value={toLocalInputValue(new Date(updateDraft.date ?? Date.now()))}
                onChange={(v) => setUpdateDraft({ ...updateDraft, date: new Date(v).toISOString() })}
              />
            </div>
            <div className="fld">
              <label>{T5.bodyLbl}</label>
              <textarea
                value={updateDraft.body ?? ''}
                onChange={(e) => setUpdateDraft({ ...updateDraft, body: e.target.value })}
              />
            </div>
            <div className="fld">
              <label>{T5.sourceLbl}</label>
              <input
                dir="ltr"
                value={updateDraft.source ?? ''}
                onChange={(e) => setUpdateDraft({ ...updateDraft, source: e.target.value })}
              />
            </div>
            {updateError !== null && <div className="error-banner">{updateError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn sm"
                disabled={updateBusy || updateDraft.title.trim() === ''}
                onClick={saveUpdate}
              >
                {updateBusy ? '…' : T4.save}
              </button>
              <button className="btn line sm" onClick={() => setUpdateDraft(null)}>
                {T4.cancel}
              </button>
            </div>
          </div>
        )}

        {updatesError !== null && (
          <div className="card-pad"><div className="error-banner">{updatesError}</div></div>
        )}
        {updates === null && updatesError === null && (
          <div className="card-pad"><div className="skeleton" style={{ height: 60 }} /></div>
        )}
        {updates !== null && updates.length === 0 && updateDraft === null && (
          <div className="empty-state">{T5.noCompetitorUpdates}</div>
        )}
        {updates?.map((u: CompetitorUpdateEntry) => (
          <div className="task" key={u.id}>
            <div className="t-main">
              <div className="t-title">{u.title}</div>
              <div className="t-sub">
                {u.updateType && <span className="pill">{COMPETITOR_UPDATE_TYPE_LABELS[u.updateType] ?? u.updateType}</span>}
                {u.date && <span className="num">{formatJalaliDate(u.date)}</span>}
                {u.source?.primaryLinkUrl && (
                  <a href={u.source.primaryLinkUrl} target="_blank" rel="noreferrer" dir="ltr">
                    منبع ↗
                  </a>
                )}
              </div>
              {u.body && <div className="sub" style={{ marginTop: 4 }}>{u.body}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* ---------- usage / "users" ---------- */}
      <div className="card anim d4">
        <div className="card-pad">
          <h3>{T5.usageSection}</h3>
        </div>
        {usagesError !== null && (
          <div className="card-pad"><div className="error-banner">{usagesError}</div></div>
        )}
        {usages === null && usagesError === null && (
          <div className="card-pad"><div className="skeleton" style={{ height: 60 }} /></div>
        )}
        {usages !== null && usages.length === 0 && (
          <div className="empty-state">{T5.noCompetitorUsages}</div>
        )}
        {usages?.map((u) => (
          <div className="task" key={u.id}>
            <div className="t-main">
              <div className="t-title">
                {u.person
                  ? `${u.person.name.firstName} ${u.person.name.lastName}`.trim() || '—'
                  : u.opportunity
                    ? u.opportunity.name
                    : (u.name ?? '—')}
              </div>
              <div className="t-sub">
                {u.status && <span className="pill">{COMPETITOR_USAGE_STATUS_LABELS[u.status] ?? u.status}</span>}
                {u.satisfaction && (
                  <span className={`pill ${u.satisfaction === 'HAPPY' ? 'ok' : u.satisfaction === 'UNHAPPY' ? 'hot' : ''}`}>
                    {COMPETITOR_SATISFACTION_LABELS[u.satisfaction] ?? u.satisfaction}
                  </span>
                )}
                {u.switchingSignal && u.switchingSignal !== 'NONE' && (
                  <span className="pill warm">{COMPETITOR_SWITCHING_SIGNAL_LABELS[u.switchingSignal] ?? u.switchingSignal}</span>
                )}
                {u.renewalDate && <span className="num">{formatJalaliDate(u.renewalDate)}</span>}
                {u.opportunity && u.person && (
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
    </main>
  );
};
