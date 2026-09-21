import { useState } from 'react';

import { type Task } from '../api/records';
import { relativeDueLabel } from '../lib/jalali';
import { taskLeadRef, type SnoozeKind } from '../lib/reminders';
import { navigate } from '../lib/router';
import { T_REMIND, TASK_TYPE_LABELS } from '../lib/strings';
import { IconBell } from './icons';

type ReminderRowProps = {
  task: Task;
  onDone: () => void;
  onSnooze: (kind: SnoozeKind) => void;
  onDismiss: () => void;
};

// One fired reminder with its three ways out. Shared by the Today card and
// the shell bell sheet so they behave identically. Snooze is a second row of
// two buttons rather than a menu: on a phone a menu is one tap too many.
export const ReminderRow = ({ task, onDone, onSnooze, onDismiss }: ReminderRowProps) => {
  const [snoozing, setSnoozing] = useState(false);
  const lead = taskLeadRef(task);
  const showType = task.taskType && task.taskType !== 'REMINDER';

  return (
    <div className="rem-row">
      <div className="rem-head">
        <span className="rem-bell">
          <IconBell size={15} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="rem-title" onClick={() => navigate(`/task/${task.id}`)}>
            {task.title}
          </div>
          <div className="rem-sub">
            {showType && (
              <span className="pill stage" style={{ fontSize: 10.5, padding: '1px 8px' }}>
                {TASK_TYPE_LABELS[task.taskType ?? 'OTHER']}
              </span>
            )}
            {lead && (
              <span
                className="lead-chip"
                style={lead.id ? { cursor: 'pointer' } : undefined}
                onClick={() => lead.id && navigate(`/lead/${lead.id}`)}
              >
                {lead.name}
              </span>
            )}
            <span className="due over">{relativeDueLabel(task.remindAt ?? null)}</span>
          </div>
        </div>
      </div>
      <div className="rem-actions">
        {snoozing ? (
          <>
            <button className="btn soft sm" onClick={() => onSnooze('hour')}>
              {T_REMIND.snoozeHour}
            </button>
            <button className="btn soft sm" onClick={() => onSnooze('tomorrow')}>
              {T_REMIND.snoozeTomorrow}
            </button>
            <button className="btn line sm" onClick={() => setSnoozing(false)}>
              ✕
            </button>
          </>
        ) : (
          <>
            <button className="btn gold sm" onClick={onDone}>
              {T_REMIND.done}
            </button>
            <button className="btn soft sm" onClick={() => setSnoozing(true)}>
              {T_REMIND.snooze}
            </button>
            <button className="btn line sm" onClick={onDismiss}>
              {T_REMIND.dismiss}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
