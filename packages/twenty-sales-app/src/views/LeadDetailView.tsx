import { useCallback, useEffect, useState } from 'react';

import { generateText } from '../api/ai';
import { type CurrentUser } from '../api/auth';
import {
  createNoteForLead,
  createTaskForLead,
  fetchLead,
  fetchLeadNotes,
  fetchLeadTasks,
  fetchReferrers,
  setTaskStatus,
  softDeleteLead,
  softDeleteNote,
  softDeleteTask,
  STAGES,
  updateLead,
  type LeadSummary,
  type Note,
  type Referrer,
  type Task,
} from '../api/records';
import { ActionBar, type ActionBarItem } from '../components/ActionBar';
import {
  IconAI,
  IconCheck,
  IconEdit,
  IconMail,
  IconNote,
  IconPhone,
  IconScript,
  IconSms,
  IconSummary,
  IconTrash,
  IconWhatsApp,
} from '../components/icons';
import { DeleteWithReasonDialog } from '../components/DeleteWithReasonDialog';
import { JalaliDatePicker } from '../components/JalaliDatePicker';
import { LeadOffersCard } from '../components/LeadOffersCard';
import { LeadReferrersCard } from '../components/LeadReferrersCard';
import { CompanyCard, MetaCard, PricingCard } from '../components/LeadPanels';
import { MoneyInput } from '../components/MoneyInput';
import { NoteEditModal } from '../components/NoteEditModal';
import { QuickTaskModal } from '../components/QuickTaskModal';
import { WhatsAppModal } from '../components/WhatsAppModal';
import { invalidateCache, useCached } from '../lib/cache';
import {
  type CurrencyCode,
  formatMoney,
  fullPhone,
  personName,
  toLocalInputValue,
} from '../lib/format';
import {
  formatJalaliDate,
  formatJalaliDateTime,
  relativeDueLabel,
  toPersianDigits,
} from '../lib/jalali';
import {
  CALL_SCRIPT_SYSTEM_PROMPT,
  leadContextText,
  SUMMARIZE_SYSTEM_PROMPT,
} from '../lib/leadContext';
import { ageTone, stageAgeDays } from '../lib/leadAge';
import { navigate } from '../lib/router';
import { announceDockablePage, clearDockablePage } from '../lib/workbench';
import {
  SOURCE_LABELS,
  STAGE_LABELS,
  T,
  T2,
  T5,
  T6,
  T7,
  T9,
  TEMP_LABELS,
} from '../lib/strings';

type LeadDetailViewProps = {
  leadId: string;
  user: CurrentUser;
};

type TimelineEntry =
  | { kind: 'task'; at: string; task: Task }
  | { kind: 'note'; at: string; note: Note };

type TimelineFilter = 'all' | 'tasks' | 'notes';

const CallIcon = () => <IconPhone size={16} />;

