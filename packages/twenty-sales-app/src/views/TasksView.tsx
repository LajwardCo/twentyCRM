import { useCallback, useMemo, useState } from 'react';

import { fetchMembers } from '../api/admin';
import { type CurrentUser } from '../api/auth';
import {
  fetchDoneTasksSince,
  fetchAllOpenTasks,
  setTaskStatus,
  type DoneTask,
  type Task,
  type TaskType,
} from '../api/records';
import { FilterBar } from '../components/FilterBar';
import { IconCheck } from '../components/icons';
import { useCached } from '../lib/cache';
import { applyFilters } from '../lib/filters';
import { endOfToday, startOfToday } from '../lib/format';
import { formatJalaliDate, relativeDueLabel, toPersianDigits } from '../lib/jalali';
import { navigate, useRoute } from '../lib/router';
import { taskFilterFields } from '../lib/screenFilters';
import { T, T7, TASK_TYPE_LABELS } from '../lib/strings';
import { useFilters } from '../lib/useFilters';
import { TASK_TYPE_ICONS } from './TaskView';

type TasksViewProps = {
  user: CurrentUser;
};

type Bucket = {
  key: string;
  title: string;
  accent?: 'over' | 'today';
  tasks: Task[];
};

const taskLead = (task: Task) => {
  const targets = task.taskTargets?.edges ?? [];
  for (const { node } of targets) {
    if (node.opportunity) return node.opportunity;
  }
  return null;
};

const bucketize = (tasks: Task[]): Bucket[] => {
  const sod = startOfToday();
  const eod = endOfToday();
  const tomorrowEnd = new Date(eod);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  const weekEnd = new Date(eod);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const buckets: Bucket[] = [
    { key: 'overdue', title: 'عقب‌مانده', accent: 'over', tasks: [] },
    { key: 'today', title: 'امروز', accent: 'today', tasks: [] },
    { key: 'tomorrow', title: 'فردا', tasks: [] },
    { key: 'week', title: 'این هفته', tasks: [] },
    { key: 'later', title: 'بعداً', tasks: [] },
    { key: 'nodate', title: 'بدون موعد', tasks: [] },
  ];

  for (const task of tasks) {
    if (!task.dueAt) {
      buckets[5].tasks.push(task);
      continue;
    }
    const due = new Date(task.dueAt);
    if (due < sod) buckets[0].tasks.push(task);
    else if (due <= eod) buckets[1].tasks.push(task);
    else if (due <= tomorrowEnd) buckets[2].tasks.push(task);
    else if (due <= weekEnd) buckets[3].tasks.push(task);
    else buckets[4].tasks.push(task);
  }
  return buckets.filter((b) => b.tasks.length > 0);
};

const TYPE_FILTERS: (TaskType | 'ALL')[] = [
  'ALL',
  'CALL',
  'MEETING',
  'DEMO',
  'VISIT',
  'OTHER',
];

