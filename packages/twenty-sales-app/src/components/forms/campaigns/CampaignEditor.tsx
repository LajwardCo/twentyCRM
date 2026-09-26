import { type Member } from '../../../api/admin';
import { type CampaignFormOption } from '../../../api/surveyInsights';
import {
  type CampaignInput,
  type CampaignStatus,
  type SurveyCampaign,
  type SurveySource,
} from '../../../api/surveys';
import { SURVEY_SOURCES, isoToLocalDate, localDateToIso } from '../../../lib/forms/insights';
import { TINS } from '../../../lib/forms/insightStrings';
import {
  CAMPAIGN_STATUS_LABELS,
  FORM_STATUS_LABELS,
  SOURCE_LABELS,
} from '../../../lib/forms/surveyStrings';
import { JalaliDatePicker } from '../../JalaliDatePicker';
import { NumberField } from '../../NumberField';
import { SearchSelect } from '../../SearchSelect';
import { CAMPAIGN_STATUSES } from './CampaignCreateSheet';
import { TagInput, ToggleChips } from './CampaignInputs';

export type CampaignDraft = {
  name: string;
  description: string;
  campaignStatus: CampaignStatus;
  // Local yyyy-mm-dd, as the date picker speaks.
  startsAt: string;
  endsAt: string;
  city: string;
  areas: string[];
  assigneeIds: string[];
  targetResponses: number | null;
  channels: SurveySource[];
  formIds: string[];
};

export const draftFromCampaign = (campaign: SurveyCampaign): CampaignDraft => ({
  name: campaign.name,
  description: campaign.description,
  campaignStatus: campaign.campaignStatus,
  startsAt: isoToLocalDate(campaign.startsAt),
  endsAt: isoToLocalDate(campaign.endsAt),
  city: campaign.city,
  areas: campaign.areas,
  assigneeIds: campaign.assigneeIds,
  targetResponses: campaign.targetResponses,
  channels: campaign.channels,
  formIds: campaign.formIds,
});

// Only the fields the user changed: an untouched date is not rewritten
// (re-deriving it from the local day could shift the stored instant), and a
// concurrent edit to another field is not clobbered.
export const draftToInput = (draft: CampaignDraft, original: CampaignDraft): CampaignInput => {
  const input: CampaignInput = {};
  const changed = <TKey extends keyof CampaignDraft>(key: TKey) =>
    JSON.stringify(draft[key]) !== JSON.stringify(original[key]);

  if (changed('name')) input.name = draft.name.trim();
  if (changed('description')) input.description = draft.description.trim();
  if (changed('campaignStatus')) input.campaignStatus = draft.campaignStatus;
  if (changed('startsAt')) input.startsAt = localDateToIso(draft.startsAt);
  if (changed('endsAt')) input.endsAt = localDateToIso(draft.endsAt);
  if (changed('city')) input.city = draft.city.trim();
  if (changed('areas')) input.areas = draft.areas;
  if (changed('assigneeIds')) input.assigneeIds = draft.assigneeIds;
  if (changed('targetResponses')) input.targetResponses = draft.targetResponses;
  if (changed('channels')) input.channels = draft.channels;
  if (changed('formIds')) input.formIds = draft.formIds;

  return input;
};

const MEMBER_CHIP_LIMIT = 12;

