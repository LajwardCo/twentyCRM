import { type SurveyCampaign, type SurveyFormSummary, type VisitOutcome } from '../../../api/surveys';
import { availableVisitOutcomes } from '../../../lib/forms/collect/visitOutcome';
import { TC } from '../../../lib/forms/collectStrings';
import { VISIT_OUTCOME_LABELS } from '../../../lib/forms/surveyStrings';

type VisitSurveyStepProps = {
  forms: SurveyFormSummary[];
  campaigns: SurveyCampaign[];
  formId: string | 'none' | null;
  campaignId: string | null;
  onChange: (patch: { formId?: string | 'none'; campaignId?: string | null }) => void;
};

// Campaigns that run this form come first; any active campaign may be picked.
const orderCampaigns = (campaigns: SurveyCampaign[], formId: string | 'none' | null) =>
  [...campaigns].sort(
    (a, b) =>
      Number(formId !== null && b.formIds.includes(formId)) -
      Number(formId !== null && a.formIds.includes(formId)),
  );

export const VisitSurveyStep = ({ forms, campaigns, formId, campaignId, onChange }: VisitSurveyStepProps) => (
  <div className="svc-step-body">
    <div className="svc-label" id="svc-visit-form-label">{TC.chooseSurvey}</div>
    <div className="svc-options" role="radiogroup" aria-labelledby="svc-visit-form-label">
      {forms.map((form) => (
        <button
          key={form.id}
          type="button"
          role="radio"
          aria-checked={formId === form.id}
          className={`svc-option${formId === form.id ? ' on' : ''}`}
          onClick={() => onChange({ formId: form.id })}
        >
          <b dir="auto">{form.name}</b>
          {form.publishedVersion !== null && (
            <small dir="ltr">{form.publishedVersion.printCode}</small>
          )}
        </button>
      ))}
      {forms.length === 0 && <div className="svc-hint">{TC.noPublishedForms}</div>}
      <button
        type="button"
        role="radio"
        aria-checked={formId === 'none'}
        className={`svc-option svc-option-muted${formId === 'none' ? ' on' : ''}`}
        onClick={() => onChange({ formId: 'none' })}
      >
        <b>{TC.noSurvey}</b>
      </button>
    </div>

    {campaigns.length > 0 && (
      <div className="fld">
        <label htmlFor="svc-visit-campaign">{TC.campaignOptional}</label>
        <select
          id="svc-visit-campaign"
          value={campaignId ?? ''}
          onChange={(event) => onChange({ campaignId: event.target.value === '' ? null : event.target.value })}
        >
          <option value="">{TC.noCampaign}</option>
          {orderCampaigns(campaigns, formId).map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name}
            </option>
          ))}
        </select>
      </div>
    )}
  </div>
);

type VisitOutcomeStepProps = {
  surveyChosen: boolean;
  outcome: VisitOutcome | null;
  notes: string;
  onChange: (patch: { outcome?: VisitOutcome; notes?: string }) => void;
};

export const VisitOutcomeStep = ({ surveyChosen, outcome, notes, onChange }: VisitOutcomeStepProps) => (
  <div className="svc-step-body">
    <div className="svc-label" id="svc-visit-outcome-label">{TC.visitOutcome}</div>
    <div className="svc-options" role="radiogroup" aria-labelledby="svc-visit-outcome-label">
      {availableVisitOutcomes(surveyChosen).map((candidate) => (
        <button
          key={candidate}
          type="button"
          role="radio"
          aria-checked={outcome === candidate}
          className={`svc-option${outcome === candidate ? ' on' : ''}${candidate === 'COMPLETED' ? ' svc-option-primary' : ''}`}
          onClick={() => onChange({ outcome: candidate })}
        >
          <b>{VISIT_OUTCOME_LABELS[candidate]}</b>
        </button>
      ))}
    </div>
    {!surveyChosen && <div className="svc-hint">{TC.outcomeNeedsSurvey}</div>}
    <div className="svc-hint">{TC.interestSeparate}</div>
    <div className="fld">
      <label htmlFor="svc-visit-notes">{TC.visitNotes}</label>
      <textarea
        id="svc-visit-notes"
        dir="auto"
        value={notes}
        onChange={(event) => onChange({ notes: event.target.value })}
      />
    </div>
  </div>
);
