import { useImperativeHandle, useState, type RefObject } from 'react';

import { saveCompetitor, type Competitor } from '../../api/admin';
import { formatMoney } from '../../lib/format';
import { formatJalaliDate } from '../../lib/jalali';
import {
  COMPETITOR_STATUS_LABELS,
  COMPETITOR_THREAT_LABELS,
  COMPETITOR_TIER_LABELS,
  T4,
  T5,
} from '../../lib/strings';

type CompetitorFormState = Partial<Competitor> & { name: string };

// Lets the mobile action bar open the edit form that lives in here.
export type CompetitorOverviewHandle = { openEdit: () => void };

type CompetitorOverviewCardProps = {
  competitor: Competitor;
  priceRange: { minMicros: number; maxMicros: number; currencyCode: string } | null;
  lastUpdateIso: string | null;
  onSaved: () => Promise<void>;
  ref?: RefObject<CompetitorOverviewHandle | null>;
};

const Row = ({
  label,
  value,
  labelColor,
}: {
  label: string;
  value: string;
  labelColor?: string;
}) => (
  <div className="c-row">
    <span style={labelColor ? { color: labelColor } : undefined}>{label}</span>
    <b style={{ fontWeight: 500 }}>{value}</b>
  </div>
);

// Everything stored on the competitor record itself, plus the two figures the
// nested sections derive (price range, latest note) so the top of the page
// answers "who are they and where do they stand" without scrolling.
export const CompetitorOverviewCard = ({
  competitor,
  priceRange,
  lastUpdateIso,
  onSaved,
  ref,
}: CompetitorOverviewCardProps) => {
  const [editing, setEditing] = useState<CompetitorFormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setEditing({ ...competitor });
    setError(null);
  };

  useImperativeHandle(ref, () => ({ openEdit: startEdit }));

  const set = (patch: Partial<CompetitorFormState>) =>
    setEditing((prev) => (prev ? { ...prev, ...patch } : prev));

  const save = async () => {
    if (!editing || editing.name.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      await saveCompetitor(editing, competitor.id);
      setEditing(null);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ذخیره');
    } finally {
      setBusy(false);
    }
  };

  if (editing !== null) {
    return (
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
    );
  }

  return (
    <div className="card card-pad anim d1" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>{T5.overviewSection}</h3>
        <button className="btn line sm" onClick={startEdit}>
          {T4.edit}
        </button>
      </div>
      <div className="contact-rows" style={{ marginTop: 10 }}>
        <Row label={T5.descriptionLbl} value={competitor.description || T5.noValue} />
        <Row
          label={T5.strengthsLbl}
          value={competitor.strengths || T5.noValue}
          labelColor="var(--ok)"
        />
        <Row
          label={T5.weaknessesLbl}
          value={competitor.weaknesses || T5.noValue}
          labelColor="var(--hot)"
        />
        <Row
          label={T5.priceRangeLbl}
          value={
            priceRange
              ? priceRange.minMicros === priceRange.maxMicros
                ? formatMoney(priceRange.minMicros, priceRange.currencyCode)
                : `${formatMoney(priceRange.minMicros, priceRange.currencyCode)} – ${formatMoney(priceRange.maxMicros, priceRange.currencyCode)}`
              : T5.noValue
          }
        />
        <Row
          label={T5.lastUpdateLbl}
          value={lastUpdateIso ? formatJalaliDate(lastUpdateIso) : T5.noValue}
        />
        <Row label={T5.registeredOnLbl} value={formatJalaliDate(competitor.createdAt)} />
      </div>
    </div>
  );
};
