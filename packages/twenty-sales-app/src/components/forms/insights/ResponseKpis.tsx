import { STAGES } from '../../../api/records';
import {
  type LeadInsights,
  type ResponseTotals,
  formatPercent,
} from '../../../lib/forms/insights';
import { TINS } from '../../../lib/forms/insightStrings';
import { SOURCE_LABELS } from '../../../lib/forms/surveyStrings';
import { toPersianDigits } from '../../../lib/jalali';
import { STAGE_LABELS } from '../../../lib/strings';
import { DistributionBars } from './InsightBars';

export const LEAD_STAGE_ORDER = STAGES.map((stage) => stage.value);

// The tile row shared by the form Insights tab and the campaign page.
export const ResponseKpis = ({
  totals,
  leads,
}: {
  totals: ResponseTotals;
  leads: LeadInsights;
}) => (
  <>
    <div className="stats svk-kpis">
      <div className="card kpi">
        <span className="lbl">{TINS.completed}</span>
        <span className="big num">{toPersianDigits(totals.completed)}</span>
        <span className="svk-kpi-foot">
          {TINS.partial}: <b className="num">{toPersianDigits(totals.partial)}</b>
        </span>
      </div>
      <div className="card kpi">
        <span className="lbl">{TINS.byChannel}</span>
        <ul className="svk-channel-list">
          {totals.bySource.map((row) => (
            <li key={row.source}>
              <span>{SOURCE_LABELS[row.source]}</span>
              <b className="num">{toPersianDigits(row.completed)}</b>
              {row.partial > 0 && (
                <small className="num">{TINS.partialN(row.partial)}</small>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="card kpi">
        <span className="lbl">{TINS.uniqueLeads}</span>
        <span className="big num">{toPersianDigits(leads.uniqueLeads)}</span>
        <span className="svk-kpi-foot" title={TINS.leadsHint}>
          {TINS.responsesWithLead(leads.responsesWithLead)}
        </span>
      </div>
      <div className="card kpi">
        <span className="lbl">{TINS.conversion}</span>
        <span className="big num">{formatPercent(leads.rate)}</span>
        <span className="svk-kpi-foot">
          {TINS.conversionHint(leads.uniqueLeads, leads.denominator)}
        </span>
      </div>
    </div>
    <p className="svk-note">
      {TINS.spamNote(totals.spamExcluded)} {TINS.leadsHint}
    </p>
  </>
);

export const LeadStagesCard = ({ leads }: { leads: LeadInsights }) => (
  <section className="card card-pad svk-activity">
    <h3>{TINS.leadStages}</h3>
    {leads.uniqueLeads === 0 ? (
      <div className="svk-muted-note">{TINS.noLeads}</div>
    ) : (
      <>
        <p className="svk-note">{TINS.conversionHint(leads.uniqueLeads, leads.denominator)}</p>
        <DistributionBars
          denominator={leads.uniqueLeads}
          rows={leads.stages.map((row) => ({
            key: row.stage ?? '__none',
            label: row.stage === null ? TINS.noStage : (STAGE_LABELS[row.stage] ?? row.stage),
            count: row.count,
            tone: row.stage === null ? 'muted' : undefined,
          }))}
        />
      </>
    )}
  </section>
);
