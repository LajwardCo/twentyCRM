import { useState } from 'react';

import { createQuickTask, updateTask, type Task, type TaskType } from '../api/records';
import { invalidateCache } from '../lib/cache';
import { toLocalInputValue } from '../lib/format';
import { navigate } from '../lib/router';
import { T, T2, TASK_TYPE_LABELS } from '../lib/strings';

type QuickTaskModalProps =
  | {
      mode: 'create';
      dateIso: string;
      assigneeId: string;
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

const TASK_TYPES: TaskType[] = ['CALL', 'MEETING', 'DEMO', 'VISIT', 'OTHER'];

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
  const [done, setDone] = useState(props.mode === 'edit' ? props.task.status === 'DONE' : false);
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
      const dueAt = dueValue ? new Date(dueValue).toISOString() : null;
      if (props.mode === 'create') {
        await createQuickTask({
          title: title.trim(),
          status: done ? 'DONE' : 'TODO',
          taskType,
          dueAt,
          assigneeId: props.assigneeId,
        });
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
        });
      }
      invalidateCache('calendar:');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : T2.quickTaskSaveFailed);
    } finally {
      setBusy(false);
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
            {props.mode === 'create' ? T2.quickTaskNewTitle : T2.quickTaskEditTitle}
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
            <input
              id="qt-due"
              type="datetime-local"
              value={dueValue}
              onChange={(e) => setDueValue(e.target.value)}
            />
          </div>
        </div>

        {props.mode === 'edit' && (
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
          {busy ? T2.quickTaskSaving : T2.quickTaskSave}
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
