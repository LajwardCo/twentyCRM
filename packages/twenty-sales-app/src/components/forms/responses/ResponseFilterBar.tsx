import { useState } from 'react';

import { type Member } from '../../../api/admin';
import {
  type SurveyCampaign,
  type SurveyFormSummary,
  type SurveyFormVersion,
} from '../../../api/surveys';
import { toPersianDigits } from '../../../lib/jalali';
import { REVIEW_FILTER_LABELS, TSR } from '../../../lib/forms/responseStrings';
import {
  type ResponseViewFilter,
  type ReviewFilter,
  countActiveFilters,
} from '../../../lib/forms/responses/responseQuery';
import {
  COMPLETION_LABELS,
  SOURCE_LABELS,
} from '../../../lib/forms/surveyStrings';
import { JalaliDatePicker } from '../../JalaliDatePicker';
import { IconFilter, IconSearch, IconX } from '../../icons';
import { memberLabel } from './useResponseLookups';

type ResponseFilterBarProps = {
  filter: ResponseViewFilter;
  onChange: (patch: Partial<ResponseViewFilter>) => void;
  onClear: () => void;
  forms: SurveyFormSummary[];
  versions: SurveyFormVersion[];
  campaigns: SurveyCampaign[];
  members: Member[];
  // The form panel pins the form; its selector is hidden.
  formFixed: boolean;
};

const DateFilter = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) => (
  <div className="svr-date">
    <span className="svr-date-label">{label}</span>
    <JalaliDatePicker value={value} withTime={false} onChange={onChange} />
    {value !== '' && (
      <button type="button" className="svr-icon-btn" aria-label={`${label} — ${TSR.clearFilters}`} onClick={() => onChange('')}>
        <IconX size={14} />
      </button>
    )}
  </div>
);

export const ResponseFilterBar = ({
  filter,
  onChange,
  onClear,
  forms,
  versions,
  campaigns,
  members,
  formFixed,
}: ResponseFilterBarProps) => {
  const [expanded, setExpanded] = useState(false);
  const active = countActiveFilters(filter, formFixed ? ['formId'] : []);

  return (
    <div className="svr-filters">
      <div className="svr-filter-top">
        <label className="svr-search">
          <IconSearch size={15} />
          <input
            dir="auto"
            value={filter.search}
            placeholder={TSR.searchPlaceholder}
            aria-label={TSR.searchPlaceholder}
            onChange={(event) => onChange({ search: event.target.value })}
          />
        </label>
        <button
          type="button"
          className={`btn line sm svr-filter-toggle${expanded ? ' on' : ''}`}
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          <IconFilter size={14} />
          {TSR.filters}
          {active > 0 && <span className="svr-count">{toPersianDigits(active)}</span>}
        </button>
        {(active > 0 || filter.search !== '') && (
          <button type="button" className="btn line sm" onClick={onClear}>
            {TSR.clearFilters}
          </button>
        )}
      </div>

      <div className={`svr-filter-grid${expanded ? ' open' : ''}`}>
        {!formFixed && (
          <select
            aria-label={TSR.form}
            value={filter.formId}
            onChange={(event) => onChange({ formId: event.target.value, version: '' })}
          >
            <option value="">{TSR.allForms}</option>
            {forms.map((form) => (
              <option key={form.id} value={form.id}>
                {form.name}
              </option>
            ))}
          </select>
        )}
        {filter.formId !== '' && (
          <select aria-label={TSR.version} value={filter.version} onChange={(event) => onChange({ version: event.target.value })}>
            <option value="">{TSR.allVersions}</option>
            {versions.map((version) => (
              <option key={version.id} value={String(version.versionNumber)}>
                {`${TSR.version} ${toPersianDigits(version.versionNumber)}${version.printCode ? ` · ${version.printCode}` : ''}`}
              </option>
            ))}
          </select>
        )}
        <select aria-label={TSR.campaign} value={filter.campaignId} onChange={(event) => onChange({ campaignId: event.target.value })}>
          <option value="">{TSR.allCampaigns}</option>
          {campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name}
            </option>
          ))}
        </select>
        <select
          aria-label={TSR.source}
          value={filter.source}
          onChange={(event) => onChange({ source: event.target.value as ResponseViewFilter['source'] })}
        >
          <option value="">{TSR.allSources}</option>
          {Object.entries(SOURCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select aria-label={TSR.collector} value={filter.collectorId} onChange={(event) => onChange({ collectorId: event.target.value })}>
          <option value="">{TSR.allCollectors}</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {memberLabel(member) || member.userEmail}
            </option>
          ))}
        </select>
        <select
          aria-label={TSR.completion}
          value={filter.completion}
          onChange={(event) => onChange({ completion: event.target.value as ResponseViewFilter['completion'] })}
        >
          <option value="">{TSR.allCompletion}</option>
          {Object.entries(COMPLETION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label={TSR.review}
          value={filter.review}
          onChange={(event) => onChange({ review: event.target.value as ReviewFilter })}
        >
          {(Object.keys(REVIEW_FILTER_LABELS) as ReviewFilter[]).map((value) => (
            <option key={value} value={value}>
              {REVIEW_FILTER_LABELS[value]}
            </option>
          ))}
        </select>
        <select
          aria-label={TSR.crm}
          value={filter.linkage}
          onChange={(event) => onChange({ linkage: event.target.value as ResponseViewFilter['linkage'] })}
        >
          <option value="">{TSR.anyLinkage}</option>
          <option value="LINKED">{TSR.linked}</option>
          <option value="UNLINKED">{TSR.unlinked}</option>
        </select>
        <input dir="auto" aria-label={TSR.city} placeholder={TSR.city} value={filter.city} onChange={(event) => onChange({ city: event.target.value })} />
        <input dir="auto" aria-label={TSR.area} placeholder={TSR.area} value={filter.area} onChange={(event) => onChange({ area: event.target.value })} />
        <DateFilter label={TSR.from} value={filter.from} onChange={(from) => onChange({ from })} />
        <DateFilter label={TSR.to} value={filter.to} onChange={(to) => onChange({ to })} />
      </div>
    </div>
  );
};
