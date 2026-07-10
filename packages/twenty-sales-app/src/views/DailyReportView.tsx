import { useMemo, useState } from 'react';

import { type CurrentUser } from '../api/auth';
import { TeamDailyReportsFeed } from '../components/TeamDailyReportsFeed';
import {
  fetchMyDailyReportForDate,
  fetchMyDailyReports,
  reportDateKeyFor,
  upsertDailyReport,
} from '../api/dailyReports';
import { fetchDoneTasksSince, fetchMyOpenTasks } from '../api/records';
import { invalidateCache, useCached } from '../lib/cache';
import {
  draftPlanFromUpcomingTasks,
  draftSummaryFromDoneTasks,
} from '../lib/dailyReportDraft';
import { endOfToday, endOfTomorrow, startOfToday } from '../lib/format';
import { formatJalaliDate, formatJalaliDateTime, toPersianDigits } from '../lib/jalali';
import { T3 } from '../lib/strings';

type DailyReportViewProps = {
  user: CurrentUser;
};

type Scope = 'mine' | 'team';

const fetchMineData = async (sellerId: string) => {
  const todayKey = reportDateKeyFor(new Date());
  const [existing, doneToday, upcomingTomorrow, history] = await Promise.all([
    fetchMyDailyReportForDate(sellerId, todayKey),
    fetchDoneTasksSince(startOfToday().toISOString(), sellerId),
    fetchMyOpenTasks(sellerId, {
      dueAfter: endOfToday().toISOString(),
      dueBefore: endOfTomorrow().toISOString(),
    }),
    fetchMyDailyReports(sellerId, 14),
  ]);
  return { existing, doneToday, upcomingTomorrow, history, todayKey };
};

export const DailyReportView = ({ user }: DailyReportViewProps) => {
  const [scope, setScope] = useState<Scope>('mine');

  const { data, error, refresh } = useCached(
    `daily-report-mine:${user.workspaceMemberId}`,
    () => fetchMineData(user.workspaceMemberId),
  );

  const [summary, setSummary] = useState<string | null>(null);
  const [tomorrowPlan, setTomorrowPlan] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const draftSummary = useMemo(
    () => draftSummaryFromDoneTasks(data?.doneToday ?? []),
    [data?.doneToday],
  );
  const draftPlan = useMemo(
    () => draftPlanFromUpcomingTasks(data?.upcomingTomorrow ?? []),
    [data?.upcomingTomorrow],
  );

  const summaryValue = summary ?? data?.existing?.summary ?? draftSummary;
  const tomorrowPlanValue = tomorrowPlan ?? data?.existing?.tomorrowPlan ?? draftPlan;

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  };

  const submit = async () => {
    if (!data) return;
    setSaving(true);
    setSubmitError(null);
    try {
      await upsertDailyReport({
        id: data.existing?.id,
        sellerId: user.workspaceMemberId,
        reportDate: data.todayKey,
        summary: summaryValue.trim(),
        tomorrowPlan: tomorrowPlanValue.trim(),
        tasksDoneCount: data.doneToday.length,
      });
      invalidateCache('daily-report-mine:');
      invalidateCache('daily-report-team:');
      showToast(T3.reportSubmitted);
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : T3.reportSubmitFailed;
      setSubmitError(message);
      showToast(message);
    } finally {
      setSaving(false);
    }
  };

  const regenerate = () => {
    setSummary(draftSummary);
    setTomorrowPlan(draftPlan);
  };

  const loading = data === null && error === null;

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>{T3.dailyReport}</h1>
          <div className="sub">{formatJalaliDate(new Date().toISOString())}</div>
        </div>
      </div>

      <div className="toolbar anim d1">
        <div className="seg">
          <button className={scope === 'mine' ? 'on' : ''} onClick={() => setScope('mine')}>
            {T3.mine}
          </button>
          <button className={scope === 'team' ? 'on' : ''} onClick={() => setScope('team')}>
            {T3.team}
          </button>
        </div>
      </div>

      {error !== null && <div className="error-banner">{error}</div>}
      {submitError !== null && (
        <div className="error-banner" style={{ marginTop: 8 }}>{submitError}</div>
      )}

      {scope === 'team' ? (
        <TeamDailyReportsFeed />
      ) : loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="skeleton" style={{ height: 200 }} />
          <div className="skeleton" style={{ height: 160 }} />
        </div>
      ) : (
        <>
          <div className="card card-pad anim d2">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>{T3.whatIDidToday}</h3>
              <button className="btn line sm" onClick={regenerate}>
                {T3.regenerateDraft}
              </button>
            </div>
            <div className="sub" style={{ marginBottom: 8 }}>{T3.whatIDidTodayHint}</div>
            <div className="fld" style={{ marginBottom: 0 }}>
              <textarea
                style={{ minHeight: 140 }}
                value={summaryValue}
                onChange={(e) => setSummary(e.target.value)}
              />
            </div>
          </div>

          <div className="card card-pad anim d3" style={{ marginTop: 16 }}>
            <h3>{T3.tomorrowPlanLabel}</h3>
            <div className="sub" style={{ marginBottom: 8 }}>{T3.tomorrowPlanHint}</div>
            <div className="fld" style={{ marginBottom: 0 }}>
              <textarea
                style={{ minHeight: 120 }}
                value={tomorrowPlanValue}
                onChange={(e) => setTomorrowPlan(e.target.value)}
              />
            </div>
          </div>

          <button
            className="btn gold block"
            style={{ padding: 12, marginTop: 16 }}
            disabled={saving}
            onClick={submit}
          >
            {saving ? T3.submitting : data?.existing ? T3.updateReport : T3.submitReport}
          </button>
          {data?.existing && (
            <div className="sub" style={{ marginTop: 8, textAlign: 'center' }}>
              {T3.lastUpdated}: {formatJalaliDateTime(data.existing.submittedAt)}
            </div>
          )}

          <div className="card anim d4" style={{ marginTop: 16 }}>
            <div
              className="card-pad"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
              onClick={() => setHistoryOpen((open) => !open)}
            >
              <h3>{T3.myReportHistory}</h3>
              <span className="sub">{historyOpen ? '▴' : '▾'}</span>
            </div>
            {historyOpen &&
              ((data?.history.length ?? 0) === 0 ? (
                <div className="empty-state">{T3.noReportsYet}</div>
              ) : (
                data?.history.map((r) => (
                  <div className="task" key={r.id}>
                    <div className="t-main" style={{ cursor: 'default' }}>
                      <div className="t-title">{formatJalaliDate(r.reportDate)}</div>
                      <div className="t-sub" style={{ whiteSpace: 'pre-wrap' }}>
                        {(r.summary ?? '').slice(0, 140)}
                      </div>
                    </div>
                    <span className="pill stage num">
                      {toPersianDigits(r.tasksDoneCount ?? 0)} {T3.tasksDoneBadge}
                    </span>
                  </div>
                ))
              ))}
          </div>
        </>
      )}

      {toast !== null && <div className="toast">{toast}</div>}
    </main>
  );
};
