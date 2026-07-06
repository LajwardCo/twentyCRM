import { useCallback, useEffect, useState } from 'react';

import { generateText } from '../api/ai';
import { type CurrentUser } from '../api/auth';
import {
  createNoteForLead,
  createTaskForLead,
  fetchLead,
  fetchLeadNotes,
  fetchLeadTasks,
  setTaskStatus,
  STAGES,
  updateLead,
  type LeadSummary,
  type Note,
  type Task,
} from '../api/records';
import {
  IconAI,
  IconMail,
  IconNote,
  IconPhone,
  IconScript,
  IconSms,
  IconSummary,
  IconWhatsApp,
} from '../components/icons';
import { WhatsAppModal } from '../components/WhatsAppModal';
import { formatAfn, fullPhone, personName, toLocalInputValue } from '../lib/format';
import { formatJalaliDate, formatJalaliDateTime, toPersianDigits } from '../lib/jalali';
import {
  CALL_SCRIPT_SYSTEM_PROMPT,
  leadContextText,
  SUMMARIZE_SYSTEM_PROMPT,
} from '../lib/leadContext';
import { navigate } from '../lib/router';
import { SOURCE_LABELS, STAGE_LABELS, T, TEMP_LABELS } from '../lib/strings';

type LeadDetailViewProps = {
  leadId: string;
  user: CurrentUser;
};

type TimelineEntry =
  | { kind: 'task'; at: string; task: Task }
  | { kind: 'note'; at: string; note: Note };

type TimelineFilter = 'all' | 'tasks' | 'notes';

const CallIcon = () => <IconPhone size={16} />;

export const LeadDetailView = ({ leadId, user }: LeadDetailViewProps) => {
  const [lead, setLead] = useState<LeadSummary | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [error, setError] = useState<string | null>(null);
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

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  };

  const reload = useCallback(async () => {
    try {
      const [leadData, taskData, noteData] = await Promise.all([
        fetchLead(leadId),
        fetchLeadTasks(leadId),
        fetchLeadNotes(leadId),
      ]);
      setLead(leadData);
      setTasks(taskData);
      setNotes(noteData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : T.loadFailed);
    }
  }, [leadId]);

  useEffect(() => {
    void reload();
  }, [reload]);

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
    setLead({ ...lead, stage });
    try {
      await updateLead(lead.id, { stage });
      showToast(`${T.stage}: ${STAGE_LABELS[stage] ?? stage} ✓`);
    } catch {
      void reload();
    }
  };

  const changeTemperature = async (temperature: string | null) => {
    if (!lead) return;
    setLead({ ...lead, temperature });
    try {
      await updateLead(lead.id, { temperature });
    } catch {
      void reload();
    }
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
      setError(err instanceof Error ? err.message : T.loadFailed);
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
      setError(err instanceof Error ? err.message : T.loadFailed);
    } finally {
      setFollowUpBusy(false);
    }
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
                  {formatAfn(lead.amount?.amountMicros)}
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
                  <div className="tl-body">
                    <div className="tl-t">
                      {entry.task.title}{' '}
                      <span className={`pill ${entry.task.status === 'DONE' ? 'ok' : 'warm'}`}>
                        {entry.task.status === 'DONE' ? T.done : T.todo}
                      </span>
                    </div>
                    {entry.task.bodyV2?.markdown && (
                      <div className="tl-note">{entry.task.bodyV2.markdown}</div>
                    )}
                    <div className="tl-meta">
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
                </div>
              ) : (
                <div className="tl-item" key={`n-${entry.note.id}`}>
                  <div className="tl-ico note">
                    <IconNote size={16} />
                  </div>
                  <div className="tl-body">
                    <div className="tl-t">{T.note}</div>
                    <div className="tl-note">
                      {entry.note.bodyV2?.markdown ?? entry.note.title}
                    </div>
                    <div className="tl-meta">{formatJalaliDateTime(entry.at)}</div>
                  </div>
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
                <input
                  type="datetime-local"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                />
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
            <div className="actions-grid" style={{ marginTop: 14 }}>
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
          <div className="card card-pad anim d4">
            <h3>معلومات لید</h3>
            <div className="contact-rows">
              <div className="c-row">
                <span>ارزش تخمینی</span>
                <b className="num">{formatAfn(lead.amount?.amountMicros)}</b>
              </div>
              <div className="c-row">
                <span>{T.stage}</span>
                <b>{STAGE_LABELS[lead.stage ?? ''] ?? '—'}</b>
              </div>
              <div className="c-row">
                <span>عمر لید</span>
                <b className="num">{toPersianDigits(leadAgeDays)} روز</b>
              </div>
              <div className="c-row">
                <span>فعالیت‌ها</span>
                <b className="num">
                  {toPersianDigits(tasks.length)} {T.task} · {toPersianDigits(notes.length)}{' '}
                  {T.note}
                </b>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showWhatsApp && lead.pointOfContact && (
        <WhatsAppModal
          personId={lead.pointOfContact.id}
          opportunityId={lead.id}
          onClose={() => setShowWhatsApp(false)}
        />
      )}

      {toast !== null && <div className="toast">{toast}</div>}
    </main>
  );
};