// Edit / delete for one timeline row. Kept off the row's own click target so
// tapping the row still opens the record.
const RowActions = ({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) => (
  <div className="row-actions" onClick={(e) => e.stopPropagation()}>
    <button type="button" aria-label={T6.editAction} title={T6.editAction} onClick={onEdit}>
      <IconEdit size={13} />
    </button>
    <button
      type="button"
      className="danger"
      aria-label={T5.deleteAction}
      title={T5.deleteAction}
      onClick={onDelete}
    >
      <IconTrash size={13} />
    </button>
  </div>
);

export const LeadDetailView = ({ leadId, user }: LeadDetailViewProps) => {
  const [override, setOverride] = useState<Partial<LeadSummary>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [tlFilter, setTlFilter] = useState<TimelineFilter>('all');
  const [toast, setToast] = useState<string | null>(null);

  const [aiOutput, setAiOutput] = useState<string | null>(null);
  const [aiLabel, setAiLabel] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const [noteDraft, setNoteDraft] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState('');
  const [followUpDate, setFollowUpDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return toLocalInputValue(d);
  });
  const [followUpBusy, setFollowUpBusy] = useState(false);

  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [amountCurrency, setAmountCurrency] = useState<CurrencyCode>('AFN');

  // Quick edit / delete for the lead and for anything on its timeline.
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState<
    | { kind: 'lead' }
    | { kind: 'task'; task: Task }
    | { kind: 'note'; note: Note }
    | null
  >(null);

  useEffect(() => {
    let active = true;
    void fetchReferrers().then((list) => {
      if (active) setReferrers(list);
    });
    return () => {
      active = false;
    };
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  };

  const fetchAll = useCallback(async () => {
    const [lead, tasks, notes] = await Promise.all([
      fetchLead(leadId),
      fetchLeadTasks(leadId),
      fetchLeadNotes(leadId),
    ]);
    return { lead, tasks, notes };
  }, [leadId]);

  const { data, error: loadError, refresh } = useCached(`lead:${leadId}`, fetchAll);

  const lead: LeadSummary | null = data ? { ...data.lead, ...override } : null;
  const tasks = data?.tasks ?? [];
  const notes = data?.notes ?? [];
  const error = actionError ?? loadError;

  const leadName = data?.lead.name;
  useEffect(() => {
    if (leadName) announceDockablePage(leadName, 'lead');
    return clearDockablePage;
  }, [leadName]);

  const reload = useCallback(async () => {
    await refresh();
    setOverride({});
  }, [refresh]);

  const phone = fullPhone(lead?.pointOfContact?.phones ?? null);
  const email = lead?.pointOfContact?.emails?.primaryEmail ?? null;

  const runAi = async (label: string, systemPrompt: string) => {
    if (!lead) return;
    setAiBusy(true);
    setAiLabel(label);
    setAiOutput(null);
    try {
      setAiOutput(
        await generateText(systemPrompt, leadContextText(lead, tasks, notes)),
      );
    } catch (err) {
      setAiOutput(`⚠️ ${err instanceof Error ? err.message : T.loadFailed}`);
    } finally {
      setAiBusy(false);
    }
  };

  const changeStage = async (stage: string) => {
    if (!lead) return;
    setOverride((prev) => ({ ...prev, stage }));
    try {
      await updateLead(lead.id, { stage });
      showToast(`${T.stage}: ${STAGE_LABELS[stage] ?? stage} ✓`);
    } catch {
      void reload();
    }
  };

  const changeTemperature = async (temperature: string | null) => {
    if (!lead) return;
    setOverride((prev) => ({ ...prev, temperature }));
    try {
      await updateLead(lead.id, { temperature });
    } catch {
      void reload();
    }
  };

  // Generic lead-field save for the click-to-edit meta rows. The server
  // enforces access; on any outcome we reload so the UI reflects the truth
  // (and a rejected edit simply reverts).
  const saveLeadField = async (patch: Record<string, unknown>) => {
    if (!lead) return;
    try {
      await updateLead(lead.id, patch);
      showToast('ذخیره شد ✓');
    } finally {
      await reload();
    }
  };

  const startEditAmount = () => {
    setAmountInput(
      lead?.amount?.amountMicros
        ? String(lead.amount.amountMicros / 1_000_000)
        : '',
    );
    setAmountCurrency((lead?.amount?.currencyCode as CurrencyCode) || 'AFN');
    setEditingAmount(true);
  };

  const saveAmount = async () => {
    const parsed = Number(
      amountInput
        .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
        .replace(/[,\s]/g, ''),
    );
    const patch =
      Number.isFinite(parsed) && parsed > 0
        ? {
            amount: {
              amountMicros: Math.round(parsed * 1_000_000),
              currencyCode: amountCurrency,
            },
          }
        : { amount: null };
    setEditingAmount(false);
    await saveLeadField(patch);
  };

  const addNote = async () => {
    if (!lead || noteDraft.trim() === '') return;
    setNoteBusy(true);
    try {
      await createNoteForLead({
        title: noteDraft.trim().slice(0, 60),
        bodyMarkdown: noteDraft.trim(),
        target: { opportunityId: lead.id, companyId: lead.company?.id },
      });
      setNoteDraft('');
      showToast('یادداشت ذخیره شد ✓');
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : T.loadFailed);
    } finally {
      setNoteBusy(false);
    }
  };

  const addFollowUp = async () => {
    if (!lead || followUpDraft.trim() === '') return;
    setFollowUpBusy(true);
    try {
      await createTaskForLead({
        title: followUpDraft.trim(),
        status: 'TODO',
        dueAt: new Date(followUpDate).toISOString(),
        assigneeId: user.workspaceMemberId,
        target: { opportunityId: lead.id, companyId: lead.company?.id },
      });
      setFollowUpDraft('');
      showToast('پیگیری ثبت شد ✓');
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : T.loadFailed);
    } finally {
      setFollowUpBusy(false);
    }
  };

  // Soft delete only: the record leaves the pipeline but stays in the CRM's
  // trash, and the reason is filed on it first.
  const confirmDelete = async (reason: string) => {
    if (!deleting || !lead) return;

    if (deleting.kind === 'lead') {
      await softDeleteLead({ id: lead.id, companyId: lead.company?.id }, reason);
      invalidateCache('leads:');
      invalidateCache('today:');
      invalidateCache('reports:');
      invalidateCache(`lead:${lead.id}`);
      setDeleting(null);
      // Straight to the list rather than back: the previous page may well be a
      // task belonging to the lead that no longer exists.
      navigate('/leads');
      return;
    }

    if (deleting.kind === 'task') {
      await softDeleteTask(deleting.task.id, reason);
      invalidateCache('today:');
    } else {
      await softDeleteNote(deleting.note.id, reason);
    }
    setDeleting(null);
    showToast(deleting.kind === 'task' ? T6.taskDeleted : T6.noteDeleted);
    await reload();
  };

  const deleteTargetLabel = (): string => {
    if (!deleting) return '';
    if (deleting.kind === 'lead') return lead?.name ?? '';
    return deleting.kind === 'task' ? deleting.task.title : deleting.note.title;
  };

  const deleteTitle = (): string => {
    if (!deleting) return '';
    if (deleting.kind === 'lead') return T6.deleteLeadTitle;
    return deleting.kind === 'task' ? T6.deleteTaskTitle : T6.deleteNoteTitle;
  };

  const timeline: TimelineEntry[] = [
    ...tasks.map(
      (task): TimelineEntry => ({ kind: 'task', at: task.dueAt ?? task.createdAt, task }),
    ),
    ...notes.map((note): TimelineEntry => ({ kind: 'note', at: note.createdAt, note })),
  ]
    .filter((entry) =>
      tlFilter === 'all'
        ? true
        : tlFilter === 'tasks'
          ? entry.kind === 'task'
          : entry.kind === 'note',
    )
    .sort((a, b) => b.at.localeCompare(a.at));

  const openTasks = tasks.filter((t) => t.status !== 'DONE');

  const stageIndex = STAGES.findIndex((s) => s.value === lead?.stage);

  if (lead === null) {
    return (
      <main className="page">
        {error !== null ? (
          <div className="error-banner">{error}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="skeleton" style={{ height: 60, maxWidth: 420 }} />
            <div className="skeleton" style={{ height: 90 }} />
            <div className="skeleton" style={{ height: 300 }} />
          </div>
        )}
      </main>
    );
  }

  const leadAgeDays = Math.max(
    1,
    Math.round((Date.now() - new Date(lead.createdAt).getTime()) / 86400000),
  );

  const stageAge = stageAgeDays(lead.stageChangedAt, lead.createdAt);
  const stageTone = ageTone(stageAge);

  const barActions: ActionBarItem[] = [
    {
      key: 'call',
      label: T.call,
      icon: IconPhone,
      disabled: !phone,
      onClick: () => phone && (window.location.href = `tel:${phone}`),
    },
    {
      key: 'whatsapp',
      label: T.whatsapp,
      icon: IconWhatsApp,
      disabled: !lead.pointOfContact,
      onClick: () => setShowWhatsApp(true),
    },
    {
      key: 'sms',
      label: T.sms,
      icon: IconSms,
      disabled: !phone,
      onClick: () => phone && (window.location.href = `sms:${phone}`),
    },
    {
      key: 'email',
      label: T.emailAction,
      icon: IconMail,
      disabled: !email,
      onClick: () => email && (window.location.href = `mailto:${email}`),
    },
    {
      // short label: five slots on a 360px screen leave ~60px each
      key: 'ai',
      label: 'دستیار',
      icon: IconAI,
      primary: true,
      onClick: () => navigate(`/lead/${lead.id}/chat`),
    },
  ];

  return (
    <main className="page">
      {/* hero */}
      <div className="lead-hero anim">
        <div className="hero-logo">{lead.name.charAt(0)}</div>
        <div className="hero-main">
          <h1>{lead.name}</h1>
          <div className="hero-meta">
            <select
              value={lead.temperature ?? ''}
              onChange={(e) => changeTemperature(e.target.value || null)}
              className={`pill ${lead.temperature?.toLowerCase() ?? ''}`}
              style={{ border: 0, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <option value="">{T.temperature}…</option>
              <option value="HOT">{TEMP_LABELS.HOT}</option>
              <option value="WARM">{TEMP_LABELS.WARM}</option>
              <option value="COLD">{TEMP_LABELS.COLD}</option>
            </select>
            {(lead.amount?.amountMicros ?? 0) > 0 && (
              <span>
                ارزش:{' '}
                <b className="num" style={{ color: 'var(--ink)' }}>
                  {formatMoney(lead.amount?.amountMicros, lead.amount?.currencyCode)}
                </b>
              </span>
            )}
            <span>
              {T.owner}: {personName(lead.owner)}
            </span>
            <span>ثبت: {formatJalaliDate(lead.createdAt)}</span>
          </div>
        </div>
        <div className="hero-actions">
          <select
            className="btn line sm"
            value={lead.stage ?? ''}
            onChange={(e) => changeStage(e.target.value)}
            style={{ cursor: 'pointer' }}
          >
            {STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {STAGE_LABELS[s.value] ?? s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error !== null && <div className="error-banner">{error}</div>}

      {/* journey */}
      <div className="card journey anim d1">
        <div className="journey-top">
          <h3>مسیر فروش</h3>
          <span className="sub num">
            {stageIndex >= 0 && stageIndex < 9
              ? `${toPersianDigits(stageIndex + 1)} از ${toPersianDigits(9)} مرحله`
              : ''}
          </span>
        </div>
        <div className="journey-track">
          {STAGES.slice(0, 9).map((s, i) => (
            <div
              key={s.value}
              className={`j-step ${i < stageIndex ? 'done' : ''} ${i === stageIndex ? 'now' : ''}`}
              onClick={() => changeStage(s.value)}
              title={STAGE_LABELS[s.value]}
            >
              <div className="j-dot" />
              <div className="j-lbl">{STAGE_LABELS[s.value] ?? s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="detail-grid">
        <div className="stack">
          {/* open tasks under this lead */}
          {openTasks.length > 0 && (
            <div className="card anim d1">
              <div className="card-pad" style={{ paddingBottom: 6 }}>
                <h3>
                  {T2.openTasks}{' '}
                  <span className="num" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>
                    ({toPersianDigits(openTasks.length)})
                  </span>
                </h3>
              </div>
              {openTasks.map((task) => (
                <div className="task" key={task.id}>
                  <button
                    className="chk"
                    aria-label={T.markDone}
                    onClick={async () => {
                      await setTaskStatus(task.id, 'DONE');
                      showToast('انجام شد ✓');
                      await reload();
                    }}
                  >
                    <IconCheck size={13} />
                  </button>
                  {/* Opens the task's own page — the body is truncated here. */}
                  <div className="t-main" onClick={() => navigate(`/task/${task.id}`)}>
                    <div className="t-title">{task.title}</div>
                    {task.bodyV2?.markdown && (
                      <div className="t-sub">{task.bodyV2.markdown}</div>
                    )}
                  </div>
                  <span
                    className={`due ${
                      task.dueAt && new Date(task.dueAt) < new Date() ? 'over' : 'later'
                    }`}
                  >
                    {relativeDueLabel(task.dueAt)}
                  </span>
                  <RowActions
                    onEdit={() => setEditingTask(task)}
                    onDelete={() => setDeleting({ kind: 'task', task })}
                  />
                </div>
              ))}
            </div>
          )}

          {/* timeline */}
          <div className="card anim d2">
            <div
              className="card-pad"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: 8,
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <h3>{T.history}</h3>
              <div className="tab-row">
                <button className={tlFilter === 'all' ? 'on' : ''} onClick={() => setTlFilter('all')}>
                  همه
                </button>
                <button
                  className={tlFilter === 'tasks' ? 'on' : ''}
                  onClick={() => setTlFilter('tasks')}
                >
                  وظایف
                </button>
                <button
                  className={tlFilter === 'notes' ? 'on' : ''}
                  onClick={() => setTlFilter('notes')}
                >
                  یادداشت‌ها
                </button>
              </div>
            </div>
            {timeline.length === 0 && <div className="empty-state">{T.noActivity}</div>}
            {timeline.map((entry) =>
              entry.kind === 'task' ? (
                <div className="tl-item" key={`t-${entry.task.id}`}>
                  <div className={`tl-ico ${entry.task.status === 'DONE' ? 'call' : 'todo'}`}>
                    <CallIcon />
                  </div>
                  <div
                    className="tl-body tl-open"
                    onClick={() => navigate(`/task/${entry.task.id}`)}
                  >
                    <div className="tl-t">
                      {entry.task.title}{' '}
                      <span className={`pill ${entry.task.status === 'DONE' ? 'ok' : 'warm'}`}>
                        {entry.task.status === 'DONE' ? T.done : T.todo}
                      </span>
                    </div>
                    {entry.task.bodyV2?.markdown && (
                      <div className="tl-note">{entry.task.bodyV2.markdown}</div>
                    )}
                    <div className="tl-meta" onClick={(e) => e.stopPropagation()}>
                      {formatJalaliDateTime(entry.at)}
                      {entry.task.status !== 'DONE' && (
                        <button
                          className="btn line sm"
                          style={{ padding: '1.5px 10px', fontSize: 11 }}
                          onClick={async () => {
                            await setTaskStatus(entry.task.id, 'DONE');
                            showToast('انجام شد ✓');
                            await reload();
                          }}
                        >
                          ✓ {T.markDone}
                        </button>
                      )}
                    </div>
                  </div>
                  <RowActions
                    onEdit={() => setEditingTask(entry.task)}
                    onDelete={() => setDeleting({ kind: 'task', task: entry.task })}
                  />
                </div>
              ) : (
                <div className="tl-item" key={`n-${entry.note.id}`}>
                  <div className="tl-ico note">
                    <IconNote size={16} />
                  </div>
                  <div
                    className="tl-body tl-open"
                    onClick={() => navigate(`/note/${entry.note.id}`)}
                  >
                    <div className="tl-t">{entry.note.title || T.note}</div>
                    <div className="tl-note">
                      {entry.note.bodyV2?.markdown ?? entry.note.title}
                    </div>
                    <div className="tl-meta">{formatJalaliDateTime(entry.at)}</div>
                  </div>
                  <RowActions
                    onEdit={() => setEditingNote(entry.note)}
                    onDelete={() => setDeleting({ kind: 'note', note: entry.note })}
                  />
                </div>
              ),
            )}
          </div>

          {/* quick add */}
          <div className="card card-pad anim d3">
            <h3>ثبت سریع</h3>
            <div className="fld" style={{ marginTop: 10 }}>
              <textarea
                placeholder={T.notePlaceholder}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button
                className="btn soft sm"
                disabled={noteBusy || noteDraft.trim() === ''}
                onClick={addNote}
              >
                {noteBusy ? T.saving : T.saveNote}
              </button>
            </div>
            <div className="f2">
              <div className="fld" style={{ marginBottom: 8 }}>
                <label>{T.followUpWhat}</label>
                <input
                  placeholder={T.followUpPlaceholder}
                  value={followUpDraft}
                  onChange={(e) => setFollowUpDraft(e.target.value)}
                />
              </div>
              <div className="fld" style={{ marginBottom: 8 }}>
                <label>{T.when}</label>
                <JalaliDatePicker value={followUpDate} onChange={setFollowUpDate} />
              </div>
            </div>
            <button
              className="btn line sm"
              disabled={followUpBusy || followUpDraft.trim() === ''}
              onClick={addFollowUp}
            >
              {followUpBusy ? T.saving : `＋ ${T.addFollowUp}`}
            </button>
          </div>
        </div>

        <div className="stack">
          {/* contact */}
          <div className="card card-pad anim d2">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>{T.contactPerson}</h3>
              {lead.pointOfContact && (
                <span className="avatar av-26">
                  {lead.pointOfContact.name.firstName.charAt(0)}
                </span>
              )}
            </div>
            <div className="contact-rows">
              <div className="c-row">
                <span>{T.firstName}</span>
                <b>{personName(lead.pointOfContact)}</b>
              </div>
              <div className="c-row">
                <span>{T.phone}</span>
                <b className="num" dir="ltr">
                  {phone ?? '—'}
                </b>
              </div>
              {email && (
                <div className="c-row">
                  <span>{T.email}</span>
                  <b dir="ltr" style={{ fontSize: 12 }}>
                    {email}
                  </b>
                </div>
              )}
              <div className="c-row">
                <span>{T.leadSource}</span>
                <b>{SOURCE_LABELS[lead.leadSource ?? ''] ?? '—'}</b>
              </div>
            </div>
            <div className="actions-grid abar-dup" style={{ marginTop: 14 }}>
              <button
                className="a-btn"
                disabled={!phone}
                onClick={() => phone && (window.location.href = `tel:${phone}`)}
              >
                <IconPhone size={19} />
                {T.call}
              </button>
              <button
                className="a-btn"
                disabled={!phone}
                onClick={() => phone && (window.location.href = `sms:${phone}`)}
              >
                <IconSms size={19} />
                {T.sms}
              </button>
              <button
                className="a-btn"
                disabled={!lead.pointOfContact}
                onClick={() => setShowWhatsApp(true)}
              >
                <IconWhatsApp size={19} />
                {T.whatsapp}
              </button>
              <button
                className="a-btn"
                disabled={!email}
                onClick={() => email && (window.location.href = `mailto:${email}`)}
              >
                <IconMail size={19} />
                {T.emailAction}
              </button>
            </div>
          </div>

          {/* AI */}
          <div className="card card-pad ai-card anim d3">
            <h3>
              <IconAI size={18} />
              {T.aiSection}
            </h3>
            <div className="sub">تحلیل این لید با هوش مصنوعی</div>
            <div className="ai-actions">
              <button className="btn" disabled={aiBusy} onClick={() => runAi(T.summarize, SUMMARIZE_SYSTEM_PROMPT)}>
                <IconSummary size={15} />
                {T.summarize}
              </button>
              <button
                className="btn"
                disabled={aiBusy}
                onClick={() => runAi(T.callScript, CALL_SCRIPT_SYSTEM_PROMPT)}
              >
                <IconScript size={15} />
                {T.callScript}
              </button>
              <button className="btn gold" onClick={() => navigate(`/lead/${lead.id}/chat`)}>
                {T.askAi}
              </button>
            </div>
            {aiBusy && (
              <div className="ai-output">
                <span className="sub">
                  {aiLabel} — {T.thinking}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  <div className="skeleton" style={{ height: 12 }} />
                  <div className="skeleton" style={{ height: 12, width: '85%' }} />
                  <div className="skeleton" style={{ height: 12, width: '70%' }} />
                </div>
              </div>
            )}
            {!aiBusy && aiOutput !== null && (
              <div className="ai-output">
                {aiOutput}
                <div style={{ marginTop: 10 }}>
                  <button
                    className="btn line sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(aiOutput);
                      showToast(T.copied);
                    }}
                  >
                    {T.copy}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* deal info */}
          {/* Negotiation history. Hides itself on an instance that hasn't run
              provision-subscriptions-referrals-offers.mjs. */}
          <LeadOffersCard
            leadId={leadId}
            currentUserId={user.workspaceMemberId}
            onAgreed={() => void reload()}
          />

          {/* Additional referrers, each with the share negotiated for this
              deal. Also hides itself when unprovisioned. */}
          <LeadReferrersCard
            leadId={leadId}
            primaryReferrer={lead.referrer}
            partners={referrers}
          />

          <div className="card card-pad anim d4">
            <h3>معلومات لید</h3>
            <div className="contact-rows">
              <div className="c-row">
                <span>ارزش تخمینی</span>
                {editingAmount ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    <MoneyInput
                      amount={amountInput}
                      onAmountChange={setAmountInput}
                      currency={amountCurrency}
                      onCurrencyChange={setAmountCurrency}
                      placeholder="مثلاً 300000"
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn line sm" onClick={() => setEditingAmount(false)}>
                        {T.close}
                      </button>
                      <button className="btn gold sm" onClick={saveAmount}>
                        ذخیره
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="meta-editable" onClick={startEditAmount}>
                    <b className="num">
                      {formatMoney(lead.amount?.amountMicros, lead.amount?.currencyCode)}
                    </b>
                    <IconEdit size={12} />
                  </button>
                )}
              </div>
              {/* Only once a price has actually been settled -- an empty row
                  here would read as "agreed on nothing". */}
              {lead.agreedPrice?.amountMicros != null && (
                <div className="c-row">
                  <span>{T7.agreedPriceLbl}</span>
                  <b className="num">
                    {formatMoney(
                      lead.agreedPrice.amountMicros,
                      lead.agreedPrice.currencyCode,
                    )}
                  </b>
                </div>
              )}
              <div className="c-row">
                <span>{T.stage}</span>
                <b>{STAGE_LABELS[lead.stage ?? ''] ?? '—'}</b>
              </div>
              <div className="c-row">
                <span>عمر لید</span>
                <b className="num">{toPersianDigits(leadAgeDays)} روز</b>
              </div>
              {/* Age in the CURRENT stage -- the number that identifies a
                  stalling lead. Falls back to createdAt on leads that predate
                  stageChangedAt, so it can over-state but never under-state. */}
              {stageAge !== null && (
                <div className="c-row">
                  <span>{T9.stageAgeLbl}</span>
                  <b
                    className="num"
                    style={{
                      color:
                        stageTone === 'stale'
                          ? 'var(--danger)'
                          : stageTone === 'warn'
                            ? 'var(--warn)'
                            : undefined,
                    }}
                  >
                    {toPersianDigits(stageAge)} روز
                  </b>
                </div>
              )}
              <div className="c-row">
                <span>فعالیت‌ها</span>
                <b className="num">
                  {toPersianDigits(tasks.length)} {T.task} · {toPersianDigits(notes.length)}{' '}
                  {T.note}
                </b>
              </div>
            </div>
            <button
              className="btn line sm danger"
              style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}
              onClick={() => setDeleting({ kind: 'lead' })}
            >
              <IconTrash size={14} />
              {T6.deleteLeadTitle}
            </button>
          </div>

          {/* pricing: deal products + quotations */}
          <PricingCard lead={lead} />

          {/* company info + other contacts */}
          {lead.company && <CompanyCard companyId={lead.company.id} />}

          {/* metadata: source, referrer, marketer, created-by */}
          <MetaCard
            lead={lead}
            referrers={referrers}
            editable
            onSaveLead={saveLeadField}
          />
        </div>
      </div>

      {showWhatsApp && lead.pointOfContact && (
        <WhatsAppModal
          personId={lead.pointOfContact.id}
          opportunityId={lead.id}
          onClose={() => setShowWhatsApp(false)}
        />
      )}

      {editingTask !== null && (
        <QuickTaskModal
          mode="edit"
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSaved={async () => {
            setEditingTask(null);
            showToast('ذخیره شد ✓');
            await reload();
          }}
        />
      )}

      {editingNote !== null && (
        <NoteEditModal
          note={editingNote}
          onClose={() => setEditingNote(null)}
          onSaved={async () => {
            setEditingNote(null);
            showToast('ذخیره شد ✓');
            await reload();
          }}
        />
      )}

      {deleting !== null && (
        <DeleteWithReasonDialog
          title={deleteTitle()}
          recordLabel={deleteTargetLabel()}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}

      {toast !== null && <div className="toast">{toast}</div>}

      <ActionBar items={barActions} />
    </main>
  );
};
