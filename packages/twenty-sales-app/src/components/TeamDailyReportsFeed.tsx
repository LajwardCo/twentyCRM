import { useState } from 'react';

import { fetchMembers } from '../api/admin';
import { fetchTeamDailyReports, reportDateKeyFor } from '../api/dailyReports';
import { useCached } from '../lib/cache';
import { formatJalaliDate, formatJalaliDateTime, toPersianDigits } from '../lib/jalali';
import { T3 } from '../lib/strings';

const fetchTeamData = async (reportDateIso: string) => {
  const [reports, members] = await Promise.all([
    fetchTeamDailyReports(reportDateIso),
    fetchMembers(),
  ]);
  return { reports, members };
};

export const TeamDailyReportsFeed = () => {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const dateKey = reportDateKeyFor(selectedDate);
  const isToday = dateKey === reportDateKeyFor(new Date());

  const { data, error } = useCached(`daily-report-team:${dateKey}`, () =>
    fetchTeamData(dateKey),
  );

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reports = data?.reports ?? [];
  const submittedSellerIds = new Set(
    reports.map((r) => r.seller?.id).filter((id): id is string => Boolean(id)),
  );
  const notSubmitted = (data?.members ?? []).filter((m) => !submittedSellerIds.has(m.id));
  const loading = data === null && error === null;

  return (
    <div>
      <div className="toolbar anim d2">
        <div className="fld" style={{ marginBottom: 0, maxWidth: 220 }}>
          <input
            type="date"
            value={localDateInputValue(selectedDate)}
            onChange={(e) => setSelectedDate(new Date(`${e.target.value}T00:00:00`))}
          />
        </div>
        <span className="sub">{formatJalaliDate(selectedDate.toISOString())}</span>
      </div>

      {error !== null && <div className="error-banner">{error}</div>}

      {isToday && !loading && (
        <div className="card card-pad anim d2" style={{ marginBottom: 16 }}>
          <h3>{notSubmitted.length === 0 ? T3.everyoneSubmitted : T3.notSubmittedYet}</h3>
          {notSubmitted.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {notSubmitted.map((m) => (
                <span className="pill stage" key={m.id}>
                  {m.name.firstName} {m.name.lastName}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 64 }} />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="empty-state">{T3.noReportsForDate}</div>
      ) : (
        reports.map((r) => (
          <div
            className="card card-pad anim"
            key={r.id}
            style={{ marginBottom: 10, cursor: 'pointer' }}
            onClick={() => toggle(r.id)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="avatar av-26">{r.seller?.name.firstName.charAt(0) ?? '؟'}</span>
                <div>
                  <div style={{ fontWeight: 750 }}>
                    {r.seller ? `${r.seller.name.firstName} ${r.seller.name.lastName}` : '—'}
                  </div>
                  <div className="sub">{formatJalaliDateTime(r.submittedAt)}</div>
                </div>
              </div>
              <span className="pill stage num">
                {toPersianDigits(r.tasksDoneCount ?? 0)} {T3.tasksDoneBadge}
              </span>
            </div>
            {expanded.has(r.id) && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <div className="sub">{T3.whatIDidToday}</div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{r.summary || '—'}</div>
                </div>
                <div>
                  <div className="sub">{T3.tomorrowPlanLabel}</div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{r.tomorrowPlan || '—'}</div>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};

// Local (not UTC) YYYY-MM-DD for the date input — matches toLocalInputValue's
// convention in lib/format.ts, just date-only.
const localDateInputValue = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
