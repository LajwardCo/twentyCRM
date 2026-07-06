import { useState } from 'react';

import {
  fetchCompetitors,
  saveCompetitor,
  type Competitor,
} from '../api/admin';
import { useCached } from '../lib/cache';
import { relativeDueLabel } from '../lib/jalali';

const TIER_FA: Record<string, string> = {
  LEADER: 'پیشتاز',
  CHALLENGER: 'رقیب جدی',
  NICHE: 'تخصصی',
  EMERGING: 'نوظهور',
};
const THREAT_FA: Record<string, string> = {
  HIGH: 'تهدید بالا',
  MEDIUM: 'تهدید متوسط',
  LOW: 'تهدید کم',
};
const STATUS_FA: Record<string, string> = {
  ACTIVELY_TRACKING: 'زیر نظر فعال',
  WATCHING: 'در حال مشاهده',
  DORMANT: 'غیرفعال',
};
const threatClass = (t: string | null) =>
  t === 'HIGH' ? 'hot' : t === 'MEDIUM' ? 'warm' : 'cold';

type FormState = Partial<Competitor> & { name: string };

const EMPTY: FormState = { name: '' };

export const CompetitorsView = () => {
  const [editing, setEditing] = useState<FormState | null>(null);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: competitors, error: loadError, refresh } = useCached(
    'competitors',
    fetchCompetitors,
  );

  const startEdit = (c?: Competitor) => {
    setEditing(c ? { ...c } : { ...EMPTY });
    setEditingId(c?.id);
    setError(null);
  };

  const save = async () => {
    if (!editing || editing.name.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      await saveCompetitor(editing, editingId);
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ذخیره');
    } finally {
      setBusy(false);
    }
  };

  const set = (patch: Partial<FormState>) =>
    setEditing((prev) => (prev ? { ...prev, ...patch } : prev));

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>رقبا</h1>
          <div className="sub">دیتابیس تحقیق رقبا — ثبت و به‌روزرسانی</div>
        </div>
        <button className="btn gold" onClick={() => startEdit()}>
          ＋ رقیب جدید
        </button>
      </div>

      {loadError !== null && <div className="error-banner">{loadError}</div>}

      {editing !== null && (
        <div className="card card-pad anim" style={{ marginBottom: 16 }}>
          <h3>{editingId ? 'ویرایش رقیب' : 'رقیب جدید'}</h3>
          <div className="f2" style={{ marginTop: 10 }}>
            <div className="fld">
              <label>نام *</label>
              <input value={editing.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div className="fld">
              <label>ویب‌سایت</label>
              <input
                dir="ltr"
                value={editing.website?.primaryLinkUrl ?? ''}
                onChange={(e) => set({ website: { primaryLinkUrl: e.target.value } })}
              />
            </div>
          </div>
          <div className="f2">
            <div className="fld">
              <label>سطح تهدید</label>
              <select
                value={editing.threatLevel ?? ''}
                onChange={(e) => set({ threatLevel: e.target.value || null })}
              >
                <option value="">—</option>
                {Object.entries(THREAT_FA).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label>رده</label>
              <select
                value={editing.tier ?? ''}
                onChange={(e) => set({ tier: e.target.value || null })}
              >
                <option value="">—</option>
                {Object.entries(TIER_FA).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="fld">
            <label>وضعیت پیگیری</label>
            <select
              value={editing.status ?? ''}
              onChange={(e) => set({ status: e.target.value || null })}
            >
              <option value="">—</option>
              {Object.entries(STATUS_FA).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="f2">
            <div className="fld">
              <label>نقاط قوت</label>
              <textarea
                value={editing.strengths ?? ''}
                onChange={(e) => set({ strengths: e.target.value })}
              />
            </div>
            <div className="fld">
              <label>نقاط ضعف</label>
              <textarea
                value={editing.weaknesses ?? ''}
                onChange={(e) => set({ weaknesses: e.target.value })}
              />
            </div>
          </div>
          <div className="fld">
            <label>توضیحات</label>
            <textarea
              value={editing.description ?? ''}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>
          {error !== null && <div className="error-banner">{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" disabled={busy || editing.name.trim() === ''} onClick={save}>
              {busy ? '…' : 'ذخیره'}
            </button>
            <button className="btn line" onClick={() => setEditing(null)}>
              انصراف
            </button>
          </div>
        </div>
      )}

      {competitors === null && loadError === null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 64 }} />
          ))}
        </div>
      )}

      {competitors !== null && competitors.length === 0 && editing === null && (
        <div className="empty-state">هنوز رقیبی ثبت نشده — اولین را اضافه کنید</div>
      )}

      {competitors?.map((c) => (
        <div className="card card-pad anim" key={c.id} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="deal-logo">{c.name.charAt(0)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 750 }}>
                {c.name}
                {c.website?.primaryLinkUrl && (
                  <a
                    href={c.website.primaryLinkUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="lead-chip"
                    style={{ fontSize: 11.5, marginRight: 8 }}
                    dir="ltr"
                  >
                    {c.website.primaryLinkUrl.replace(/^https?:\/\//, '')}
                  </a>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                {c.threatLevel && (
                  <span className={`pill ${threatClass(c.threatLevel)}`}>
                    {THREAT_FA[c.threatLevel]}
                  </span>
                )}
                {c.tier && <span className="pill stage">{TIER_FA[c.tier]}</span>}
                {c.status && <span className="pill ok">{STATUS_FA[c.status]}</span>}
                <span className="sub num">{relativeDueLabel(c.createdAt)}</span>
              </div>
            </div>
            <button className="btn line sm" onClick={() => startEdit(c)}>
              ویرایش
            </button>
          </div>
          {(c.strengths || c.weaknesses || c.description) && (
            <div className="contact-rows" style={{ marginTop: 10 }}>
              {c.description && (
                <div className="c-row"><span>توضیح</span><b style={{ fontWeight: 500 }}>{c.description}</b></div>
              )}
              {c.strengths && (
                <div className="c-row"><span style={{ color: 'var(--ok)' }}>قوت</span><b style={{ fontWeight: 500 }}>{c.strengths}</b></div>
              )}
              {c.weaknesses && (
                <div className="c-row"><span style={{ color: 'var(--hot)' }}>ضعف</span><b style={{ fontWeight: 500 }}>{c.weaknesses}</b></div>
              )}
            </div>
          )}
        </div>
      ))}
    </main>
  );
};
