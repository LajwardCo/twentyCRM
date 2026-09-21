import { useEffect, useState } from 'react';

import { fetchMembers, type Member } from '../api/admin';
import { uploadTaskAttachment } from '../api/attachments';
import {
  createQuickTask,
  createTaskForLead,
  updateTask,
  type Task,
  type TaskType,
} from '../api/records';
import { useRemindersProvisioned } from '../api/remindersSupport';
import { JalaliDatePicker } from './JalaliDatePicker';
import { ReminderField } from './ReminderField';
import { SearchSelect } from './SearchSelect';
import { IconMic, IconX } from './icons';
import { invalidateCache } from '../lib/cache';
import { toLocalInputValue, personName } from '../lib/format';
import { toPersianDigits } from '../lib/jalali';
import { refreshReminders } from '../lib/reminderStore';
import { shiftRemindAt } from '../lib/reminders';
import { navigate } from '../lib/router';
import { T, T2, T_REMIND, TASK_TYPE_LABELS } from '../lib/strings';

// The lead this task hangs off. Mirrors the (non-exported) LeadTargetIds shape
// in records.ts so the modal can create a task already linked to the lead.
type LeadTarget = {
  opportunityId: string;
  companyId?: string | null;
};

type QuickTaskModalProps =
  | {
      mode: 'create';
      dateIso: string;
      assigneeId: string;
      onClose: () => void;
      onSaved: () => void;
    }
  | {
      // Add a task straight from a lead page — linked to the lead, with details,
      // attachments, an assignee, and optionally already finished (logging a
      // call/visit that just happened).
      mode: 'create-lead';
      dateIso: string;
      assigneeId: string;
      target: LeadTarget;
      // Admins may hand the task to another member; sellers keep it themselves.
      allowAssigneePick?: boolean;
      onClose: () => void;
      onSaved: () => void;
    }
  | {
      mode: 'edit';
      task: Task;
      onClose: () => void;
      onSaved: () => void;
    };

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(8, 23, 55, 0.55)',
  zIndex: 60,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  animation: 'fade-in .2s both',
};

const sheetStyle: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: '18px 18px 0 0',
  width: '100%',
  maxWidth: 480,
  maxHeight: '85dvh',
  overflowY: 'auto',
  padding: '18px 18px calc(18px + var(--safe-bottom))',
  animation: 'rise-in .3s both',
};

const TASK_TYPES: TaskType[] = ['CALL', 'MEETING', 'DEMO', 'VISIT', 'REMINDER', 'OTHER'];