export const CampaignEditor = ({
  draft,
  onChange,
  members,
  forms,
  disabled,
}: {
  draft: CampaignDraft;
  onChange: (next: CampaignDraft) => void;
  members: Member[];
  forms: CampaignFormOption[];
  disabled: boolean;
}) => {
  const set = <TKey extends keyof CampaignDraft>(key: TKey, value: CampaignDraft[TKey]) =>
    onChange({ ...draft, [key]: value });

  const memberOptions = members.map((member) => ({
    value: member.id,
    label: `${member.name.firstName} ${member.name.lastName}`.trim() || (member.userEmail ?? member.id),
    hint: member.userEmail ?? undefined,
  }));
  const formOptions = forms
    .filter((form) => form.formStatus !== 'ARCHIVED' || draft.formIds.includes(form.id))
    .map((form) => ({
      value: form.id,
      label: form.name,
      note: form.formStatus === 'PUBLISHED' ? undefined : FORM_STATUS_LABELS[form.formStatus],
    }));

  return (
    <fieldset className="svk-editor" disabled={disabled}>
      <div className="fld">
        <label htmlFor="svk-c-name">{TINS.campaignName}</label>
        <input id="svk-c-name" dir="auto" value={draft.name} onChange={(event) => set('name', event.target.value)} />
      </div>
      <div className="fld">
        <label htmlFor="svk-c-description">{TINS.description}</label>
        <textarea
          id="svk-c-description"
          dir="auto"
          rows={3}
          value={draft.description}
          onChange={(event) => set('description', event.target.value)}
        />
      </div>
      <div className="svk-grid3">
        <div className="fld">
          <label htmlFor="svk-c-status">{TINS.status}</label>
          <select
            id="svk-c-status"
            value={draft.campaignStatus}
            onChange={(event) => set('campaignStatus', event.target.value as CampaignStatus)}
          >
            {CAMPAIGN_STATUSES.map((value) => (
              <option key={value} value={value}>
                {CAMPAIGN_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="fld">
          <label htmlFor="svk-c-start">{TINS.startsAt}</label>
          <JalaliDatePicker
            id="svk-c-start"
            withTime={false}
            value={draft.startsAt}
            onChange={(value) => set('startsAt', value)}
          />
        </div>
        <div className="fld">
          <label htmlFor="svk-c-end">{TINS.endsAt}</label>
          <JalaliDatePicker
            id="svk-c-end"
            withTime={false}
            value={draft.endsAt}
            onChange={(value) => set('endsAt', value)}
          />
        </div>
      </div>
      <div className="svk-grid3">
        <div className="fld">
          <label htmlFor="svk-c-city">{TINS.city}</label>
          <input id="svk-c-city" dir="auto" value={draft.city} onChange={(event) => set('city', event.target.value)} />
        </div>
        <div className="fld">
          <label htmlFor="svk-c-target">{TINS.target}</label>
          <NumberField
            id="svk-c-target"
            integer
            value={draft.targetResponses}
            onChange={(value) => set('targetResponses', value)}
          />
        </div>
      </div>
      <div className="fld">
        <label htmlFor="svk-c-area">{TINS.areas}</label>
        <TagInput id="svk-c-area" values={draft.areas} onChange={(next) => set('areas', next)} disabled={disabled} />
      </div>
      <div className="fld">
        <span className="svk-label" id="svk-c-channels">
          {TINS.channels}
        </span>
        <ToggleChips
          labelledBy="svk-c-channels"
          options={SURVEY_SOURCES.map((source) => ({ value: source, label: SOURCE_LABELS[source] }))}
          selected={draft.channels}
          onChange={(next) => set('channels', next as SurveySource[])}
          disabled={disabled}
        />
      </div>
      <div className="fld">
        <span className="svk-label" id="svk-c-assignees">
          {TINS.assignees}
        </span>
        {memberOptions.length === 0 ? (
          <div className="svk-muted-note">{TINS.noMembers}</div>
        ) : memberOptions.length <= MEMBER_CHIP_LIMIT ? (
          <ToggleChips
            labelledBy="svk-c-assignees"
            options={memberOptions}
            selected={draft.assigneeIds}
            onChange={(next) => set('assigneeIds', next)}
            disabled={disabled}
          />
        ) : (
          // Large teams: chips for the chosen people (tap to remove) and a
          // searchable picker to add more, instead of a wall of 100 chips.
          <>
            <ToggleChips
              labelledBy="svk-c-assignees"
              options={memberOptions.filter((option) => draft.assigneeIds.includes(option.value))}
              selected={draft.assigneeIds}
              onChange={(next) => set('assigneeIds', next)}
              disabled={disabled}
            />
            {!disabled && (
              <SearchSelect
                key={draft.assigneeIds.join(',')}
                className="svk-member-add"
                value=""
                ariaLabel={TINS.addAssignee}
                placeholder={TINS.addAssignee}
                options={memberOptions.filter((option) => !draft.assigneeIds.includes(option.value))}
                onChange={(memberId) => {
                  if (memberId !== '') set('assigneeIds', [...draft.assigneeIds, memberId]);
                }}
              />
            )}
          </>
        )}
      </div>
      <div className="fld">
        <span className="svk-label" id="svk-c-forms">
          {TINS.forms}
        </span>
        {formOptions.length === 0 ? (
          <div className="svk-muted-note">{TINS.noForms}</div>
        ) : (
          <ToggleChips
            labelledBy="svk-c-forms"
            options={formOptions}
            selected={draft.formIds}
            onChange={(next) => set('formIds', next)}
            disabled={disabled}
          />
        )}
      </div>
    </fieldset>
  );
};
