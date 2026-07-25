import { useCallback, useMemo, useState } from 'react';

import { useCached } from '../lib/cache';

import { type CurrentUser } from '../api/auth';
import {
  fetchLeads,
  fetchMyOpenTasks,
  OPEN_STAGES,
  setTaskStatus,
  type Task,
} from '../api/records';
import {
  IconCheck,
  IconClock,
  IconFlame,
  IconMoney,
  IconTasks,
} from '../components/icons';
import { endOfToday, formatAfn, formatMoney, startOfToday, sumAmountMicros } from '../lib/format';
import { relativeDueLabel, toPersianDigits } from '../lib/jalali';
import { navigate } from '../lib/router';
import { STAGE_LABELS, T, TASK_TYPE_LABELS } from '../lib/strings';
import { TASK_TYPE_ICONS } from './TaskView';

type TodayViewProps = {
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

const dueClass = (task: Task): string => {
  if (!task.dueAt) return 'later';
  const due = new Date(task.dueAt);
  if (due < startOfToday()) return 'over';
  if (due <= endOfToday()) return 'today';
  return 'later';
};

const TaskRow = ({
  task,
  leaving,
  onDone,
}: {
  task: Task;
  leaving: boolean;
  onDone: (task: Task) => void;
}) => {
  const lead = taskLead(task);
  const TypeIcon = TASK_TYPE_ICONS[task.taskType ?? 'OTHER'] ?? IconCheck;
  return (
    <div className={`task ${leaving ? 'leaving' : ''}`}>
      <button className="chk" aria-label={T.markDone} onClick={() => onDone(task)}>
        <IconCheck size={13} />
      </button>
      <div className="t-main" onClick={() => navigate(`/task/${task.id}`)}>
        <div className="t-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ color: 'var(--lapis-600)', display: 'inline-flex', flexShrink: 0 }}>
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
          {lead ? (
            <span className="lead-chip">{lead.name}</span>
          ) : (
            <span>{T.noLead}</span>
          )}
        </div>
      </div>
      <span className={`due ${dueClass(task)}`}>
        {relativeDueLabel(task.dueAt)}
        {task.dueAt && dueClass(task) === 'today'
          ? ` ${toPersianDigits(
              `${String(new Date(task.dueAt).getHours()).padStart(2, '0')}:${String(
                new Date(task.dueAt).getMinutes(),
              ).padStart(2, '0')}`,
            )}`
          : ''}
      </span>
    </div>
  );
};

const SkeletonRows = () => (
  <div style={{ padding: '8px 18px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="skeleton" style={{ height: 44 }} />
    ))}
  </div>
);

type TaskFilter = 'all' | 'overdue' | 'today';

