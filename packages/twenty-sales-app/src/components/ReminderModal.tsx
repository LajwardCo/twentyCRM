import { useState } from 'react';

import { createTaskForLead } from '../api/records';
import { invalidateCache } from '../lib/cache';
import { toLocalInputValue } from '../lib/format';
import { refreshReminders, requestNotificationPermission } from '../lib/reminderStore';
import { offsetToRemindAt, shiftRemindAt } from '../lib/reminders';
import { T, T_REMIND } from '../lib/strings';
import { JalaliDatePicker } from './JalaliDatePicker';
import { ModalSheet } from './ModalSheet';
import { ReminderField } from './ReminderField';

type ReminderModalProps = {
  lead: { id: string; name: string; company: { id: string } | null };
  assigneeId: string;
  onClose: () => void;
  onSaved: () => void;
};

const tomorrowMorningLocal = (): string => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return toLocalInputValue(date);
};

const localToIso = (local: string): string | null => {
  if (!local) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

// "Remind me about this lead": a REMINDER-type task due at the chosen time,
// with the notification at or before it. Kept separate from the follow-up
// form because the seller's intent here is "tell me", not "I have work to do".
export const ReminderModal = ({ lead, assigneeId, onClose, onSaved }: ReminderModalProps) => {
  const [title, setTitle] = useState(T_REMIND.defaultTitle(lead.name));
  const [dueLocal, setDueLocal] = useState(tomorrowMorningLocal);
  const [remindAt, setRemindAt] = useState<string | null>(() =>
    offsetToRemindAt('at', localToIso(tomorrowMorningLocal())),
  );
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeDue = (nextLocal: string) => {
    const nextIso = localToIso(nextLocal);
    setDueLocal(nextLocal);
    if (nextIso === null) return;
    // keep "15 minutes before" meaning 15 minutes before the NEW time
    setRemindAt(
      shiftRemindAt({ dueAt: localToIso(dueLocal), remindAt, reminderDismissedAt: null }, nextIso)
        .remindAt,
    );
  };

  const handleSave = async () => {
    const dueIso = localToIso(dueLocal);
    if (title.trim() === '') {
      setError(T_REMIND.titleRequired);
      return;
    }
    if (dueIso === null) {
      setError(T_REMIND.saveFailed);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Ask while the seller's finger is still on "save": a permission prompt
      // tied to an action is granted far more often than one on page load.
      await requestNotificationPermission();
      await createTaskForLead({
        title: title.trim(),
        status: 'TODO',
        taskType: 'REMINDER',
        dueAt: dueIso,
        remindAt: remindAt ?? dueIso,
        bodyMarkdown: note.trim() || undefined,
        assigneeId,
        target: { opportunityId: lead.id, companyId: lead.company?.id },
      });
      invalidateCache('today:');
      invalidateCache('calendar:');
      invalidateCache(`lead:${lead.id}`);
      void refreshReminders();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : T_REMIND.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalSheet title={T_REMIND.setReminder} onClose={onClose}>
      <div className="fld">
        <label htmlFor="rem-title">{T_REMIND.titleLbl}</label>
        <input id="rem-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>

      <div className="f2">
        <div className="fld">
          <label htmlFor="rem-due">{T_REMIND.whenLbl}</label>
          <JalaliDatePicker id="rem-due" withTime value={dueLocal} onChange={changeDue} />
        </div>
        <div className="fld">
          <label htmlFor="rem-offset">{T_REMIND.notifyMe}</label>
          <ReminderField
            id="rem-offset"
            dueLocal={dueLocal}
            remindAt={remindAt}
            onChange={setRemindAt}
          />
        </div>
      </div>

      <div className="fld">
        <label htmlFor="rem-note">{T_REMIND.noteLbl}</label>
        <textarea
          id="rem-note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 12 }}>
        {T_REMIND.notifyHint}
      </div>

      {error !== null && <div className="error-banner">{error}</div>}

      <button
        className="btn gold block"
        disabled={busy || title.trim() === ''}
        onClick={handleSave}
        style={{ padding: 12 }}
      >
        {busy ? T_REMIND.saving : T_REMIND.save}
      </button>
      <button
        className="btn line sm"
        style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
        onClick={onClose}
      >
        {T.close}
      </button>
    </ModalSheet>
  );
};
