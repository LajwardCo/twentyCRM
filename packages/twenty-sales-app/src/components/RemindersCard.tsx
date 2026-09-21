import { useRemindersProvisioned } from '../api/remindersSupport';
import { formatJalaliDateTime, toPersianDigits } from '../lib/jalali';
import {
  completeReminderOptimistic,
  dismissReminderOptimistic,
  snoozeReminderOptimistic,
  useReminders,
} from '../lib/reminderStore';
import { taskLeadRef } from '../lib/reminders';
import { navigate } from '../lib/router';
import { T_REMIND } from '../lib/strings';
import { IconBell } from './icons';
import { ReminderRow } from './ReminderRow';

const timeOnly = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return toPersianDigits(`${pad(date.getHours())}:${pad(date.getMinutes())}`);
};

// Dashboard card: what has rung, then what rings later today. Reads the
// shared store, so it agrees with the shell bell to the second and renders
// nothing when there is nothing to say (or before the fields exist).
export const RemindersCard = () => {
  const provisioned = useRemindersProvisioned();
  const { fired, upcomingToday, lastError } = useReminders();

  if (provisioned !== true) return null;
  if (fired.length === 0 && upcomingToday.length === 0 && lastError === null) return null;

  return (
    <div className="card anim">
      <div className="card-pad" style={{ paddingBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'var(--warm)', display: 'inline-flex' }}>
          <IconBell size={16} />
        </span>
        <h3 style={{ margin: 0 }}>
          {T_REMIND.reminders}{' '}
          {fired.length > 0 && (
            <span className="num" style={{ color: 'var(--hot)', fontWeight: 700 }}>
              ({toPersianDigits(fired.length)})
            </span>
          )}
        </h3>
      </div>

      {lastError !== null && (
        <div className="error-banner" style={{ margin: '0 18px 8px' }}>
          {T_REMIND.actionFailed} — {lastError}
        </div>
      )}

      {fired.length > 0 && (
        <>
          <div className="rem-section-lbl">{T_REMIND.firedHeading}</div>
          {fired.map((task) => (
            <ReminderRow
              key={task.id}
              task={task}
              onDone={() => void completeReminderOptimistic(task.id)}
              onSnooze={(kind) => void snoozeReminderOptimistic(task.id, kind)}
              onDismiss={() => void dismissReminderOptimistic(task.id)}
            />
          ))}
        </>
      )}

      {upcomingToday.length > 0 && (
        <>
          <div className="rem-section-lbl">{T_REMIND.upcomingHeading}</div>
          {upcomingToday.map((task) => {
            const lead = taskLeadRef(task);
            return (
              <div
                className="rem-upcoming"
                key={task.id}
                onClick={() => navigate(`/task/${task.id}`)}
                title={formatJalaliDateTime(task.remindAt ?? null)}
              >
                <span style={{ color: 'var(--ink-3)', display: 'inline-flex' }}>
                  <IconBell size={13} />
                </span>
                <span style={{ fontWeight: 650, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {task.title}
                </span>
                {lead && <span className="lead-chip">{lead.name}</span>}
                <span className="num">{timeOnly(task.remindAt)}</span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};
