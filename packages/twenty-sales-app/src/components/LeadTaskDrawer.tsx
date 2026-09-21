import { useState } from 'react';

import { createTaskForLead, type TaskType } from '../api/records';
import { invalidateCache } from '../lib/cache';
import { toLocalInputValue } from '../lib/format';
import { T2, TASK_TYPE_LABELS } from '../lib/strings';
import { JalaliDatePicker } from './JalaliDatePicker';
import { ModalSheet } from './ModalSheet';

// A full task-create drawer that lives on the lead page. Unlike the one-line
// follow-up, it carries the type, details and a "done" toggle, so a seller can
// log a task -- including one that has already happened -- without leaving for
// the task page to fill in the rest.

type LeadTaskDrawerProps = {
  target: { opportunityId: string; companyId?: string | null };
  assigneeId: string;
  // Prefilled from the quick follow-up fields when opened from there.
  initialTitle?: string;
  initialDueValue?: string;
  onClose: () => void;
  onSaved: () => void;
};

const TASK_TYPES: TaskType[] = ['CALL', 'MEETING', 'DEMO', 'VISIT', 'OTHER'];

const tomorrowMorning = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toLocalInputValue(d);
};

export const LeadTaskDrawer = ({
  target,
  assigneeId,
  initialTitle,
  initialDueValue,
  onClose,
  onSaved,
}: LeadTaskDrawerProps) => {
  const [title, setTitle] = useState(initialTitle ?? '');
  const [taskType, setTaskType] = useState<TaskType>('OTHER');
  const [dueValue, setDueValue] = useState(initialDueValue || tomorrowMorning());
  const [details, setDetails] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (title.trim() === '') {
      setError(T2.quickTaskTitleRequired);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createTaskForLead({
        title: title.trim(),
        bodyMarkdown: details.trim() || undefined,
        status: done ? 'DONE' : 'TODO',
        taskType,
        dueAt: dueValue ? new Date(dueValue).toISOString() : null,
        assigneeId,
        target,
      });
      invalidateCache('today:');
      invalidateCache('calendar:');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : T2.quickTaskSaveFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalSheet title={T2.quickTaskNewTitle} onClose={onClose}>
      <div className="fld">
        <label htmlFor="lt-title">{T2.quickTaskTitleLbl}</label>
        <input
          id="lt-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </div>

      <div className="f2">
        <div className="fld">
          <label htmlFor="lt-type">{T2.quickTaskTypeLbl}</label>
          <select
            id="lt-type"
            value={taskType}
            onChange={(e) => setTaskType(e.target.value as TaskType)}
          >
            {TASK_TYPES.map((tt) => (
              <option key={tt} value={tt}>
                {TASK_TYPE_LABELS[tt]}
              </option>
            ))}
          </select>
        </div>
        <div className="fld">
          <label htmlFor="lt-due">{T2.quickTaskDueLbl}</label>
          <JalaliDatePicker id="lt-due" value={dueValue} onChange={setDueValue} />
        </div>
      </div>

      <div className="fld">
        <label htmlFor="lt-details">{T2.quickTaskDetailsLbl}</label>
        <textarea
          id="lt-details"
          placeholder={T2.quickTaskDetailsPlaceholder}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          fontWeight: 650,
          color: 'var(--ink-2)',
          marginBottom: 14,
          cursor: 'pointer',
        }}
      >
        <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />
        {T2.quickTaskMarkDone}
      </label>

      {error !== null && <div className="error-banner">{error}</div>}

      <button
        className="btn gold block"
        disabled={busy || title.trim() === ''}
        onClick={handleSave}
        style={{ padding: 12 }}
      >
        {busy ? T2.quickTaskSaving : T2.quickTaskSave}
      </button>
    </ModalSheet>
  );
};
