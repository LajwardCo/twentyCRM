import { useEffect, useMemo, useState } from 'react';

import { fetchAiUsage, type AiUsageResult } from '../api/aiUsage';
import type { CurrentUser } from '../api/auth';
import { IconRefresh } from '../components/icons';
import { Bars } from '../components/reports/ReportPrimitives';
import { ReportKpis } from '../components/reports/ReportKpis';
import {
  AI_USAGE_RANGES,
  buildUsageSeries,
  formatShare,
  formatTokensCompact,
  formatTokensExact,
  formatUsd,
  rangeBounds,
  type AiUsageRangeKey,
} from '../lib/aiUsage';
import { TAI } from '../lib/assistantStrings';
import { formatJalaliDate, formatJalaliDateTime, toPersianDigits } from '../lib/jalali';

// Who spent how many AI tokens: chat turns, lead summaries, call scripts and
// suggestions alike, read from the server's per-user ledger. Admin-only; the
// server enforces the same gate.

const RANGE_LABELS: Record<AiUsageRangeKey, string> = {
  today: TAI.rangeToday,
  '7d': TAI.range7d,
  '30d': TAI.range30d,
  '90d': TAI.range90d,
  '365d': TAI.range365d,
};

type AiUsageReportViewProps = { user: CurrentUser };

export const AiUsageReportView = ({ user }: AiUsageReportViewProps) => {
  const [range, setRange] = useState<AiUsageRangeKey>('30d');
  const [result, setResult] = useState<AiUsageResult | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!user.isAdmin) return;
    let cancelled = false;
    setResult(null);
    void fetchAiUsage('team', rangeBounds(range)).then((next) => {
      if (!cancelled) setResult(next);
    });
    return () => {
      cancelled = true;
    };
  }, [range, reloadKey, user.isAdmin]);

  const report = result?.status === 'ok' ? result.report : null;

  const series = useMemo(
    () => (report ? buildUsageSeries(report.daily, report.from, report.to) : []),
    [report],
  );

  const maxTokens = Math.max(1, ...(report?.users.map((row) => row.totalTokens) ?? []));

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>{TAI.usageTitle}</h1>
          <div className="sub">{TAI.usageSub}</div>
        </div>
        {user.isAdmin && (
          <button
            className="btn line sm"
            onClick={() => setReloadKey((key) => key + 1)}
            aria-label={TAI.refresh}
          >
            <IconRefresh size={15} />
            {TAI.refresh}
          </button>
        )}
      </div>

      {!user.isAdmin || result?.status === 'forbidden' ? (
        <div className="empty-state">{TAI.forbidden}</div>
      ) : (
        <>
          <div className="toolbar anim d1">
            <div className="seg">
              {AI_USAGE_RANGES.map(({ key }) => (
                <button
                  key={key}
                  className={range === key ? 'on' : ''}
                  onClick={() => setRange(key)}
                >
                  {RANGE_LABELS[key]}
                </button>
              ))}
            </div>
          </div>

          {result === null && (
            <div style={{ display: 'grid', gap: 14 }}>
              <div className="skeleton" style={{ height: 96 }} />
              <div className="skeleton" style={{ height: 180 }} />
              <div className="skeleton" style={{ height: 260 }} />
            </div>
          )}

          {result?.status === 'unsupported' && (
            <div className="empty-state">{TAI.unsupported}</div>
          )}

          {result?.status === 'error' && (
            <div className="error-banner">{TAI.usageLoadFailed}</div>
          )}

          {report !== null && (
            <>
              <ReportKpis
                kpis={[
                  {
                    label: TAI.kpiTotal,
                    value: formatTokensCompact(report.totals.totalTokens),
                    hint: `${TAI.colChat} ${formatTokensCompact(report.totals.chatTokens)} · ${TAI.colOther} ${formatTokensCompact(report.totals.otherTokens)}`,
                  },
                  {
                    label: TAI.kpiRequests,
                    value: formatTokensExact(report.totals.requests),
                  },
                  {
                    label: TAI.kpiUsers,
                    value: toPersianDigits(report.totals.users),
                  },
                  {
                    label: TAI.kpiCost,
                    value: formatUsd(report.totals.costUsd),
                  },
                ]}
              />

              <section className="card card-pad anim d2" style={{ marginTop: 14 }}>
                <h3 style={{ margin: '0 0 6px' }}>{TAI.trend}</h3>
                <Bars series={series} formatValue={formatTokensCompact} />
              </section>

              <section className="card anim d3" style={{ marginTop: 14 }}>
                <div className="card-pad" style={{ paddingBottom: 0 }}>
                  <h3 style={{ margin: 0 }}>{TAI.byUser}</h3>
                </div>
                {report.users.length === 0 ? (
                  <div className="empty-state">{TAI.noUsage}</div>
                ) : (
                  <div className="rpt-table-wrap">
                    <table className="leads rpt-table ai-usage-table">
                      <thead>
                        <tr>
                          <th>{TAI.colUser}</th>
                          <th>{TAI.colTotal}</th>
                          <th>{TAI.colShare}</th>
                          <th>{TAI.colChat}</th>
                          <th>{TAI.colOther}</th>
                          <th>{TAI.colInput}</th>
                          <th>{TAI.colOutput}</th>
                          <th>{TAI.colRequests}</th>
                          <th>{TAI.colCost}</th>
                          <th>{TAI.colLastUsed}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.users.map((row) => (
                          <tr key={row.userWorkspaceId ?? 'system'}>
                            <td>
                              <b>
                                {row.userWorkspaceId === null
                                  ? TAI.systemUser
                                  : row.name || row.email || TAI.unknownUser}
                              </b>
                              {row.userWorkspaceId !== null && row.name && row.email && (
                                <div className="ai-usage-email">{row.email}</div>
                              )}
                            </td>
                            <td className="num">
                              <b title={formatTokensExact(row.totalTokens)}>
                                {formatTokensCompact(row.totalTokens)}
                              </b>
                              <div className="ai-usage-bar">
                                <i
                                  style={{
                                    width: `${Math.round((row.totalTokens / maxTokens) * 100)}%`,
                                  }}
                                />
                              </div>
                            </td>
                            <td className="num">{formatShare(row.share)}</td>
                            <td className="num">{formatTokensExact(row.chatTokens)}</td>
                            <td className="num">{formatTokensExact(row.otherTokens)}</td>
                            <td className="num">{formatTokensExact(row.inputTokens)}</td>
                            <td className="num">{formatTokensExact(row.outputTokens)}</td>
                            <td className="num">{formatTokensExact(row.requests)}</td>
                            <td className="num">{formatUsd(row.costUsd)}</td>
                            <td className="num">{formatJalaliDateTime(row.lastUsedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <p className="ai-usage-note">
                {report.trackedSince !== null &&
                  `${TAI.trackedSince} ${formatJalaliDate(report.trackedSince)}. `}
                {TAI.chatHistoryNote}
              </p>
            </>
          )}
        </>
      )}
    </main>
  );
};
