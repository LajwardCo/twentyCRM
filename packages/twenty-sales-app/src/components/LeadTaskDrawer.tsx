import { useEffect, useState } from 'react';

import { fetchMembers, type Member } from '../api/admin';
import { uploadTaskAttachment } from '../api/attachments';
import { createTaskForLead, type TaskType } from '../api/records';
import { invalidateCache } from '../lib/cache';
import { toLocalInputValue, personName } from '../lib/format';
import { toPersianDigits } from '../lib/jalali';
import { T2, TASK_TYPE_LABELS } from '../lib/strings';
import { JalaliDatePicker } from './JalaliDatePicker';
import { ModalSheet } from './ModalSheet';
import { SearchSelect } from './SearchSelect';
import { IconMic, IconX } from './icons';

// A full task-create drawer that lives on the lead page. Unlike the one-line
// follow-up, it carries the type, details, an assignee, file attachments and a
// "done" toggle, so a seller can log a task -- including one that has already
// happened -- without leaving for the task page to fill in the rest.

type LeadTaskDrawerProps = {
  target: { opportunityId: string; companyId?: string | null };
  assigneeId: string;
  // Admins may hand the task to another member; sellers keep it themselves.
  allowAssigneePick?: boolean;
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
  allowAssigneePick = false,
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
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Files picked from the device, held until the task exists (attachments need
  // a task id), then uploaded on save.
  const [files, setFiles] = useState<File[]>([]);

  // Assignee picker (admins only).
  const [selectedAssignee, setSelectedAssignee] = useState(assigneeId);
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    if (!allowAssigneePick) return;
    let active = true;
    void fetchMembers()
      .then((list) => {
        if (active) setMembers(list);
      })
      .catch(() => {
        // no permission / unavailable — leave the picker empty, default stands
      });
    return () => {
      active = false;
    };
  }, [allowAssigneePick]);

  const addFiles = (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    // Capture the files eagerly: the onChange handler clears the input's value
    // right after this call, which empties the live FileList — so a lazy
    // Array.from inside the state updater would see nothing.
    const added = Array.from(picked);
    setFiles((prev) => [...prev, ...added]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (title.trim() === '') {
      setError(T2.quickTaskTitleRequired);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const taskId = await createTaskForLead({
        title: title.trim(),
        bodyMarkdown: details.trim() || undefined,
        status: done ? 'DONE' : 'TODO',
        taskType,
        dueAt: dueValue ? new Date(dueValue).toISOString() : null,
        assigneeId: selectedAssignee || assigneeId,
        target,
      });
      // Upload each staged file onto the freshly created task.
      for (let i = 0; i < files.length; i++) {
        setProgress(T2.quickTaskUploading(toPersianDigits(i + 1), toPersianDigits(files.length)));
        await uploadTaskAttachment({
          file: files[i],
          taskId,
          opportunityId: target.opportunityId,
        });
      }
      invalidateCache('today:');
      invalidateCache('calendar:');
      invalidateCache(`lead:${target.opportunityId}`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : T2.quickTaskSaveFailed);
    } finally {
      setBusy(false);
      setProgress(null);
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

      {allowAssigneePick && (
        <div className="fld">
          <label htmlFor="lt-assignee">{T2.quickTaskAssigneeLbl}</label>
          <SearchSelect
            id="lt-assignee"
            value={selectedAssignee}
            onChange={setSelectedAssignee}
            options={members.map((m) => ({
              value: m.id,
              label: personName(m),
              hint: m.userEmail ?? '',
            }))}
            emptyLabel={T2.quickTaskNoAssignee}
            ariaLabel={T2.quickTaskAssigneeLbl}
          />
        </div>
      )}

      <div className="fld">
        <label htmlFor="lt-details">{T2.quickTaskDetailsLbl}</label>
        <textarea
          id="lt-details"
          placeholder={T2.quickTaskDetailsPlaceholder}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
      </div>

      <div className="fld">
        <label>{T2.quickTaskAttachLbl}</label>
        <label className="btn line sm" style={{ cursor: 'pointer', width: 'fit-content' }}>
          <IconMic size={15} />
          {T2.quickTaskAttachBtn}
          <input
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        {files.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {files.map((file, index) => (
              <span
                key={`${file.name}-${index}`}
                className="pill"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {file.name}
                <button
                  type="button"
                  aria-label={T2.quickTaskRemoveFile}
                  onClick={() => removeFile(index)}
                  style={{
                    display: 'inline-flex',
                    background: 'none',
                    border: 0,
                    padding: 0,
                    cursor: 'pointer',
                    color: 'inherit',
                  }}
                >
                  <IconX size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
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
        {busy ? (progress ?? T2.quickTaskSaving) : T2.quickTaskSave}
      </button>
    </ModalSheet>
  );
};
