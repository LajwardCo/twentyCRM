import { useCallback, useEffect, useRef, useState } from 'react';

import { generateText } from '../api/ai';
import {
  fetchTaskAttachments,
  uploadTaskAttachment,
  type TaskAttachment,
} from '../api/attachments';
import { fetchMembers, type Member } from '../api/admin';
import { type CurrentUser } from '../api/auth';
import {
  createNoteForLead,
  createTaskForLead,
  fetchLead,
  fetchLeadNotes,
  fetchLeadTasks,
  fetchTask,
  STAGES,
  updateLead,
  updateTask,
  type TaskType,
} from '../api/records';
import { JalaliDatePicker } from '../components/JalaliDatePicker';
import {
  IconAI,
  IconCheck,
  IconLeads,
  IconMapPin,
  IconMic,
  IconPhone,
  IconPresentation,
  IconWhatsApp,
} from '../components/icons';
import { invalidateCache, useCached } from '../lib/cache';
import { formatMoney, fullPhone, personName, toLocalInputValue } from '../lib/format';
import { formatJalaliDateTime, relativeDueLabel } from '../lib/jalali';
import { leadContextText, SUMMARIZE_SYSTEM_PROMPT } from '../lib/leadContext';
import { navigate } from '../lib/router';
import {
  SOURCE_LABELS,
  STAGE_LABELS,
  T,
  TASK_TYPE_LABELS,
  TEMP_LABELS,
} from '../lib/strings';

type TaskViewProps = {
  taskId: string;
  user: CurrentUser;
};

export const TASK_TYPE_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  CALL: IconPhone,
  MEETING: IconLeads,
  DEMO: IconPresentation,
  VISIT: IconMapPin,
  OTHER: IconCheck,
};

const FOLLOW_UP_PRESETS = [
  { key: 'tomorrow', label: 'فردا صبح', days: 1 },
  { key: 'threeDays', label: '۳ روز بعد', days: 3 },
  { key: 'nextWeek', label: 'هفته بعد', days: 7 },
] as const;

const presetIso = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
};

