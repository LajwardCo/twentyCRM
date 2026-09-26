import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  fetchCampaignVisits,
  fetchLeadTasks,
  fetchOpportunityStages,
} from '../../../api/surveyInsights';
import { type SurveyCampaign, type SurveyResponse, fetchAllResponses } from '../../../api/surveys';
import {
  type FollowUpTask,
  type VisitRecord,
  activityByArea,
  activityByCollector,
  completedByWeek,
  followUpSummary,
  leadInsights,
  summarizeResponses,
  uniqueLeadIds,
  visitInsights,
} from '../../../lib/forms/insights';
import { TINS } from '../../../lib/forms/insightStrings';
import { VISIT_OUTCOME_LABELS } from '../../../lib/forms/surveyStrings';
import { toPersianDigits } from '../../../lib/jalali';
import { navigate } from '../../../lib/router';
import { ActivityTable, CountTable } from '../insights/ActivityTable';
import { DistributionBars } from '../insights/InsightBars';
import { LEAD_STAGE_ORDER, LeadStagesCard, ResponseKpis } from '../insights/ResponseKpis';
import { WeeklyBars } from '../insights/WeeklyBars';
import { CampaignTarget } from './CampaignStatusPill';

type Loaded = {
  responses: SurveyResponse[];
  // The device-side caps were hit: numbers cover only the first rows.
  responsesTruncated: boolean;
  visitsTruncated: boolean;
  // null = that part failed to load; the rest still renders.
  visits: VisitRecord[] | null;
  stages: Map<string, string | null> | null;
  followUps: FollowUpTask[] | null;
};

type LoadState = { status: 'loading' } | { status: 'error' } | ({ status: 'ready' } & Loaded);

const settledValue = <TValue,>(result: PromiseSettledResult<TValue>): TValue | null =>
  result.status === 'fulfilled' ? result.value : null;

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="svk-stat">
    <span>{label}</span>
    <b className="num">{toPersianDigits(value)}</b>
  </div>
);

