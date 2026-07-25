import { useState } from 'react';

import type { CurrentUser } from '../api/auth';
import {
  assignRole,
  deleteInvitation,
  deleteMember,
  fetchInvitations,
  fetchMembers,
  fetchRoles,
  inviteMember,
  resendInvitation,
  updateMemberName,
  type Member,
} from '../api/admin';
import { invalidateCache, useCached } from '../lib/cache';
import { toPersianDigits } from '../lib/jalali';
import { personName } from '../lib/format';

type AdminViewProps = { user: CurrentUser };

// User & group management: workspace members with their role (group);
// admins invite / edit / delete members and reassign roles inline.
// Server enforces the WORKSPACE_MEMBERS / ROLES permission flags.
export const AdminView = ({ user }: AdminViewProps) => {
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);

  const { data, error, refresh } = useCached('admin:members-roles', async () => {
    const [roles, members, invitations] = await Promise.all([
      fetchRoles(),
      fetchMembers(),
      fetchInvitations(),
    ]);
    return { roles, members, invitations };
  });

  const flash = (message: string, ms = 2200) => {
    setToast(message);
    window.setTimeout(() => setToast(null), ms);
  };

  const reload = async () => {
    invalidateCache('admin:members-roles');
    await refresh();
  };

  const roleOfMember = (memberId: string): string | undefined =>
    data?.roles.find((r) => r.workspaceMembers.some((m) => m.id === memberId))
      ?.id;

  const changeRole = async (memberId: string, roleId: string) => {
    setBusy(memberId);
    try {
      await assignRole(memberId, roleId);
      await reload();
      flash('نقش تغییر کرد ✓');
    } catch (err) {
      flash(`خطا: ${err instanceof Error ? err.message : ''}`, 3500);
    } finally {
      setBusy(null);
    }
  };

  const submitInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    setBusy('invite');
    setInviteLink(null);
    try {
      const { result, errors } = await inviteMember(
        email,
        inviteRole || undefined,
      );
      if (errors.length) {
        flash(`خطا: ${errors[0]}`, 3500);
      } else {
        setInviteLink(result[0]?.link ?? null);
        setInviteEmail('');
        await reload();
        flash('دعوت‌نامه ساخته شد ✓');
      }
    } catch (err) {
      flash(`خطا: ${err instanceof Error ? err.message : ''}`, 3500);
    } finally {
      setBusy(null);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash('لینک کپی شد ✓');
    } catch {
      flash('کپی نشد — لینک را دستی انتخاب کنید', 3500);
    }
  };

  const removeInvite = async (id: string) => {
    setBusy(id);
    try {
      await deleteInvitation(id);
      await reload();
      flash('دعوت‌نامه حذف شد ✓');
    } catch (err) {
      flash(`خطا: ${err instanceof Error ? err.message : ''}`, 3500);
    } finally {
      setBusy(null);
    }
  };

  const resendInvite = async (id: string) => {
    setBusy(id);
    try {
      await resendInvitation(id);
      await reload();
      flash('دوباره ارسال شد ✓');
    } catch (err) {
      flash(`خطا: ${err instanceof Error ? err.message : ''}`, 3500);
    } finally {
      setBusy(null);
    }
  };

  const removeMember = async (m: Member) => {
    if (m.id === user.workspaceMemberId) return;
    if (!window.confirm(`حذف ${personName(m)} از فضای کاری؟`)) return;
    setBusy(m.id);
    try {
      await deleteMember(m.id);
      await reload();
      flash('کاربر حذف شد ✓');
    } catch (err) {
      flash(`خطا: ${err instanceof Error ? err.message : ''}`, 3500);
    } finally {
      setBusy(null);
    }
  };

  const saveName = async (firstName: string, lastName: string) => {
    if (!editing) return;
    setBusy(editing.id);
    try {
      await updateMemberName(editing.id, firstName, lastName);
      setEditing(null);
      await reload();
      flash('نام به‌روزرسانی شد ✓');
    } catch (err) {
      flash(`خطا: ${err instanceof Error ? err.message : ''}`, 3500);
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
              `${toPersianDigits(data.members.length)} کاربر · ${toPersianDigits(
                data.roles.length,
              )} گروه (نقش)`}
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
          {/* Invite member */}
          <div className="card anim d1" style={{ marginBottom: 16 }}>
            <div className="card-pad" style={{ paddingBottom: 6 }}>
              <h3>دعوت کاربر جدید</h3>
              <div className="sub">ایمیل کاربر و نقش او را وارد کنید</div>
            </div>
            <div
              className="card-pad"
              style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
            >
              <input
                className="btn line sm"
                dir="ltr"
                type="email"
                placeholder="email@example.com"
                style={{ flex: 1, minWidth: 180 }}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <select
                className="btn line sm"
                style={{ cursor: 'pointer', minWidth: 150 }}
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                <option value="">بدون نقش…</option>
                {data.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button
                className="btn sm"
                disabled={busy === 'invite' || !inviteEmail.trim()}
                onClick={submitInvite}
              >
                دعوت
              </button>
            </div>
            {inviteLink && (
              <div
                className="card-pad"
                style={{ display: 'flex', gap: 8, alignItems: 'center' }}
              >
                <input
                  className="btn line sm"
                  dir="ltr"
                  readOnly
                  style={{ flex: 1 }}
                  value={inviteLink}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button className="btn line sm" onClick={() => copy(inviteLink)}>
                  کپی لینک
                </button>
              </div>
            )}
          </div>

          {/* Pending invitations */}
          {data.invitations.length > 0 && (
            <div className="card anim d1" style={{ marginBottom: 16 }}>
              <div className="card-pad" style={{ paddingBottom: 6 }}>
                <h3>دعوت‌های در انتظار</h3>
              </div>
              {data.invitations.map((inv) => (
                <div className="task" key={inv.id}>
                  <div className="t-main" style={{ cursor: 'default' }}>
                    <div
                      className="t-title"
                      dir="ltr"
                      style={{ justifyContent: 'flex-end' }}
                    >
                      {inv.email}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {inv.link && (
                      <button
                        className="btn line sm"
                        onClick={() => copy(inv.link!)}
                      >
                        کپی لینک
                      </button>
                    )}
                    <button
                      className="btn line sm"
                      disabled={busy === inv.id}
                      onClick={() => resendInvite(inv.id)}
                    >
                      ارسال مجدد
                    </button>
                    <button
                      className="btn line sm"
                      disabled={busy === inv.id}
                      onClick={() => removeInvite(inv.id)}
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Members */}
          <div className="card anim d1" style={{ marginBottom: 16 }}>
            <div className="card-pad" style={{ paddingBottom: 6 }}>
              <h3>کاربران</h3>
              <div className="sub">گروه هر کاربر را از ستون نقش تغییر دهید</div>
            </div>
            {data.members.map((m) => (
              <div className="task" key={m.id}>
                <span className="avatar av-26">
                  {m.name.firstName.charAt(0)}
                </span>
                <div className="t-main" style={{ cursor: 'default' }}>
                  <div className="t-title">{personName(m)}</div>
                  <div
                    className="t-sub"
                    dir="ltr"
                    style={{ justifyContent: 'flex-end' }}
                  >
                    {m.userEmail ?? ''}
                  </div>
                </div>
                <select
                  className="btn line sm"
                  style={{ cursor: 'pointer', minWidth: 150 }}
                  disabled={busy === m.id || m.id === user.workspaceMemberId}
                  value={roleOfMember(m.id) ?? ''}
                  onChange={(e) =>
                    e.target.value && changeRole(m.id, e.target.value)
                  }
                >
                  <option value="">بدون نقش…</option>
                  {data.roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <button
                  className="btn line sm"
                  disabled={busy === m.id}
                  onClick={() => setEditing(m)}
                >
                  ویرایش
                </button>
                {m.id !== user.workspaceMemberId && (
                  <button
                    className="btn line sm"
                    disabled={busy === m.id}
                    onClick={() => removeMember(m)}
                  >
                    حذف
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Roles */}
          <div className="card anim d2">
            <div className="card-pad" style={{ paddingBottom: 6 }}>
              <h3>گروه‌ها (نقش‌ها)</h3>
              <div className="sub">
                دسترسی‌های دقیق هر گروه از Settings → Roles در خود CRM تنظیم
                می‌شود
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

      {editing && (
        <EditMemberModal
          member={editing}
          busy={busy === editing.id}
          onCancel={() => setEditing(null)}
          onSave={saveName}
        />
      )}

      {toast !== null && <div className="toast">{toast}</div>}
    </main>
  );
};

type EditMemberModalProps = {
  member: Member;
  busy: boolean;
  onCancel: () => void;
  onSave: (firstName: string, lastName: string) => void;
};

const EditMemberModal = ({
  member,
  busy,
  onCancel,
  onSave,
}: EditMemberModalProps) => {
  const [firstName, setFirstName] = useState(member.name.firstName);
  const [lastName, setLastName] = useState(member.name.lastName);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-pad">
          <h3>ویرایش کاربر</h3>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginTop: 10,
            }}
          >
            <input
              className="btn line sm"
              placeholder="نام"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <input
              className="btn line sm"
              placeholder="نام خانوادگی"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 12,
              justifyContent: 'flex-end',
            }}
          >
            <button className="btn line sm" onClick={onCancel}>
              انصراف
            </button>
            <button
              className="btn sm"
              disabled={busy || !firstName.trim()}
              onClick={() => onSave(firstName.trim(), lastName.trim())}
            >
              ذخیره
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
