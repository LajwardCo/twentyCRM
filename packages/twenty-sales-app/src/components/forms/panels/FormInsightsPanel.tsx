import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  type SurveyFormVersion,
  type SurveyResponse,
  fetchAllResponses,
  fetchVersions,
} from '../../../api/surveys';
import {
  type InsightFilter,
  type VersionInfo,
  EMPTY_FILTER,
  NO_CAMPAIGN,
  activityByArea,
  activityByCampaign,
  activityByCity,
  activityByCollector,
  completedByWeek,
  filterResponses,
  leadInsights,
  questionInsights,
  summarizeResponses,
} from '../../../lib/forms/insights';
import { TINS } from '../../../lib/forms/insightStrings';
import { JalaliDatePicker } from '../../JalaliDatePicker';
import { ActivityTable } from '../insights/ActivityTable';
import { QuestionInsightCard } from '../insights/QuestionInsightCard';
import { LEAD_STAGE_ORDER, LeadStagesCard, ResponseKpis } from '../insights/ResponseKpis';
import { WeeklyBars } from '../insights/WeeklyBars';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; versions: SurveyFormVersion[]; responses: SurveyResponse[] };

const Filters = ({
  filter,
  onChange,
  versions,
  campaigns,
}: {
  filter: InsightFilter;
  onChange: (next: InsightFilter) => void;
  versions: SurveyFormVersion[];
  campaigns: { id: string; name: string }[];
}) => (
  <div className="card card-pad svk-filters" role="group" aria-label={TINS.filters}>
    <div className="fld">
      <label htmlFor="svk-f-version">{TINS.version}</label>
      <select
        id="svk-f-version"
        value={filter.versionId ?? ''}
        onChange={(event) => onChange({ ...filter, versionId: event.target.value || null })}
      >
        <option value="">{TINS.allVersions}</option>
        {versions.map((version) => (
          <option key={version.id} value={version.id}>
            {TINS.versionN(version.versionNumber)}
          </option>
        ))}
      </select>
    </div>
    <div className="fld">
      <label htmlFor="svk-f-campaign">{TINS.byCampaign}</label>
      <select
        id="svk-f-campaign"
        value={filter.campaignId ?? ''}
        onChange={(event) => onChange({ ...filter, campaignId: event.target.value || null })}
      >
        <option value="">{TINS.allCampaigns}</option>
        <option value={NO_CAMPAIGN}>{TINS.noCampaign}</option>
        {campaigns.map((campaign) => (
          <option key={campaign.id} value={campaign.id}>
            {campaign.name}
          </option>
        ))}
      </select>
    </div>
    <div className="fld">
      <label htmlFor="svk-f-from">{TINS.from}</label>
      <JalaliDatePicker
        id="svk-f-from"
        withTime={false}
        value={filter.from ?? ''}
        onChange={(value) => onChange({ ...filter, from: value || null })}
      />
    </div>
    <div className="fld">
      <label htmlFor="svk-f-to">{TINS.to}</label>
      <JalaliDatePicker
        id="svk-f-to"
        withTime={false}
        value={filter.to ?? ''}
        onChange={(value) => onChange({ ...filter, to: value || null })}
      />
    </div>
    {Object.values(filter).some((value) => value !== null) && (
      <button type="button" className="btn ghost sm svk-clear" onClick={() => onChange(EMPTY_FILTER)}>
        {TINS.clearFilters}
      </button>
    )}
  </div>
);