export const TasksView = ({ user }: TasksViewProps) => {
  const [typeFilter, setTypeFilter] = useState<TaskType | 'ALL'>('ALL');
  const [statusTab, setStatusTab] = useState<'open' | 'done'>('open');
  // Admins can widen the view to every seller's tasks; sellers stay scoped to
  // their own. The server still row-filters by permission either way.
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const allScope = user.isAdmin && scope === 'all';
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [doneNow, setDoneNow] = useState(0);

  const fetchAll = useCallback(async () => {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const assigneeId = allScope ? null : user.workspaceMemberId;
    // The tasks screen is the seller's whole backlog, so it follows the
    // cursor rather than stopping at one page.
    const [open, done] = await Promise.all([
      fetchAllOpenTasks(assigneeId),
      fetchDoneTasksSince(since.toISOString(), assigneeId ?? undefined),
    ]);
    return { open: open.items, done };
  }, [user.workspaceMemberId, allScope]);

  const { data, error, refresh } = useCached(
    `tasks:${allScope ? 'all' : user.workspaceMemberId}`,
    fetchAll,
  );

  // Assignees only matter when the list can hold more than one seller's tasks.
  const { data: members } = useCached('members', () =>
    allScope ? fetchMembers().catch(() => []) : Promise.resolve([]),
  );

  const fields = useMemo(() => taskFilterFields(members ?? []), [members]);
  const route = useRoute();
  const filters = useFilters('tasks', fields, route.query);

  // The whole backlog is already in memory, so the sheet filters it here
  // rather than paying a round trip per change.
  const openTasks = useMemo(
    () =>
      applyFilters<Task>(
        fields,
        filters.state,
        (data?.open ?? []).filter(
          (t) =>
            !removed.has(t.id) &&
            (typeFilter === 'ALL' || (t.taskType ?? 'OTHER') === typeFilter),
        ),
      ),
    [data, removed, typeFilter, fields, filters.state],
  );

  const doneTasks = useMemo(
    () => applyFilters<DoneTask>(fields, filters.state, data?.done ?? []),
    [data, fields, filters.state],
  );

  const buckets = useMemo(() => bucketize(openTasks), [openTasks]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of data?.open ?? []) {
      if (removed.has(t.id)) continue;
      const key = t.taskType ?? 'OTHER';
      counts[key] = (counts[key] ?? 0) + 1;
      counts.ALL = (counts.ALL ?? 0) + 1;
    }
    return counts;
  }, [data, removed]);

  const markDone = async (task: Task) => {
    setLeaving((prev) => new Set(prev).add(task.id));
    setDoneNow((c) => c + 1);
    setTimeout(() => {
      setRemoved((prev) => new Set(prev).add(task.id));
      setLeaving((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }, 330);
    try {
      await setTaskStatus(task.id, 'DONE');
      await refresh();
    } catch {
      setDoneNow((c) => c - 1);
      setRemoved((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
      void refresh();
    }
  };

  const loading = data === null && error === null;

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>{allScope ? 'همه کارها' : 'کارهای من'}</h1>
          <div className="sub">
            {data !== null &&
              `${toPersianDigits(typeCounts.ALL ?? 0)} کار باز${
                doneNow > 0 ? ` · ${toPersianDigits(doneNow)} همین حالا انجام شد` : ''
              }`}
          </div>
        </div>
        <button className="btn gold" onClick={() => navigate('/new')}>
          ＋ {T.newLead}
        </button>
      </div>

      <div className="toolbar anim d1">
        {user.isAdmin && (
          <div className="seg">
            <button className={scope === 'mine' ? 'on' : ''} onClick={() => setScope('mine')}>
              کارهای من
            </button>
            <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>
              همه کارها
            </button>
          </div>
        )}
        <div className="seg">
          <button className={statusTab === 'open' ? 'on' : ''} onClick={() => setStatusTab('open')}>
            باز {data !== null && toPersianDigits(typeCounts.ALL ?? 0)}
          </button>
          <button className={statusTab === 'done' ? 'on' : ''} onClick={() => setStatusTab('done')}>
            تکمیل‌شده
          </button>
        </div>
        {statusTab === 'open' && (
          <div className="seg">
            {TYPE_FILTERS.map((type) => {
              const Icon = type === 'ALL' ? null : TASK_TYPE_ICONS[type];
              return (
                <button
                  key={type}
                  className={typeFilter === type ? 'on' : ''}
                  onClick={() => setTypeFilter(type)}
                >
                  {Icon && <Icon size={13} />}
                  {type === 'ALL' ? 'همه' : TASK_TYPE_LABELS[type]}
                  {(typeCounts[type] ?? 0) > 0 && type !== 'ALL' && (
                    <span className="num" style={{ opacity: 0.7 }}>
                      {toPersianDigits(typeCounts[type])}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        <FilterBar
          fields={fields}
          filters={filters}
          resultCount={statusTab === 'open' ? openTasks.length : doneTasks.length}
        />
      </div>

      {error !== null && <div className="error-banner">{error}</div>}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 52 }} />
          ))}
        </div>
      )}

      {statusTab === 'open' && data !== null && buckets.length === 0 && (
        <div className="empty-state">
          {filters.count > 0 ? (
            <>
              {T7.noMatches}
              <div style={{ marginTop: 10 }}>
                <button className="btn line sm" onClick={filters.clearAll}>
                  {T7.clearAll}
                </button>
              </div>
            </>
          ) : (
            `${T.allCaughtUp} 🎉`
          )}
        </div>
      )}

      {statusTab === 'open' &&
        buckets.map((bucket, bucketIndex) => (
          <div className={`card anim d${Math.min(bucketIndex + 1, 5)}`} key={bucket.key} style={{ marginBottom: 14 }}>
            <div className="card-pad" style={{ paddingBottom: 6 }}>
              <h3
                style={
                  bucket.accent === 'over'
                    ? { color: 'var(--hot)' }
                    : bucket.accent === 'today'
                      ? { color: 'var(--warm)' }
                      : undefined
                }
              >
                {bucket.title}{' '}
                <span className="num" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>
                  ({toPersianDigits(bucket.tasks.length)})
                </span>
              </h3>
            </div>
            {bucket.tasks.map((task) => {
              const lead = taskLead(task);
              const TypeIcon = TASK_TYPE_ICONS[task.taskType ?? 'OTHER'] ?? IconCheck;
              return (
                <div className={`task ${leaving.has(task.id) ? 'leaving' : ''}`} key={task.id}>
                  <button
                    className="chk"
                    aria-label={T.markDone}
                    onClick={() => markDone(task)}
                  >
                    <IconCheck size={13} />
                  </button>
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
                      {allScope && task.assignee && (
                        <span className="pill" style={{ fontSize: 10.5, padding: '1px 8px' }}>
                          {task.assignee.name.firstName} {task.assignee.name.lastName}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`due ${bucket.accent === 'over' ? 'over' : bucket.accent === 'today' ? 'today' : 'later'}`}>
                    {relativeDueLabel(task.dueAt)}
                  </span>
                </div>
              );
            })}
          </div>
        ))}

      {statusTab === 'done' && data !== null && (
        <div className="card anim d1">
          <div className="card-pad" style={{ paddingBottom: 6 }}>
            <h3>
              تکمیل‌شده — ۳۰ روز اخیر{' '}
              <span className="num" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>
                ({toPersianDigits(doneTasks.length)})
              </span>
            </h3>
          </div>
          {doneTasks.length === 0 && (
            <div className="empty-state">
              {filters.count > 0 ? T7.noMatches : T.noActivity}
            </div>
          )}
          {doneTasks.map((task) => (
            <div className="task" key={task.id}>
              <span
                className="chk"
                style={{
                  background: 'var(--ok-bg)',
                  borderColor: 'var(--ok)',
                  color: 'var(--ok)',
                  cursor: 'default',
                }}
              >
                <IconCheck size={13} />
              </span>
              <div className="t-main" onClick={() => navigate(`/task/${task.id}`)}>
                <div className="t-title" style={{ color: 'var(--ink-3)' }}>{task.title}</div>
              </div>
              <span className="due later num">{formatJalaliDate(task.updatedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
};
