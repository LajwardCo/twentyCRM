import { useState } from 'react';

import {
  assignRole,
  fetchMembers,
  fetchRoles,
} from '../api/admin';
import { useCached } from '../lib/cache';
import { toPersianDigits } from '../lib/jalali';
import { personName } from '../lib/format';

// User & group management: workspace members with their role (group);
// admins reassign roles inline. Server enforces the PERMISSIONS flag.
export const AdminView = () => {
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, error, refresh } = useCached('admin:members-roles', async () => {
    const [roles, members] = await Promise.all([fetchRoles(), fetchMembers()]);
    return { roles, members };
  });

  const roleOfMember = (memberId: string): string | undefined =>
    data?.roles.find((r) => r.workspaceMembers.some((m) => m.id === memberId))?.id;

  const changeRole = async (memberId: string, roleId: string) => {
    setBusy(memberId);
    try {
      await assignRole(memberId, roleId);
      await refresh();
      setToast('نقش تغییر کرد ✓');
      window.setTimeout(() => setToast(null), 2200);
    } catch (err) {
      setToast(`خطا: ${err instanceof Error ? err.message : ''}`);
      window.setTimeout(() => setToast(null), 3500);
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>مدیریت کاربران</h1>
          <div className="sub">
            {data &&
              `${toPersianDigits(data.members.length)} کاربر · ${toPersianDigits(data.roles.length)} گروه (نقش)`}
          </div>
        </div>
      </div>

      {error !== null && (
        <div className="error-banner">
          دسترسی به مدیریت کاربران ندارید یا خطایی رخ داد: {error}
        </div>
      )}

      {data === null && error === null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 56 }} />
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="card anim d1" style={{ marginBottom: 16 }}>
            <div className="card-pad" style={{ paddingBottom: 6 }}>
              <h3>کاربران</h3>
              <div className="sub">گروه هر کاربر را از ستون نقش تغییر دهید</div>
            </div>
            {data.members.map((m) => (
              <div className="task" key={m.id}>
                <span className="avatar av-26">{m.name.firstName.charAt(0)}</span>
                <div className="t-main" style={{ cursor: 'default' }}>
                  <div className="t-title">{personName(m)}</div>
                  <div className="t-sub" dir="ltr" style={{ justifyContent: 'flex-end' }}>
                    {m.userEmail ?? ''}
                  </div>
                </div>
                <select
                  className="btn line sm"
                  style={{ cursor: 'pointer', minWidth: 170 }}
                  disabled={busy === m.id}
                  value={roleOfMember(m.id) ?? ''}
                  onChange={(e) => e.target.value && changeRole(m.id, e.target.value)}
                >
                  <option value="">بدون نقش…</option>
                  {data.roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="card anim d2">
            <div className="card-pad" style={{ paddingBottom: 6 }}>
              <h3>گروه‌ها (نقش‌ها)</h3>
              <div className="sub">
                تعریف گروه جدید و دسترسی‌های دقیق آن از Settings → Roles در خود CRM انجام می‌شود
              </div>
            </div>
            {data.roles.map((r) => (
              <div className="task" key={r.id}>
                <div className="t-main" style={{ cursor: 'default' }}>
                  <div className="t-title">{r.label}</div>
                </div>
                <span className="pill stage num">
                  {toPersianDigits(r.workspaceMembers.length)} عضو
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {toast !== null && <div className="toast">{toast}</div>}
    </main>
  );
};
