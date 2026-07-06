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
  IconPhone,
  IconScript,
  IconSms,
  IconSummary,
  IconWhatsApp,
} from '../components/icons';
import { TopBar } from '../components/Shell';
import { WhatsAppModal } from '../components/WhatsAppModal';
import {
  formatDateTime,
  fullPhone,
  personName,
  toLocalInputValue,
} from '../lib/format';
import {
  CALL_SCRIPT_SYSTEM_PROMPT,
  leadContextText,
  SUMMARIZE_SYSTEM_PROMPT,
} from '../lib/leadContext';
import { navigate } from '../lib/router';

type LeadDetailViewProps = {
  leadId: string;
  user: CurrentUser;
};

type TimelineEntry =
  | { kind: 'task'; at: string; task: Task }
  | { kind: 'note'; at: string; note: Note };

export const LeadDetailView = ({ leadId, user }: LeadDetailViewProps) => {
  const [lead, setLead] = useState<LeadSummary | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showWhatsApp, setShowWhatsApp] = useState(false);

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
      setError(err instanceof Error ? err.message : 'Failed to load lead');
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
      setAiOutput(
        `⚠️ ${err instanceof Error ? err.message : 'AI request failed'}`,
      );
    } finally {
      setAiBusy(false);
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
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add note');
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
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add follow-up');
    } finally {
      setFollowUpBusy(false);
    }
  };

  const timeline: TimelineEntry[] = [
    ...tasks.map((task): TimelineEntry => ({
      kind: 'task',
      at: task.dueAt ?? task.createdAt,
      task,
    })),
    ...notes.map((note): TimelineEntry => ({
      kind: 'note',
      at: note.createdAt,
      note,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  if (lead === null) {
    return (
      <>
        <TopBar title="Lead" showBack />
        <main className="app-main">
          {error !== null ? (
            <div className="error-banner">{error}</div>
          ) : (
            <div className="spinner" />
          )}
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title={lead.name} showBack />
      <main className="app-main">
        {error !== null && <div className="error-banner">{error}</div>}

        {/* header card */}
        <div className="card">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <select
              value={lead.stage ?? ''}
              onChange={async (e) => {
                const stage = e.target.value;
                setLead({ ...lead, stage });
                await updateLead(lead.id, { stage }).catch(() => reload());
              }}
              style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600 }}
            >
              {STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              value={lead.temperature ?? ''}
              onChange={async (e) => {
                const temperature = e.target.value || null;
                setLead({ ...lead, temperature });
                await updateLead(lead.id, { temperature }).catch(() => reload());
              }}
              style={{ width: 110, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600 }}
            >
              <option value="">Temp…</option>
              <option value="HOT">🔥 Hot</option>
              <option value="WARM">🌤 Warm</option>
              <option value="COLD">❄️ Cold</option>
            </select>
          </div>
          <div className="muted">
            {personName(lead.pointOfContact)}
            {phone ? ` · ${phone}` : ''}
            {lead.owner ? ` · owner: ${personName(lead.owner)}` : ''}
          </div>
        </div>

        {/* contact actions */}
        <div className="action-grid" style={{ marginBottom: 12 }}>
          <button
            className="action-btn"
            disabled={!phone}
            onClick={() => phone && (window.location.href = `tel:${phone}`)}
          >
            <IconPhone />
            Call
          </button>
          <button
            className="action-btn"
            disabled={!phone}
            onClick={() => phone && (window.location.href = `sms:${phone}`)}
          >
            <IconSms />
            SMS
          </button>
          <button
            className="action-btn"
            disabled={!lead.pointOfContact}
            onClick={() => setShowWhatsApp(true)}
          >
            <IconWhatsApp />
            WhatsApp
          </button>
          <button
            className="action-btn"
            disabled={!email}
            onClick={() => email && (window.location.href = `mailto:${email}`)}
          >
            <IconMail />
            Email
          </button>
        </div>

        {/* AI actions */}
        <div className="action-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 12 }}>
          <button
            className="action-btn"
            disabled={aiBusy}
            onClick={() => runAi('Summary', SUMMARIZE_SYSTEM_PROMPT)}
          >
            <IconSummary />
            Summarize
          </button>
          <button
            className="action-btn"
            disabled={aiBusy}
            onClick={() => runAi('Call Script', CALL_SCRIPT_SYSTEM_PROMPT)}
          >
            <IconScript />
            Call Script
          </button>
          <button
            className="action-btn"
            onClick={() => navigate(`/lead/${lead.id}/chat`)}
          >
            <IconAI />
            Ask AI
          </button>
        </div>

        {(aiBusy || aiOutput !== null) && (
          <div className="card">
            <h3 className="card-title">AI · {aiLabel}</h3>
            {aiBusy ? (
              <div className="spinner" />
            ) : (
              <>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.5 }}>
                  {aiOutput}
                </div>
                <button
                  className="btn ghost small"
                  style={{ marginTop: 10 }}
                  onClick={() => navigator.clipboard.writeText(aiOutput ?? '')}
                >
                  Copy
                </button>
              </>
            )}
          </div>
        )}

        {/* quick add note */}
        <div className="card">
          <h3 className="card-title">Add note</h3>
          <div className="field" style={{ marginBottom: 8 }}>
            <textarea
              placeholder="What happened? (saved to lead notes)"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
            />
          </div>
          <button
            className="btn secondary small"
            disabled={noteBusy || noteDraft.trim() === ''}
            onClick={addNote}
          >
            {noteBusy ? 'Saving…' : 'Save note'}
          </button>
        </div>

        {/* quick add follow-up */}
        <div className="card">
          <h3 className="card-title">Schedule follow-up</h3>
          <div className="field" style={{ marginBottom: 8 }}>
            <input
              placeholder="e.g. Call to confirm the demo"
              value={followUpDraft}
              onChange={(e) => setFollowUpDraft(e.target.value)}
            />
          </div>
          <div className="field" style={{ marginBottom: 8 }}>
            <input
              type="datetime-local"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
            />
          </div>
          <button
            className="btn secondary small"
            disabled={followUpBusy || followUpDraft.trim() === ''}
            onClick={addFollowUp}
          >
            {followUpBusy ? 'Saving…' : 'Add follow-up'}
          </button>
        </div>

        {/* timeline */}
        <div className="card">
          <h3 className="card-title">History ({timeline.length})</h3>
          {timeline.length === 0 && (
            <div className="muted">No activity yet</div>
          )}
          {timeline.map((entry) =>
            entry.kind === 'task' ? (
              <div className="timeline-item" key={`t-${entry.task.id}`}>
                <div
                  className={`timeline-dot ${entry.task.status === 'DONE' ? 'done' : ''}`}
                />
                <div className="timeline-body">
                  <div className="timeline-title">
                    {entry.task.title}{' '}
                    <span
                      className={`badge ${entry.task.status === 'DONE' ? 'done' : 'todo'}`}
                    >
                      {entry.task.status ?? '—'}
                    </span>
                  </div>
                  {entry.task.bodyV2?.markdown && (
                    <div className="timeline-note">
                      {entry.task.bodyV2.markdown}
                    </div>
                  )}
                  <div className="timeline-meta">
                    {formatDateTime(entry.at)}
                    {entry.task.status !== 'DONE' && (
                      <>
                        {' · '}
                        <button
                          className="btn ghost small"
                          style={{ padding: '2px 8px', fontSize: 12 }}
                          onClick={async () => {
                            await setTaskStatus(entry.task.id, 'DONE');
                            await reload();
                          }}
                        >
                          Mark done
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="timeline-item" key={`n-${entry.note.id}`}>
                <div
                  className="timeline-dot"
                  style={{ background: 'var(--color-warning)' }}
                />
                <div className="timeline-body">
                  <div className="timeline-title">📝 {entry.note.title}</div>
                  {entry.note.bodyV2?.markdown &&
                    entry.note.bodyV2.markdown !== entry.note.title && (
                      <div className="timeline-note">
                        {entry.note.bodyV2.markdown}
                      </div>
                    )}
                  <div className="timeline-meta">{formatDateTime(entry.at)}</div>
                </div>
              </div>
            ),
          )}
        </div>
      </main>

      {showWhatsApp && lead.pointOfContact && (
        <WhatsAppModal
          personId={lead.pointOfContact.id}
          opportunityId={lead.id}
          onClose={() => setShowWhatsApp(false)}
        />
      )}
    </>
  );
};