// Insights tab of the form workspace. Everything is computed on the device
// from the full response list (fetched page by page), so the numbers match
// the responses table exactly.
export const FormInsightsPanel = ({ formId }: { formId: string }) => {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [filter, setFilter] = useState<InsightFilter>(EMPTY_FILTER);

  const load = useCallback(async () => {
    setState({ status: 'loading' });

    try {
      const [versions, responses] = await Promise.all([
        fetchVersions(formId),
        fetchAllResponses({ formId }),
      ]);

      setState({ status: 'ready', versions, responses });
    } catch {
      setState({ status: 'error' });
    }
  }, [formId]);

  useEffect(() => {
    void load();
  }, [load]);

  const versions = state.status === 'ready' ? state.versions : [];
  const responses = state.status === 'ready' ? state.responses : [];

  const campaigns = useMemo(() => {
    const byId = new Map<string, string>();

    for (const response of responses) {
      if (response.campaign !== null) byId.set(response.campaign.id, response.campaign.name);
    }

    return [...byId.entries()].map(([id, name]) => ({ id, name }));
  }, [responses]);

  const insights = useMemo(() => {
    const filtered = filterResponses(responses, filter);
    const versionMap = new Map<string, VersionInfo>(
      versions
        .filter((version) => filter.versionId === null || version.id === filter.versionId)
        .map((version) => [
          version.id,
          { versionNumber: version.versionNumber, definition: version.definition },
        ]),
    );

    return {
      filtered,
      totals: summarizeResponses(filtered),
      weeks: completedByWeek(filtered),
      questions: questionInsights(filtered, versionMap),
      leads: leadInsights(filtered, { stageOrder: LEAD_STAGE_ORDER }),
      byCampaign: activityByCampaign(filtered),
      byCollector: activityByCollector(filtered),
      byCity: activityByCity(filtered),
      byArea: activityByArea(filtered),
    };
  }, [responses, versions, filter]);

  if (state.status === 'loading') {
    return (
      <div className="svk-panel" aria-busy="true">
        <div className="card card-pad svk-muted-note">{TINS.loading}</div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="svk-panel">
        <div className="card card-pad svk-error" role="alert">
          <span>{TINS.loadError}</span>
          <button type="button" className="btn line sm" onClick={() => void load()}>
            {TINS.retry}
          </button>
        </div>
      </div>
    );
  }

  if (responses.length === 0) {
    return (
      <div className="svk-panel">
        <div className="card empty-state">{TINS.noResponses}</div>
      </div>
    );
  }

  return (
    <div className="svk-panel">
      <Filters filter={filter} onChange={setFilter} versions={versions} campaigns={campaigns} />

      {insights.filtered.length === 0 ? (
        <div className="card empty-state">{TINS.noMatch}</div>
      ) : (
        <>
          <ResponseKpis totals={insights.totals} leads={insights.leads} />

          <section className="card card-pad">
            <h3>{TINS.overTime}</h3>
            <p className="svk-note">{TINS.overTimeHint}</p>
            {insights.weeks.length === 0 ? (
              <div className="svk-muted-note">{TINS.noAnswersYet}</div>
            ) : (
              <WeeklyBars buckets={insights.weeks} />
            )}
          </section>

          <section className="svk-section" aria-labelledby="svk-questions-title">
            <h2 id="svk-questions-title">{TINS.questions}</h2>
            <p className="svk-note">
              {TINS.questionsBasis(insights.questions.responseCount)}
              {insights.questions.unknownVersion > 0 &&
                ` ${TINS.unknownVersion(insights.questions.unknownVersion)}`}
            </p>
            {insights.questions.questions.length === 0 ? (
              <div className="card empty-state">{TINS.noQuestions}</div>
            ) : (
              <div className="svk-question-grid">
                {insights.questions.questions.map((question, index) => (
                  <QuestionInsightCard key={question.questionId} insight={question} index={index} />
                ))}
              </div>
            )}
          </section>

          <section className="svk-section" aria-labelledby="svk-activity-title">
            <h2 id="svk-activity-title">{TINS.activity}</h2>
            <div className="svk-activity-grid">
              <LeadStagesCard leads={insights.leads} />
              <ActivityTable title={TINS.byCampaign} rows={insights.byCampaign} nullLabel={TINS.noCampaign} />
              <ActivityTable title={TINS.byCollector} rows={insights.byCollector} nullLabel={TINS.noCollector} />
              <ActivityTable title={TINS.byCity} rows={insights.byCity} nullLabel={TINS.noCity} />
              <ActivityTable title={TINS.byArea} rows={insights.byArea} nullLabel={TINS.noCity} />
            </div>
          </section>
        </>
      )}
    </div>
  );
};