const localToIso = (local: string): string | null => {
  if (!local) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const defaultDueValue = (dateIso: string): string => {
  const [y, m, d] = dateIso.split('-').map(Number);
  return toLocalInputValue(new Date(y, m - 1, d, 9, 0, 0, 0));
};

const initialDueValue = (props: QuickTaskModalProps): string => {
  if (props.mode === 'edit') {
    return props.task.dueAt
      ? toLocalInputValue(new Date(props.task.dueAt))
      : toLocalInputValue(new Date());
  }
  return defaultDueValue(props.dateIso);
};

export const QuickTaskModal = (props: QuickTaskModalProps) => {
  const { onClose, onSaved } = props;
  const [title, setTitle] = useState(props.mode === 'edit' ? props.task.title : '');
  const [taskType, setTaskType] = useState<TaskType>(
    props.mode === 'edit' ? (props.task.taskType ?? 'OTHER') : 'OTHER',
  );
  const [dueValue, setDueValue] = useState(() => initialDueValue(props));
  const [remindAt, setRemindAt] = useState<string | null>(
    props.mode === 'edit' ? (props.task.remindAt ?? null) : null,
  );
  const remindersProvisioned = useRemindersProvisioned();
  const [body, setBody] = useState(
    props.mode === 'edit' ? (props.task.bodyV2?.markdown ?? '') : '',
  );

  // Moving the due time drags the reminder along so "1 hour before" stays
  // 1 hour before the new time.
  const changeDue = (nextLocal: string) => {
    const nextIso = localToIso(nextLocal);
    setDueValue(nextLocal);
    if (nextIso === null || remindAt === null) return;
    setRemindAt(
      shiftRemindAt({ dueAt: localToIso(dueValue), remindAt, reminderDismissedAt: null }, nextIso)
        .remindAt,
    );
  };
  const [done, setDone] = useState(props.mode === 'edit' ? props.task.status === 'DONE' : false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Files picked from the device, held until the task exists (attachments need
  // a task id), then uploaded on save. create-lead only.
  const [files, setFiles] = useState<File[]>([]);

  // Assignee picker (admins, create-lead only).
  const allowAssigneePick = props.mode === 'create-lead' && props.allowAssigneePick === true;
  const [assigneeId, setAssigneeId] = useState(
    props.mode === 'create-lead' || props.mode === 'create' ? props.assigneeId : '',
  );
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
      const dueAt = dueValue ? new Date(dueValue).toISOString() : null;
      const bodyMarkdown = body.trim();
      // The key is only sent once the server is known to accept it.
      const reminderFields = remindersProvisioned === true ? { remindAt } : {};
      if (props.mode === 'create') {
        await createQuickTask({
          title: title.trim(),
          status: done ? 'DONE' : 'TODO',
          taskType,
          dueAt,
          ...reminderFields,
          assigneeId: props.assigneeId,
        });
      } else if (props.mode === 'create-lead') {
        const taskId = await createTaskForLead({
          title: title.trim(),
          bodyMarkdown: bodyMarkdown === '' ? undefined : bodyMarkdown,
          status: done ? 'DONE' : 'TODO',
          taskType,
          dueAt,
          ...reminderFields,
          assigneeId: assigneeId || props.assigneeId,
          target: props.target,
        });
        // Upload each staged file onto the freshly created task.
        for (let i = 0; i < files.length; i++) {
          setProgress(
            T2.quickTaskUploading(toPersianDigits(i + 1), toPersianDigits(files.length)),
          );
          await uploadTaskAttachment({
            file: files[i],
            taskId,
            opportunityId: props.target.opportunityId,
          });
        }
        invalidateCache(`lead:${props.target.opportunityId}`);
      } else {
        // Leaving the checkbox untouched must not silently downgrade an
        // IN_PROGRESS task to TODO — only "mark done" is an explicit action.
        const status = done
          ? 'DONE'
          : props.task.status && props.task.status !== 'DONE'
            ? props.task.status
            : 'TODO';
        await updateTask(props.task.id, {
          title: title.trim(),
          taskType,
          dueAt,
          status,
          ...reminderFields,
          bodyV2: { markdown: bodyMarkdown },
          // a changed reminder is a fresh one; a dismissed past one stays dismissed
          ...(remindersProvisioned === true && remindAt !== (props.task.remindAt ?? null)
            ? { reminderDismissedAt: null }
            : {}),
        });
      }
      invalidateCache('calendar:');
      invalidateCache('today:');
      void refreshReminders();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : T2.quickTaskSaveFailed);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={sheetStyle} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 750 }}>
            {props.mode === 'edit' ? T2.quickTaskEditTitle : T2.quickTaskNewTitle}
          </h3>
          <button className="btn line sm" onClick={onClose}>
            {T.close}
          </button>
        </div>

        <div className="fld">
          <label htmlFor="qt-title">{T2.quickTaskTitleLbl}</label>
          <input
            id="qt-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>

        <div className="f2">
          <div className="fld">
            <label htmlFor="qt-type">{T2.quickTaskTypeLbl}</label>
            <select
              id="qt-type"
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
            <label htmlFor="qt-due">{T2.quickTaskDueLbl}</label>
            <JalaliDatePicker id="qt-due" value={dueValue} onChange={changeDue} />
          </div>
        </div>

        {remindersProvisioned === true && (
          <div className="fld">
            <label htmlFor="qt-remind">{T_REMIND.notifyMe}</label>
            <ReminderField
              id="qt-remind"
              dueLocal={dueValue}
              remindAt={remindAt}
              onChange={setRemindAt}
            />
          </div>
        )}

        {allowAssigneePick && (
          <div className="fld">
            <label htmlFor="qt-assignee">{T2.quickTaskAssigneeLbl}</label>
            <SearchSelect
              id="qt-assignee"
              value={assigneeId}
              onChange={setAssigneeId}
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

        {props.mode !== 'create' && (
          <div className="fld">
            <label htmlFor="qt-body">{T2.quickTaskDetailsLbl}</label>
            <textarea
              id="qt-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={T2.quickTaskDetailsPlaceholder}
              rows={3}
            />
          </div>
        )}

        {props.mode === 'create-lead' && (
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
        )}

        {props.mode !== 'create' && (
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
        )}

        {error !== null && <div className="error-banner">{error}</div>}

        <button
          className="btn gold block"
          disabled={busy || title.trim() === ''}
          onClick={handleSave}
          style={{ padding: 12 }}
        >
          {busy ? (progress ?? T2.quickTaskSaving) : T2.quickTaskSave}
        </button>

        {props.mode === 'edit' && (
          <button
            className="btn line sm"
            style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
            onClick={() => navigate(`/task/${props.task.id}`)}
          >
            {T2.quickTaskOpenFull}
          </button>
        )}
      </div>
    </div>
  );
};
