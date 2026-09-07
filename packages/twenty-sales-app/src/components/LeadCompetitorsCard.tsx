import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchCompetitors, type Competitor } from '../api/admin';
import {
  deleteCompetitorUsage,
  fetchCompetitorProducts,
  fetchLeadCompetitorUsages,
  saveCompetitorUsage,
  type CompetitorProduct,
  type CompetitorUsageInput,
  type LeadCompetitorUsage,
} from '../api/competitors';
import { toLocalInputValue } from '../lib/format';
import { formatJalaliDate } from '../lib/jalali';
import { navigate } from '../lib/router';
import {
  COMPETITOR_SATISFACTION_LABELS,
  COMPETITOR_SWITCHING_SIGNAL_LABELS,
  COMPETITOR_THREAT_LABELS,
  COMPETITOR_USAGE_STATUS_LABELS,
  T4,
  T5,
  T6,
  T9,
  T14,
} from '../lib/strings';
import { JalaliDatePicker } from './JalaliDatePicker';

// Which competitors this lead is already a customer of.
//
// Same competitorUsage join the competitor screen writes -- see
// CompetitorUsageSection -- entered from the other end. A seller hears "we run
// <competitor> already" during the visit; if the only place to file that is the
// competitor research screen, it never gets filed. Recording it here also gives
// the lost stage its missing "who took it" answer.
//
// Hides itself on an instance that has not run provision-competitor-intel.mjs.

type Props = {
  leadId: string;
  leadName: string;
};

const emptyDraft = (): CompetitorUsageInput => ({
  competitorId: '',
  status: 'CURRENT_USER',
  satisfaction: 'NEUTRAL',
  switchingSignal: 'NONE',
});

const toDraft = (usage: LeadCompetitorUsage): CompetitorUsageInput => ({
  competitorId: usage.competitorId ?? '',
  name: usage.name,
  status: usage.status,
  satisfaction: usage.satisfaction,
  switchingSignal: usage.switchingSignal,
  renewalDate: usage.renewalDate,
  notes: usage.notes,
  productId: usage.productId,
});

