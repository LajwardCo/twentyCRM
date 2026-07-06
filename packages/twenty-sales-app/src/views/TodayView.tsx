import { useCallback, useEffect, useState } from 'react';

import { type CurrentUser } from '../api/auth';
import {
  fetchMyOpenTasks,
  setTaskStatus,
  type Task,
} from '../api/records';
import { IconCheck, IconLogout } from '../components/icons';
import { TopBar } from '../components/Shell';
import { endOfToday, formatDate, startOfToday } from '../lib/format';
import { navigate } from '../lib/router';

type TodayViewProps = {
  user: CurrentUser;
  onLogout: () => void;
};

const taskLead = (task: Task) => {
  const targets = task.taskTargets?.edges ?? [];
  for (const { node } of targets) {
    if (node.opportunity) return node.opportunity;
  }
  for (const { node } of targets) {
    if (node.company) return { id: null, name: node.company.name };
  }
  return null;
};

const TaskRow = ({
  task,
  onDone,
}: {
  task: Task;
  onDone: (task: Task) => void;
}) => {
  const lead = taskLead(task);
  return (
    <div className="list-row" style={{ cursor: 'default' }}>
      <button
        aria-label="Mark done"
        onClick={() => onDone(task)}
        style={{
          width: 30,
          height: 30,
          borderRadius: '50%',
          border: '2px solid var(--color-border)',
          background: 'none',
          color: 'var(--color-success)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          cursor: 'pointer',
        }}
      >
        <IconCheck size={16} />
      </button>
      <div
        className="list-row-main"
        onClick={() => lead?.id && navigate(`/lead/${lead.id}`)}
        style={{ cursor: lead?.id ? 'pointer' : 'default' }}
      >
        <div className="list-row-title">{task.title}</div>
        <div className="list-row-sub">
          {lead ? lead.name : 'No lead'} · due {formatDate(task.dueAt)}
        </div>
      </div>
    </div>
  );
};

export const TodayView = ({ user, onLogout }: TodayViewProps) => {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneCount, setDoneCount] = useState(0);

  const reload = useCallback(async () => {
    try {
      const eod = endOfToday().toISOString();
      const [dueNow, upcoming] = await Promise.all([
        fetchMyOpenTasks(user.workspaceMemberId, { dueBefore: eod }),
        fetchMyOpenTasks(user.workspaceMemberId, {
          dueAfter: eod,
          limit: 10,
        }),
      ]);
      setTasks([...dueNow, ...upcoming]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    }
  }, [user.workspaceMemberId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const markDone = async (task: Task) => {
    setTasks((prev) => prev?.filter((t) => t.id !== task.id) ?? prev);
    setDoneCount((c) => c + 1);
    try {
      await setTaskStatus(task.id, 'DONE');
    } catch {
      setDoneCount((c) => c - 1);
      void reload();
    }
  };

  const now = new Date();
  const sod = startOfToday();
  const eod = endOfToday();

  const overdue =
    tasks?.filter((t) => t.dueAt && new Date(t.dueAt) < sod) ?? [];
  const today =
    tasks?.filter(
      (t) =>
        t.dueAt && new Date(t.dueAt) >= sod && new Date(t.dueAt) <= eod,
    ) ?? [];
  const upcoming =
    tasks?.filter((t) => !t.dueAt || new Date(t.dueAt) > eod) ?? [];

  const greeting =
    now.getHours() < 12
      ? 'Good morning'
      : now.getHours() < 17
        ? 'Good afternoon'
        : 'Good evening';

  return (
    <>
      <TopBar
        title={`${greeting}, ${user.firstName}`}
        right={
          <button
            className="btn ghost small"
            style={{ padding: '6px 8px' }}
            onClick={onLogout}
            aria-label="Sign out"
          >
            <IconLogout size={18} />
          </button>
        }
      />
      <main className="app-main">
        {error !== null && <div className="error-banner">{error}</div>}
        {tasks === null && error === null && <div className="spinner" />}

        {tasks !== null && (
          <>
            <div className="card" style={{ display: 'flex', gap: 18 }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 750 }}>
                  {overdue.length + today.length}
                </div>
                <div className="muted">to do today</div>
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 750, color: 'var(--color-danger)' }}>
                  {overdue.length}
                </div>
                <div className="muted">overdue</div>
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 750, color: 'var(--color-success)' }}>
                  {doneCount}
                </div>
                <div className="muted">done now</div>
              </div>
            </div>

            {overdue.length > 0 && (
              <>
                <div className="section-head">
                  <h2 style={{ color: 'var(--color-danger)' }}>Overdue</h2>
                </div>
                {overdue.map((t) => (
                  <TaskRow key={t.id} task={t} onDone={markDone} />
                ))}
              </>
            )}

            <div className="section-head">
              <h2>Today</h2>
            </div>
            {today.length === 0 ? (
              <div className="empty-state">Nothing due today 🎉</div>
            ) : (
              today.map((t) => <TaskRow key={t.id} task={t} onDone={markDone} />)
            )}

            {upcoming.length > 0 && (
              <>
                <div className="section-head">
                  <h2>Upcoming</h2>
                </div>
                {upcoming.slice(0, 10).map((t) => (
                  <TaskRow key={t.id} task={t} onDone={markDone} />
                ))}
              </>
            )}
          </>
        )}
      </main>
      <button className="fab" aria-label="New lead" onClick={() => navigate('/new')}>
        +
      </button>
    </>
  );
};
