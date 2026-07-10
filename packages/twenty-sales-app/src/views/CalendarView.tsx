import { useCallback, useMemo, useState } from 'react';

import { type CurrentUser } from '../api/auth';
import { fetchTasksForCalendar, updateTask, type Task } from '../api/records';
import { CalendarGrid } from '../components/CalendarGrid';
import { IconCheck } from '../components/icons';
import { useCached } from '../lib/cache';
import { buildCalendarGrid, groupTasksByDate, todayDateKey } from '../lib/calendarGrid';
import {
  AFGHAN_MONTHS,
  addJalaliMonths,
  formatJalaliDate,
  gregorianToJalali,
  relativeDueLabel,
  toPersianDigits,
} from '../lib/jalali';
import { navigate } from '../lib/router';
import { T, T2, TASK_TYPE_LABELS } from '../lib/strings';
import { TASK_TYPE_ICONS } from './TaskView';

type CalendarViewProps = {
  user: CurrentUser;
};

const taskLead = (task: Task) => {
  const targets = task.taskTargets?.edges ?? [];
  for (const { node } of targets) {
    if (node.opportunity) return node.opportunity;
  }
  for (const { node } of targets) {
    if (node.company) return { id: null as string | null, name: node.company.name };
  }
  return null;
};

export const CalendarView = ({ user }: CalendarViewProps) => {
  const currentJalali = useMemo(() => {
    const now = new Date();
    return gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }, []);
  const [cursor, setCursor] = useState(() => ({
    jy: currentJalali.jy,
    jm: currentJalali.jm,
  }));
  const [selectedDate, setSelectedDate] = useState<string | null>(() => todayDateKey());
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [dropError, setDropError] = useState<string | null>(null);

  const cells = useMemo(
    () => buildCalendarGrid(cursor.jy, cursor.jm, todayDateKey()),
    [cursor.jy, cursor.jm],
  );

  const fetchAll = useCallback(async () => {
    const first = cells[0];
    const last = cells[cells.length - 1];
    return fetchTasksForCalendar(user.workspaceMemberId, {
      fromIso: `${first.dateIso}T00:00:00.000Z`,
      toIso: `${last.dateIso}T23:59:59.999Z`,
    });
  }, [cells, user.workspaceMemberId]);

  const { data, error, refresh } = useCached(
    `calendar:${user.workspaceMemberId}:${cursor.jy}-${cursor.jm}`,
    fetchAll,
  );

  const tasks = data ?? [];
  const effectiveTasks = useMemo(
    () =>
      tasks.map((task) =>
        overrides[task.id] ? { ...task, dueAt: overrides[task.id] } : task,
      ),
    [tasks, overrides],
  );

  const tasksByDate = useMemo(() => groupTasksByDate(effectiveTasks), [effectiveTasks]);

  const handleDropTask = useCallback(
    async (taskId: string, newDateIso: string) => {
      const task = effectiveTasks.find((t) => t.id === taskId);
      if (!task?.dueAt) return;
      const original = new Date(task.dueAt);
      const [y, m, d] = newDateIso.split('-').map(Number);
      const next = new Date(original);
      next.setFullYear(y, m - 1, d);
      const nextIso = next.toISOString();
      if (nextIso === task.dueAt) return;

      setOverrides((prev) => ({ ...prev, [taskId]: nextIso }));
      try {
        await updateTask(taskId, { dueAt: nextIso });
        await refresh();
        setOverrides((prev) => {
          const cleared = { ...prev };
          delete cleared[taskId];
          return cleared;
        });
      } catch (err) {
        setOverrides((prev) => {
          const cleared = { ...prev };
          delete cleared[taskId];
          return cleared;
        });
        setDropError(err instanceof Error ? err.message : T2.calendarRescheduleFailed);
      }
    },
    [effectiveTasks, refresh],
  );

  const goToday = () => {
    setCursor({ jy: currentJalali.jy, jm: currentJalali.jm });
    setSelectedDate(todayDateKey());
  };
  const goPrev = () => {
    setCursor((c) => addJalaliMonths(c.jy, c.jm, -1));
    setSelectedDate(null);
  };
  const goNext = () => {
    setCursor((c) => addJalaliMonths(c.jy, c.jm, 1));
    setSelectedDate(null);
  };

  const selectedTasks = selectedDate
    ? [...(tasksByDate.get(selectedDate) ?? [])].sort((a, b) =>
        (a.dueAt ?? '').localeCompare(b.dueAt ?? ''),
      )
    : [];

  const loading = data === null && error === null;

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>{T2.calendar}</h1>
          <div className="sub">
            {AFGHAN_MONTHS[cursor.jm - 1]} {toPersianDigits(cursor.jy)}
          </div>
        </div>
        <div className="cal-nav">
          <button className="btn line sm" onClick={goPrev}>
            {T2.calendarPrevMonth}
          </button>
          <button className="btn line sm" onClick={goToday}>
            {T2.calendarToday}
          </button>
          <button className="btn line sm" onClick={goNext}>
            {T2.calendarNextMonth}
          </button>
        </div>
      </div>

      {error !== null && <div className="error-banner">{error}</div>}
      {dropError !== null && <div className="error-banner">{dropError}</div>}

      {loading ? (
        <div className="skeleton" style={{ height: 480 }} />
      ) : (
        <CalendarGrid
          cells={cells}
          tasksByDate={tasksByDate}
          selectedDate={selectedDate}
          onSelectDay={setSelectedDate}
          onDropTask={handleDropTask}
        />
      )}

      {selectedDate && (
        <div className="card anim d2" style={{ marginTop: 16 }}>
          <div className="card-pad" style={{ paddingBottom: 6 }}>
            <h3>
              {formatJalaliDate(`${selectedDate}T12:00:00`)}{' '}
              <span className="num" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>
                ({toPersianDigits(selectedTasks.length)})
              </span>
            </h3>
          </div>
          {selectedTasks.length === 0 ? (
            <div className="empty-state">{T2.calendarNoTasksOnDay}</div>
          ) : (
            selectedTasks.map((task) => {
              const lead = taskLead(task);
              const TypeIcon = TASK_TYPE_ICONS[task.taskType ?? 'OTHER'] ?? IconCheck;
              return (
                <div className="task" key={task.id}>
                  <span
                    className="chk"
                    style={
                      task.status === 'DONE'
                        ? {
                            background: 'var(--ok-bg)',
                            borderColor: 'var(--ok)',
                            color: 'var(--ok)',
                            cursor: 'default',
                          }
                        : { cursor: 'default', color: 'transparent' }
                    }
                  >
                    <IconCheck size={13} />
                  </span>
                  <div className="t-main" onClick={() => navigate(`/task/${task.id}`)}>
                    <div
                      className="t-title"
                      style={{ display: 'flex', alignItems: 'center', gap: 7 }}
                    >
                      <span
                        style={{
                          color: 'var(--lapis-600)',
                          display: 'inline-flex',
                          flexShrink: 0,
                        }}
                      >
                        <TypeIcon size={14} />
                      </span>
                      {task.title}
                    </div>
                    <div className="t-sub">
                      {task.taskType && (
                        <span className="pill stage" style={{ fontSize: 10.5, padding: '1px 8px' }}>
                          {TASK_TYPE_LABELS[task.taskType]}
                        </span>
                      )}
                      {lead ? <span className="lead-chip">{lead.name}</span> : <span>{T.noLead}</span>}
                    </div>
                  </div>
                  <span className="due later">{relativeDueLabel(task.dueAt)}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </main>
  );
};