export const LeadCompetitorsCard = ({ leadId, leadName }: Props) => {
  const [usages, setUsages] = useState<LeadCompetitorUsage[]>([]);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<
    { input: CompetitorUsageInput; id?: string } | null
  >(null);

  // Competitor products are only fetched for the competitor actually chosen --
  // loading every competitor's catalogue to fill one dropdown is a request per
  // competitor for a field most rows leave empty.
  const [products, setProducts] = useState<CompetitorProduct[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchLeadCompetitorUsages(leadId);
      if (!result.supported) {
        setSupported(false);
        return;
      }
      setUsages(result.value);
    } catch {
      setError(T14.leadCompetitorLoadFailed);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!supported) return;
    let active = true;
    void fetchCompetitors()
      .then((list) => {
        if (active) setCompetitors(list);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [supported]);

  const selectedCompetitorId = draft?.input.competitorId ?? '';

  useEffect(() => {
    if (selectedCompetitorId === '') {
      setProducts([]);
      return;
    }
    let active = true;
    void fetchCompetitorProducts(selectedCompetitorId)
      .then((list) => {
        if (active) setProducts(list);
      })
      .catch(() => {
        if (active) setProducts([]);
      });
    return () => {
      active = false;
    };
  }, [selectedCompetitorId]);

  // A competitor already on this lead shouldn't be offered again: two rows for
  // one competitor is a duplicate, not a second data point. The row being
  // edited stays selectable so its own competitor isn't missing from its list.
  const selectableCompetitors = useMemo(() => {
    const linked = new Set(
      usages
        .filter((usage) => usage.id !== draft?.id)
        .map((usage) => usage.competitorId)
        .filter((id): id is string => typeof id === 'string'),
    );
    return competitors
      .filter((competitor) => !linked.has(competitor.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  }, [competitors, usages, draft?.id]);

  if (!supported) return null;

  const setInput = (patch: Partial<CompetitorUsageInput>) =>
    setDraft((prev) =>
      prev ? { ...prev, input: { ...prev.input, ...patch } } : prev,
    );

  const openNew = () => {
    setDraft({ input: emptyDraft() });
    setError(null);
  };

  const save = async () => {
    if (!draft || draft.input.competitorId === '') return;
    setBusy(true);
    setError(null);
    try {
      await saveCompetitorUsage(
        {
          ...draft.input,
          // The join carries the lead so it shows on both ends; the free-text
          // name stays as the competitor screen's label for the account.
          opportunityId: leadId,
          name: draft.input.name?.trim() || leadName,
        },
        draft.id,
      );
      setDraft(null);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : T14.leadCompetitorSaveFailed,
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm(T14.confirmRemoveCompetitor)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteCompetitorUsage(id);
      setDraft(null);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : T14.leadCompetitorSaveFailed,
      );
    } finally {
      setBusy(false);
    }
  };

  // The join may be read before the competitor list lands (or on an instance
  // where the relation itself is denied), so both sources are tried.
  const threatLevel = (usage: LeadCompetitorUsage): string | null =>
    usage.competitor?.threatLevel ??
    competitors.find((c) => c.id === usage.competitorId)?.threatLevel ??
    null;

  const competitorName = (usage: LeadCompetitorUsage): string =>
    usage.competitor?.name ??
    competitors.find((c) => c.id === usage.competitorId)?.name ??
    usage.name ??
    T5.noValue;

  return (
    <div className="card card-pad anim d3">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <h3>{T14.leadCompetitorsSection}</h3>
        {draft === null && (
          <button type="button" className="btn soft sm" onClick={openNew}>
            ＋ {T14.addLeadCompetitor}
          </button>
        )}
      </div>
      <div className="sub">{T14.leadCompetitorsHint}</div>

      {error !== null && <div className="err">{error}</div>}

      {loading ? (
        <div className="sub">{T9.loading}</div>
      ) : usages.length === 0 && draft === null ? (
        <div className="empty-state">{T14.noLeadCompetitors}</div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginTop: 8,
          }}
        >
          {usages.map((usage) => (
            <div
              key={usage.id}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                borderTop: '1px solid var(--line)',
                paddingTop: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontWeight: 700 }}>{competitorName(usage)}</div>
                <div className="t-sub">
                  {usage.status && (
                    <span className="pill">
                      {COMPETITOR_USAGE_STATUS_LABELS[usage.status] ??
                        usage.status}
                    </span>
                  )}
                  {usage.satisfaction && (
                    <span
                      className={`pill ${
                        usage.satisfaction === 'HAPPY'
                          ? 'ok'
                          : usage.satisfaction === 'UNHAPPY'
                            ? 'hot'
                            : ''
                      }`}
                    >
                      {COMPETITOR_SATISFACTION_LABELS[usage.satisfaction] ??
                        usage.satisfaction}
                    </span>
                  )}
                  {usage.switchingSignal && usage.switchingSignal !== 'NONE' && (
                    <span className="pill warm">
                      {COMPETITOR_SWITCHING_SIGNAL_LABELS[
                        usage.switchingSignal
                      ] ?? usage.switchingSignal}
                    </span>
                  )}
                  {threatLevel(usage) && (
                    <span className="pill stage">
                      {COMPETITOR_THREAT_LABELS[threatLevel(usage)!] ??
                        threatLevel(usage)}
                    </span>
                  )}
                  {usage.renewalDate && (
                    <span className="num">
                      {T5.renewalDateLbl}: {formatJalaliDate(usage.renewalDate)}
                    </span>
                  )}
                </div>
                {usage.notes && (
                  <div className="sub" style={{ marginTop: 4 }}>
                    {usage.notes}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {usage.competitorId && (
                  <button
                    type="button"
                    className="btn line sm"
                    onClick={() => navigate(`/competitor/${usage.competitorId}`)}
                  >
                    {T14.openCompetitor}
                  </button>
                )}
                <button
                  type="button"
                  className="btn line sm"
                  disabled={busy}
                  onClick={() => {
                    setDraft({ input: toDraft(usage), id: usage.id });
                    setError(null);
                  }}
                >
                  {T6.editAction}
                </button>
                <button
                  type="button"
                  className="btn line sm"
                  style={{ color: 'var(--hot)' }}
                  disabled={busy}
                  onClick={() => void remove(usage.id)}
                >
                  {T5.deleteAction}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {draft !== null && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginTop: 10,
          }}
        >
          <div className="fld">
            <label>{T14.competitorLbl}</label>
            <select
              value={draft.input.competitorId}
              onChange={(e) =>
                setInput({ competitorId: e.target.value, productId: null })
              }
            >
              <option value="">{T14.pickCompetitor}</option>
              {selectableCompetitors.map((competitor) => (
                <option key={competitor.id} value={competitor.id}>
                  {competitor.name}
                </option>
              ))}
            </select>
          </div>

          <div className="f2">
            <div className="fld">
              <label>{T5.usageStatusLbl}</label>
              <select
                value={draft.input.status ?? ''}
                onChange={(e) => setInput({ status: e.target.value || null })}
              >
                <option value="">—</option>
                {Object.entries(COMPETITOR_USAGE_STATUS_LABELS).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="fld">
              <label>{T5.satisfactionLbl}</label>
              <select
                value={draft.input.satisfaction ?? ''}
                onChange={(e) =>
                  setInput({ satisfaction: e.target.value || null })
                }
              >
                <option value="">—</option>
                {Object.entries(COMPETITOR_SATISFACTION_LABELS).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>

          <div className="f2">
            <div className="fld">
              <label>{T5.switchingSignalLbl}</label>
              <select
                value={draft.input.switchingSignal ?? ''}
                onChange={(e) =>
                  setInput({ switchingSignal: e.target.value || null })
                }
              >
                <option value="">—</option>
                {Object.entries(COMPETITOR_SWITCHING_SIGNAL_LABELS).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="fld">
              <label>{T14.competitorProductLbl}</label>
              <select
                value={draft.input.productId ?? ''}
                onChange={(e) => setInput({ productId: e.target.value || null })}
                disabled={products.length === 0}
              >
                <option value="">—</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
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
              onChange={(value) =>
                setInput({
                  renewalDate: value ? new Date(value).toISOString() : null,
                })
              }
            />
          </div>

          <div className="fld">
            <label>{T5.notesLbl}</label>
            <textarea
              value={draft.input.notes ?? ''}
              onChange={(e) => setInput({ notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn sm"
              disabled={busy || draft.input.competitorId === ''}
              onClick={() => void save()}
            >
              {busy ? '…' : T4.save}
            </button>
            <button
              type="button"
              className="btn line sm"
              onClick={() => setDraft(null)}
            >
              {T4.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