export const TodayView = ({ user }: TodayViewProps) => {
  const [doneCount, setDoneCount] = useState(0);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<TaskFilter>('all');

  const fetchAll = useCallback(async () => {
    const eod = endOfToday().toISOString();
    const [dueNow, upcoming, myLeads] = await Promise.all([
      fetchMyOpenTasks(user.workspaceMemberId, { dueBefore: eod }),
      fetchMyOpenTasks(user.workspaceMemberId, { dueAfter: eod, limit: 8 }),
      fetchLeads({ ownerId: user.workspaceMemberId, limit: 200 }),
    ]);
    return { tasks: [...dueNow, ...upcoming], leads: myLeads };
  }, [user.workspaceMemberId]);

  const { data, error, refresh } = useCached(
    `today:${user.workspaceMemberId}`,
    fetchAll,
  );

  const tasks = data ? data.tasks.filter((t) => !removed.has(t.id)) : null;
  const leads = data?.leads ?? null;

  const markDone = async (task: Task) => {
    setLeaving((prev) => new Set(prev).add(task.id));
    setDoneCount((c) => c + 1);
    // let the leave animation play before removing from the list
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
      setDoneCount((c) => c - 1);
      setRemoved((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
      void refresh();
    }
  };

  const sod = startOfToday();
  const eod = endOfToday();
  const overdue = tasks?.filter((t) => t.dueAt && new Date(t.dueAt) < sod) ?? [];
  const today =
    tasks?.filter(
      (t) => t.dueAt && new Date(t.dueAt) >= sod && new Date(t.dueAt) <= eod,
    ) ?? [];
  const upcoming = tasks?.filter((t) => !t.dueAt || new Date(t.dueAt) > eod) ?? [];

  const visibleTasks =
    filter === 'overdue' ? overdue : filter === 'today' ? today : [...overdue, ...today, ...upcoming];

  const openLeads = useMemo(
    () => (leads ?? []).filter((l) => l.stage && OPEN_STAGES.includes(l.stage)),
    [leads],
  );
  const hotWarm = openLeads.filter(
    (l) => l.temperature === 'HOT' || l.temperature === 'WARM',
  );
  const pipelineValue = sumAmountMicros(openLeads);

  const funnel = useMemo(() => {
    const groups = [...OPEN_STAGES.slice(0, 5), 'ACTIVE_CUSTOMER'];
    const counts = groups.map((stage) => {
      const inStage = (leads ?? []).filter((l) => l.stage === stage);
      return {
        stage,
        count: inStage.length,
        value: sumAmountMicros(inStage),
      };
    });
    const max = Math.max(1, ...counts.map((c) => c.count));
    return counts.map((c) => ({ ...c, pct: Math.round((c.count / max) * 100) }));
  }, [leads]);

  const topDeals = useMemo(
    () =>
      [...openLeads]
        .filter((l) => (l.amount?.amountMicros ?? 0) > 0)
        .sort((a, b) => (b.amount?.amountMicros ?? 0) - (a.amount?.amountMicros ?? 0))
        .slice(0, 4),
    [openLeads],
  );
  const hotLeads = openLeads.filter((l) => l.temperature === 'HOT').slice(0, 4);
  const sideDeals = topDeals.length > 0 ? topDeals : hotLeads;

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? T.goodMorning : hour < 17 ? T.goodAfternoon : T.goodEvening;

  const loading = tasks === null && error === null;

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>
            {greeting}، {user.firstName}
          </h1>
          <div className="sub">
            {tasks !== null
              ? `امروز ${toPersianDigits(overdue.length + today.length)} کار در پیش داری${
                  overdue.length > 0
                    ? ` — ${toPersianDigits(overdue.length)} کار عقب‌مانده اول`
                    : ''
                }`
              : '…'}
          </div>
        </div>
      </div>

      {error !== null && <div className="error-banner">{error}</div>}

      <div className="stats">
        <div className="card hoverable kpi anim d1">
          <div className="top">
            <span className="k-ico blue">
              <IconTasks size={17} />
            </span>
            <span className="lbl">کار برای امروز</span>
          </div>
          <div className="row">
            {loading ? (
              <div className="skeleton" style={{ width: 50, height: 30 }} />
            ) : (
              <span className="big num">
                {toPersianDigits(overdue.length + today.length)}
              </span>
            )}
            {doneCount > 0 && (
              <span className="hint up">{toPersianDigits(doneCount)} {T.doneNow}</span>
            )}
          </div>
        </div>
        <div className="card hoverable kpi anim d2">
          <div className="top">
            <span className="k-ico red">
              <IconClock size={17} />
            </span>
            <span className="lbl">{T.overdue}</span>
          </div>
          <div className="row">
            {loading ? (
              <div className="skeleton" style={{ width: 50, height: 30 }} />
            ) : (
              <span
                className="big num"
                style={overdue.length > 0 ? { color: 'var(--hot)' } : undefined}
              >
                {toPersianDigits(overdue.length)}
              </span>
            )}
          </div>
        </div>
        <div className="card hoverable kpi anim d3">
          <div className="top">
            <span className="k-ico amber">
              <IconFlame size={17} />
            </span>
            <span className="lbl">لید داغ و گرم</span>
          </div>
          <div className="row">
            {leads === null ? (
              <div className="skeleton" style={{ width: 50, height: 30 }} />
            ) : (
              <span className="big num">{toPersianDigits(hotWarm.length)}</span>
            )}
          </div>
        </div>
        <div className="card hoverable kpi anim d4">
          <div className="top">
            <span className="k-ico green">
              <IconMoney size={17} />
            </span>
            <span className="lbl">ارزش قیف باز</span>
          </div>
          <div className="row">
            {leads === null ? (
              <div className="skeleton" style={{ width: 70, height: 30 }} />
            ) : (
              <span className="big num">{formatAfn(pipelineValue)}</span>
            )}
            <span className="hint">
              {leads === null ? '' : `${toPersianDigits(openLeads.length)} لید باز`}
            </span>
          </div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="stack">
          <div className="card anim d2">
            <div
              className="card-pad"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 10,
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div>
                <h3>{T.todayTasks}</h3>
                <div className="sub">
                  {tasks !== null &&
                    `${toPersianDigits(overdue.length)} عقب‌مانده · ${toPersianDigits(today.length)} برای امروز`}
                </div>
              </div>
              <div className="tab-row">
                <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
                  همه {tasks !== null && toPersianDigits(tasks.length)}
                </button>
                <button
                  className={filter === 'overdue' ? 'on' : ''}
                  onClick={() => setFilter('overdue')}
                >
                  {T.overdue} {toPersianDigits(overdue.length)}
                </button>
                <button
                  className={filter === 'today' ? 'on' : ''}
                  onClick={() => setFilter('today')}
                >
                  {T.today} {toPersianDigits(today.length)}
                </button>
              </div>
            </div>
            {loading ? (
              <SkeletonRows />
            ) : visibleTasks.length === 0 ? (
              <div className="empty-state">{T.nothingToday}</div>
            ) : (
              visibleTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  leaving={leaving.has(t.id)}
                  onDone={markDone}
                />
              ))
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card card-pad anim d3">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>قیف فروش</h3>
              <span className="sub">لیدهای شما</span>
            </div>
            {leads === null ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="skeleton" style={{ height: 20 }} />
                ))}
              </div>
            ) : (
              <div className="funnel">
                {funnel.map((f) => (
                  <div
                    key={f.stage}
                    className={`f-row ${f.stage === 'ACTIVE_CUSTOMER' ? 'won' : ''}`}
                  >
                    <span className="f-lbl">{STAGE_LABELS[f.stage] ?? f.stage}</span>
                    <div className="f-bar">
                      <i style={{ width: `${f.pct}%` }} />
                    </div>
                    <span className="f-meta num">
                      <b>{toPersianDigits(f.count)}</b>
                      {f.value > 0 ? ` · ${formatAfn(f.value)}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card anim d4">
            <div
              className="card-pad"
              style={{
                paddingBottom: 8,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3>{topDeals.length > 0 ? 'معاملات مهم' : 'لیدهای داغ 🔥'}</h3>
              <button
                className="lead-chip"
                style={{ fontSize: 12, background: 'none', border: 0, cursor: 'pointer' }}
                onClick={() => navigate('/leads')}
              >
                همه ←
              </button>
            </div>
            {leads === null ? (
              <SkeletonRows />
            ) : sideDeals.length === 0 ? (
              <div className="empty-state">{T.noLeadsFound}</div>
            ) : (
              sideDeals.map((lead) => (
                <div
                  key={lead.id}
                  className="deal-row"
                  onClick={() => navigate(`/lead/${lead.id}`)}
                >
                  <span className="deal-logo">{lead.name.charAt(0)}</span>
                  <div className="deal-main">
                    <div className="deal-name">{lead.name}</div>
                    <div className="deal-sub">
                      {STAGE_LABELS[lead.stage ?? ''] ?? lead.stage}
                      {lead.temperature === 'HOT' && (
                        <span style={{ color: 'var(--hot)' }}> · داغ</span>
                      )}
                    </div>
                  </div>
                  {(lead.amount?.amountMicros ?? 0) > 0 && (
                    <span className="deal-val num">
                      {formatMoney(lead.amount?.amountMicros, lead.amount?.currencyCode)}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
};