export const TaskView = ({ taskId, user }: TaskViewProps) => {
  const fetchAll = useCallback(async () => {
    const task = await fetchTask(taskId);
    const target = task.taskTargets?.edges.find((e) => e.node.opportunity)?.node;
    const opportunityId = target?.opportunity?.id ?? null;
    const [lead, leadTasks, leadNotes, attachments] = await Promise.all([
      opportunityId ? fetchLead(opportunityId) : Promise.resolve(null),
      opportunityId ? fetchLeadTasks(opportunityId) : Promise.resolve([]),
      opportunityId ? fetchLeadNotes(opportunityId) : Promise.resolve([]),
      fetchTaskAttachments(taskId),
    ]);
    return { task, lead, leadTasks, leadNotes, attachments };
  }, [taskId]);

  const { data, error, refresh } = useCached(`task:${taskId}`, fetchAll);

  const task = data?.task ?? null;
  const lead = data?.lead ?? null;

  // during-task notes, autosaved into the task body
  const [notes, setNotes] = useState<string | null>(null);
  const [notesSaved, setNotesSaved] = useState(true);
  const saveTimer = useRef<number>(0);

  const notesValue = notes ?? task?.bodyV2?.markdown ?? '';

  const onNotesChange = (value: string) => {
    setNotes(value);
    setNotesSaved(false);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        await updateTask(taskId, { bodyV2: { markdown: value } });
        setNotesSaved(true);
      } catch {
        // retried on next keystroke
      }
    }, 900);
  };

  // after-task state
  const [result, setResult] = useState('');
  const [newStage, setNewStage] = useState<string>('');
  const [followUpType, setFollowUpType] = useState<TaskType>('CALL');
  const [followUpWhat, setFollowUpWhat] = useState('');
  const [followUpPreset, setFollowUpPreset] = useState<string>('tomorrow');
  const [followUpCustom, setFollowUpCustom] = useState(
    toLocalInputValue(new Date(presetIso(1))),
  );
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [aiBrief, setAiBrief] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  // Admins can reassign the task owner; load the member list for the picker.
  const [members, setMembers] = useState<Member[]>([]);
  const [reassigning, setReassigning] = useState(false);

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  useEffect(() => {
    if (!user.isAdmin) return;
    let active = true;
    void fetchMembers()
      .then((list) => {
        if (active) setMembers(list);
      })
      .catch(() => {
        // no permission / unavailable — leave picker empty
      });
    return () => {
      active = false;
    };
  }, [user.isAdmin]);

  const reassign = async (assigneeId: string) => {
    if (!task) return;
    setReassigning(true);
    try {
      await updateTask(task.id, { assigneeId: assigneeId || null });
      await refresh();
      showToast('مسئول وظیفه تغییر کرد ✓');
    } catch {
      showToast(T.loadFailed);
    } finally {
      setReassigning(false);
    }
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  };

  const phone = fullPhone(lead?.pointOfContact?.phones ?? null);

  const runBrief = async () => {
    if (!lead || !data) return;
    setAiBusy(true);
    try {
      setAiBrief(
        await generateText(
          SUMMARIZE_SYSTEM_PROMPT,
          leadContextText(lead, data.leadTasks, data.leadNotes),
        ),
      );
    } catch (err) {
      setAiBrief(`⚠️ ${err instanceof Error ? err.message : T.loadFailed}`);
    } finally {
      setAiBusy(false);
    }
  };

  const onUpload = async (file: File | undefined) => {
    if (!file || !task) return;
    setUploading(true);
    setAttachError(null);
    try {
      await uploadTaskAttachment({
        file,
        taskId: task.id,
        opportunityId: lead?.id ?? null,
      });
      showToast('فایل آپلود شد ✓');
      await refresh();
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : 'آپلود ناموفق بود');
    } finally {
      setUploading(false);
    }
  };

  const finishTask = async () => {
    if (!task) return;
    setFinishing('در حال ثبت نتیجه…');
    try {
      // 1. final task body: live notes + result section
      const finalBody = [
        notesValue.trim(),
        result.trim() !== '' ? `## نتیجه\n${result.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      await updateTask(task.id, {
        status: 'DONE',
        ...(finalBody ? { bodyV2: { markdown: finalBody } } : {}),
      });

      // 2. the same text becomes a lead note (task notes ARE the lead notes)
      if (lead && finalBody) {
        setFinishing('ثبت یادداشت لید…');
        await createNoteForLead({
          title: `${TASK_TYPE_LABELS[task.taskType ?? 'OTHER']} — ${lead.name}`.slice(0, 60),
          bodyMarkdown: finalBody,
          target: { opportunityId: lead.id, companyId: lead.company?.id },
        });
      }

      // 3. stage change
      if (lead && newStage && newStage !== lead.stage) {
        setFinishing('تغییر مرحله…');
        await updateLead(lead.id, { stage: newStage });
      }

      // 4. follow-up task
      if (lead && followUpWhat.trim() !== '') {
        setFinishing('ثبت پیگیری بعدی…');
        const preset = FOLLOW_UP_PRESETS.find((p) => p.key === followUpPreset);
        await createTaskForLead({
          title: followUpWhat.trim(),
          status: 'TODO',
          taskType: followUpType,
          dueAt: preset
            ? presetIso(preset.days)
            : new Date(followUpCustom).toISOString(),
          assigneeId: user.workspaceMemberId,
          target: { opportunityId: lead.id, companyId: lead.company?.id },
        });
      }

      invalidateCache('today:');
      invalidateCache(`task:${taskId}`);
      if (lead) invalidateCache(`lead:${lead.id}`);
      showToast('وظیفه تکمیل شد ✓');
      window.setTimeout(
        () => navigate(lead ? `/lead/${lead.id}` : '/today'),
        700,
      );
    } catch (err) {
      setFinishing(null);
      setAttachError(err instanceof Error ? err.message : T.loadFailed);
    }
  };

  if (task === null) {
    return (
      <main className="page">
        {error !== null ? (
          <div className="error-banner">{error}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="skeleton" style={{ height: 60, maxWidth: 420 }} />
            <div className="skeleton" style={{ height: 260 }} />
          </div>
        )}
      </main>
    );
  }

  const TypeIcon = TASK_TYPE_ICONS[task.taskType ?? 'OTHER'] ?? IconCheck;
  const isDone = task.status === 'DONE';
  const lastActivities = (data?.leadTasks ?? [])
    .filter((t) => t.id !== task.id && t.bodyV2?.markdown)
    .slice(0, 2);
  const lastNote = (data?.leadNotes ?? [])[0] ?? null;

  return (
    <main className="page">
      {/* hero */}
      <div className="lead-hero anim">
        <div className="hero-logo" style={{ background: 'linear-gradient(140deg, var(--lapis-500), var(--lapis-900))' }}>
          <TypeIcon size={24} />
        </div>
        <div className="hero-main">
          <h1>{task.title}</h1>
          <div className="hero-meta">
            <span className="pill stage">
              {TASK_TYPE_LABELS[task.taskType ?? 'OTHER']}
            </span>
            {isDone ? (
              <span className="pill ok">{T.done}</span>
            ) : (
              <span className={`due ${task.dueAt && new Date(task.dueAt) < new Date() ? 'over' : 'today'}`}>
                موعد: {relativeDueLabel(task.dueAt)}
              </span>
            )}
            {lead && (
              <button
                className="lead-chip"
                style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 12.5 }}
                onClick={() => navigate(`/lead/${lead.id}`)}
              >
                {lead.name} ←
              </button>
            )}
            {user.isAdmin ? (
              <label className="assignee-pick">
                مسئول:
                <select
                  value={task.assignee?.id ?? ''}
                  disabled={reassigning}
                  onChange={(e) => reassign(e.target.value)}
                >
                  <option value="">بدون مسئول</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name.firstName} {m.name.lastName}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              task.assignee && (
                <span className="pill">
                  مسئول: {task.assignee.name.firstName} {task.assignee.name.lastName}
                </span>
              )
            )}
          </div>
        </div>
      </div>

      {error !== null && <div className="error-banner">{error}</div>}

      <div className="detail-grid">
        {/* ======== main: during + after ======== */}
        <div className="stack">
          <div className="card card-pad anim d1">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>۲ · حین وظیفه — یادداشت‌ها</h3>
              <span className="sub">{notesSaved ? 'ذخیره شد ✓' : 'در حال ذخیره…'}</span>
            </div>
            <div className="sub" style={{ marginBottom: 10 }}>
              هر چه می‌شنوید همین‌جا بنویسید — در پایان، به یادداشت‌های لید هم اضافه می‌شود.
            </div>
            <div className="fld" style={{ marginBottom: 0 }}>
              <textarea
                style={{ minHeight: 140 }}
                placeholder="یادداشت‌های جریان تماس / جلسه…"
                value={notesValue}
                onChange={(e) => onNotesChange(e.target.value)}
                disabled={isDone}
              />
            </div>
          </div>

          <div className="card card-pad anim d2">
            <h3>۳ · بعد از وظیفه — نتیجه و قدم بعدی</h3>
            <div className="fld" style={{ marginTop: 10 }}>
              <label>نتیجه چه شد؟</label>
              <textarea
                placeholder="مثلاً: دمو تأیید شد برای پنجشنبه ساعت ۱۰، مسئول مالی هم حاضر می‌شود…"
                value={result}
                onChange={(e) => setResult(e.target.value)}
                disabled={isDone}
              />
            </div>

            {/* recording upload */}
            <div className="fld">
              <label>فایل ثبت تماس / سند (اختیاری)</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <label className="btn line sm" style={{ cursor: 'pointer' }}>
                  <IconMic size={15} />
                  {uploading ? 'در حال آپلود…' : 'آپلود فایل'}
                  <input
                    type="file"
                    style={{ display: 'none' }}
                    onChange={(e) => onUpload(e.target.files?.[0])}
                    disabled={uploading}
                  />
                </label>
                {(data?.attachments ?? []).map((a: TaskAttachment) => (
                  <span key={a.id} className="pill stage" title={formatJalaliDateTime(a.createdAt)}>
                    🎙 {a.name ?? a.file?.[0]?.label ?? 'فایل'}
                  </span>
                ))}
              </div>
              {attachError !== null && (
                <div className="error-banner" style={{ marginTop: 8 }}>{attachError}</div>
              )}
            </div>

            {!isDone && (
              <>
                <div className="f2" style={{ marginTop: 4 }}>
                  <div className="fld">
                    <label>مرحله جدید لید (در صورت تغییر)</label>
                    <select value={newStage} onChange={(e) => setNewStage(e.target.value)}>
                      <option value="">بدون تغییر — {STAGE_LABELS[lead?.stage ?? ''] ?? '—'}</option>
                      {STAGES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {STAGE_LABELS[s.value] ?? s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="fld">
                    <label>نوع پیگیری بعدی</label>
                    <div className="temp-seg">
                      {(['CALL', 'MEETING', 'DEMO', 'VISIT'] as TaskType[]).map((tt) => (
                        <button
                          key={tt}
                          type="button"
                          className={followUpType === tt ? 't-cold on' : ''}
                          onClick={() => setFollowUpType(tt)}
                          style={{ fontSize: 12 }}
                        >
                          {TASK_TYPE_LABELS[tt]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="f2">
                  <div className="fld">
                    <label>پیگیری بعدی چه باشد؟ (خالی = بدون پیگیری)</label>
                    <input
                      placeholder="مثلاً: تماس یادآوری قبل از دمو"
                      value={followUpWhat}
                      onChange={(e) => setFollowUpWhat(e.target.value)}
                    />
                  </div>
                  <div className="fld">
                    <label>چه وقت؟</label>
                    <div className="quick-chips">
                      {FOLLOW_UP_PRESETS.map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          className={followUpPreset === p.key ? 'on' : ''}
                          onClick={() => setFollowUpPreset(p.key)}
                        >
                          {p.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={followUpPreset === 'custom' ? 'on' : ''}
                        onClick={() => setFollowUpPreset('custom')}
                      >
                        زمان دلخواه
                      </button>
                    </div>
                    {followUpPreset === 'custom' && (
                      <div style={{ marginTop: 8 }}>
                        <JalaliDatePicker
                          value={followUpCustom}
                          onChange={setFollowUpCustom}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <button
                  className="btn gold block"
                  style={{ padding: 12, marginTop: 6 }}
                  disabled={finishing !== null}
                  onClick={finishTask}
                >
                  {finishing ?? 'پایان وظیفه ✓'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* ======== side: before (preparation) ======== */}
        <div className="stack">
          <div className="card card-pad anim d1">
            <h3>۱ · قبل از وظیفه — آمادگی</h3>
            {lead === null ? (
              <div className="sub" style={{ marginTop: 8 }}>{T.noLead}</div>
            ) : (
              <>
                <div className="contact-rows">
                  <div className="c-row">
                    <span>{T.company}</span>
                    <b>{lead.name}</b>
                  </div>
                  <div className="c-row">
                    <span>{T.contactPerson}</span>
                    <b>{personName(lead.pointOfContact)}</b>
                  </div>
                  <div className="c-row">
                    <span>{T.phone}</span>
                    <b className="num" dir="ltr">{phone ?? '—'}</b>
                  </div>
                  <div className="c-row">
                    <span>{T.stage}</span>
                    <b>{STAGE_LABELS[lead.stage ?? ''] ?? '—'}</b>
                  </div>
                  <div className="c-row">
                    <span>{T.temperature}</span>
                    <b>{lead.temperature ? TEMP_LABELS[lead.temperature] : '—'}</b>
                  </div>
                  {(lead.amount?.amountMicros ?? 0) > 0 && (
                    <div className="c-row">
                      <span>ارزش</span>
                      <b className="num">{formatMoney(lead.amount?.amountMicros, lead.amount?.currencyCode)}</b>
                    </div>
                  )}
                  <div className="c-row">
                    <span>{T.leadSource}</span>
                    <b>{SOURCE_LABELS[lead.leadSource ?? ''] ?? '—'}</b>
                  </div>
                </div>
                <div className="actions-grid" style={{ marginTop: 12, gridTemplateColumns: 'repeat(2, 1fr)' }}>
                  <button
                    className="a-btn"
                    disabled={!phone}
                    onClick={() => phone && (window.location.href = `tel:${phone}`)}
                  >
                    <IconPhone size={18} />
                    {T.call}
                  </button>
                  <button
                    className="a-btn"
                    disabled={!phone}
                    onClick={() =>
                      phone && window.open(`https://wa.me/${phone.replace('+', '')}`, '_blank')
                    }
                  >
                    <IconWhatsApp size={18} />
                    {T.whatsapp}
                  </button>
                </div>
              </>
            )}
          </div>

          {(lastActivities.length > 0 || lastNote) && (
            <div className="card card-pad anim d2">
              <h3>آخرین تماس‌ها و یادداشت‌ها</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                {lastActivities.map((t) => (
                  <div key={t.id}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{t.title}</div>
                    <div className="sub" style={{ whiteSpace: 'pre-wrap' }}>
                      {(t.bodyV2?.markdown ?? '').slice(0, 180)}
                      {(t.bodyV2?.markdown ?? '').length > 180 ? '…' : ''}
                    </div>
                  </div>
                ))}
                {lastNote?.bodyV2?.markdown && (
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>📝 {T.note}</div>
                    <div className="sub" style={{ whiteSpace: 'pre-wrap' }}>
                      {lastNote.bodyV2.markdown.slice(0, 180)}
                      {lastNote.bodyV2.markdown.length > 180 ? '…' : ''}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {lead && (
            <div className="card card-pad ai-card anim d3">
              <h3>
                <IconAI size={18} />
                خلاصه هوشمند قبل از {TASK_TYPE_LABELS[task.taskType ?? 'OTHER']}
              </h3>
              <div className="sub">همه تاریخچه لید در چند خط</div>
              <div className="ai-actions">
                <button className="btn gold" disabled={aiBusy} onClick={runBrief}>
                  {aiBusy ? T.thinking : 'آماده‌ام کن ✨'}
                </button>
              </div>
              {aiBrief !== null && <div className="ai-output">{aiBrief}</div>}
            </div>
          )}
        </div>
      </div>

      {toast !== null && <div className="toast">{toast}</div>}
    </main>
  );
};
