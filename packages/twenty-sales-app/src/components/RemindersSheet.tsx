import { useEffect, useState } from 'react';

import { ensurePushSubscription, pushPermissionStatus, type PushStatus } from '../lib/push';
import {
  completeReminderOptimistic,
  dismissReminderOptimistic,
  requestNotificationPermission,
  snoozeReminderOptimistic,
  useReminders,
} from '../lib/reminderStore';
import { taskLeadRef } from '../lib/reminders';
import { formatJalaliDateTime, toPersianDigits } from '../lib/jalali';
import { navigate } from '../lib/router';
import { T_REMIND } from '../lib/strings';
import { IconBell } from './icons';
import { ModalSheet } from './ModalSheet';
import { ReminderRow } from './ReminderRow';

type RemindersSheetProps = {
  onClose: () => void;
};

// The bell's sheet: the same rows as the Today card, reachable from any page.
// One line of push status under the list. "off" is the only state with an
// action: asking permission must be a tap, never a page load.
const PushStatusRow = () => {
  const [status, setStatus] = useState<PushStatus>(() => pushPermissionStatus());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== 'on') return;
    let cancelled = false;
    void ensurePushSubscription().then((result) => {
      if (!cancelled) setStatus(result);
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const enable = async () => {
    setBusy(true);
    try {
      await requestNotificationPermission();
      setStatus(await ensurePushSubscription());
    } finally {
      setBusy(false);
    }
  };

  const message =
    status === 'on'
      ? T_REMIND.pushOn
      : status === 'off'
        ? T_REMIND.pushOff
        : status === 'blocked'
          ? T_REMIND.pushBlocked
          : T_REMIND.pushUnsupported;

  return (
    <div className="rem-push-status">
      <span>{message}</span>
      {status === 'off' && (
        <button className="btn soft sm" disabled={busy} onClick={() => void enable()}>
          {T_REMIND.pushEnable}
        </button>
      )}
    </div>
  );
};

export const RemindersSheet = ({ onClose }: RemindersSheetProps) => {
  const { fired, upcomingToday, lastError, loaded } = useReminders();

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <ModalSheet
      title={`${T_REMIND.reminders}${fired.length > 0 ? ` (${toPersianDigits(fired.length)})` : ''}`}
      onClose={onClose}
    >
      {lastError !== null && (
        <div className="error-banner" style={{ marginBottom: 8 }}>
          {T_REMIND.actionFailed} — {lastError}
        </div>
      )}

      {loaded && fired.length === 0 && upcomingToday.length === 0 && (
        <div className="empty-state">{T_REMIND.empty}</div>
      )}

      {fired.length > 0 && (
        <div style={{ margin: '0 -18px' }}>
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
        </div>
      )}

      {upcomingToday.length > 0 && (
        <div style={{ margin: '0 -18px' }}>
          <div className="rem-section-lbl">{T_REMIND.upcomingHeading}</div>
          {upcomingToday.map((task) => {
            const lead = taskLeadRef(task);
            return (
              <div className="rem-upcoming" key={task.id} onClick={() => go(`/task/${task.id}`)}>
                <span style={{ color: 'var(--ink-3)', display: 'inline-flex' }}>
                  <IconBell size={13} />
                </span>
                <span style={{ fontWeight: 650, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {task.title}
                </span>
                {lead && <span className="lead-chip">{lead.name}</span>}
                <span className="num">{formatJalaliDateTime(task.remindAt ?? null)}</span>
              </div>
            );
          })}
        </div>
      )}

      <PushStatusRow />

      <button
        className="btn line sm"
        style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}
        onClick={() => go('/tasks')}
      >
        {T_REMIND.allTasks}
      </button>
    </ModalSheet>
  );
};