export const CampaignProgress = ({ campaign }: { campaign: SurveyCampaign }) => {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });

    try {
      const [{ responses, truncated: responsesTruncated }, visitResult] = await Promise.all([
        fetchAllResponses({ campaignId: campaign.id }),
        fetchCampaignVisits(campaign.id).catch(() => null),
      ]);
      const visits = visitResult?.visits ?? null;
      const leadIds = uniqueLeadIds(responses);
      let stages: Loaded['stages'] = null;
      let followUps: Loaded['followUps'] = [];

      if (leadIds.length > 0) {
        const [stageResult, taskResult] = await Promise.allSettled([
          fetchOpportunityStages(leadIds),
          fetchLeadTasks(leadIds),
        ]);

        stages = settledValue(stageResult);
        followUps = settledValue(taskResult);
      }

      setState({
        status: 'ready',
        responses,
        responsesTruncated,
        visits,
        visitsTruncated: visitResult?.truncated ?? false,
        stages,
        followUps,
      });
    } catch {
      setState({ status: 'error' });
    }
  }, [campaign.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const insights = useMemo(() => {
    if (state.status !== 'ready') return null;

    const totals = summarizeResponses(state.responses);

    return {
      totals,
      weeks: completedByWeek(state.responses),
      leads: leadInsights(state.responses, {
        stageById: state.stages ?? undefined,
        stageOrder: LEAD_STAGE_ORDER,
      }),
      visits: state.visits === null ? null : visitInsights(state.visits, state.responses),
      followUps: state.followUps === null ? null : followUpSummary(state.followUps),
      byCollector: activityByCollector(state.responses),
      byArea: activityByArea(state.responses),
    };
  }, [state]);

  if (state.status === 'loading') {
    return <div className="card card-pad svk-muted-note" aria-busy="true">{TINS.loading}</div>;
  }

  if (state.status === 'error' || insights === null) {
    return (
      <div className="card card-pad svk-error" role="alert">
        <span>{TINS.loadError}</span>
        <button type="button" className="btn line sm" onClick={() => void load()}>
          {TINS.retry}
        </button>
      </div>
    );
  }

  const { totals, leads, visits, followUps } = insights;

  return (
    <div className="svk-progress">
      <div className="svk-section-head">
        <h2>{TINS.progressTitle}</h2>
        <button
          type="button"
          className="btn line sm"
          onClick={() => navigate(`/responses?campaignId=${encodeURIComponent(campaign.id)}`)}
        >
          {TINS.viewResponses}
        </button>
      </div>

      {state.responsesTruncated && (
        <div className="svk-warn" role="status">{TINS.truncatedResponses(state.responses.length)}</div>
      )}
      {state.visitsTruncated && state.visits !== null && (
        <div className="svk-warn" role="status">{TINS.truncatedVisits(state.visits.length)}</div>
      )}

      <section className="card card-pad">
        <h3>{TINS.targetProgress}</h3>
        <p className="svk-note">{TINS.progressBasis}</p>
        <CampaignTarget completed={totals.completed} target={campaign.targetResponses} />
      </section>

      <ResponseKpis totals={totals} leads={leads} />

      {insights.weeks.length > 0 && (
        <section className="card card-pad">
          <h3>{TINS.overTime}</h3>
          <WeeklyBars buckets={insights.weeks} />
        </section>
      )}

      <div className="svk-activity-grid">
        <section className="card card-pad svk-activity">
          <h3>{TINS.visitsTitle}</h3>
          {visits === null ? (
            <div className="svk-muted-note">{TINS.loadError}</div>
          ) : visits.total === 0 ? (
            <div className="svk-muted-note">{TINS.noVisits}</div>
          ) : (
            <>
              <div className="svk-stats-row">
                <Stat label={TINS.visitsTotal} value={visits.total} />
                <Stat label={TINS.visitsWithSurvey} value={visits.withSurvey} />
                <Stat label={TINS.visitsWithoutSurvey} value={visits.withoutSurvey} />
                <Stat label={TINS.staffVisitResponses} value={visits.staffVisitResponses} />
              </div>
              <p className="svk-note">
                {TINS.surveysVsVisits(visits.withSurvey, visits.total)} · {TINS.leadsVisited(visits.uniqueLeadsVisited)}
              </p>
              <h4>{TINS.byOutcome}</h4>
              <DistributionBars
                denominator={visits.total}
                rows={visits.byOutcome.map((row) => ({
                  key: row.outcome ?? '__none',
                  label: row.outcome === null ? TINS.noOutcome : VISIT_OUTCOME_LABELS[row.outcome],
                  count: row.count,
                  tone: row.outcome === null ? 'muted' : undefined,
                }))}
              />
            </>
          )}
        </section>

        <LeadStagesCard leads={leads} />

        <section className="card card-pad svk-activity">
          <h3>{TINS.followUps}</h3>
          <p className="svk-note">{TINS.followUpsHint}</p>
          {followUps === null ? (
            <div className="svk-muted-note">{TINS.loadError}</div>
          ) : followUps.total === 0 ? (
            <div className="svk-muted-note">{TINS.noFollowUps}</div>
          ) : (
            <div className="svk-stats-row">
              <Stat label={TINS.total} value={followUps.total} />
              <Stat label={TINS.done} value={followUps.done} />
              <Stat label={TINS.open} value={followUps.open} />
            </div>
          )}
        </section>

        <ActivityTable title={TINS.responsesBy} rows={insights.byCollector} nullLabel={TINS.noCollector} />
        {visits !== null && visits.total > 0 && (
          <CountTable title={TINS.visitsBy} rows={visits.byAssignee} nullLabel={TINS.unassigned} />
        )}
        <ActivityTable title={TINS.byArea} rows={insights.byArea} nullLabel={TINS.noCity} />
      </div>
    </div>
  );
};
