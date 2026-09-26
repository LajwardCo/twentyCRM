import { useCallback, useEffect, useMemo, useState } from 'react';

import { type CurrentUser } from '../../api/auth';
import { countCompletedByCampaign } from '../../api/surveyInsights';
import { type CampaignStatus, type SurveyCampaign, listCampaigns } from '../../api/surveys';
import {
  CAMPAIGN_STATUSES,
  CampaignCreateSheet,
} from '../../components/forms/campaigns/CampaignCreateSheet';
import {
  CampaignStatusPill,
  CampaignTarget,
  campaignDates,
} from '../../components/forms/campaigns/CampaignStatusPill';
import { IconPlus } from '../../components/icons';
import { TINS } from '../../lib/forms/insightStrings';
import { CAMPAIGN_STATUS_LABELS } from '../../lib/forms/surveyStrings';
import { useSurveyCapabilities } from '../../lib/forms/useSurveyCapabilities';
import { toPersianDigits } from '../../lib/jalali';
import { navigate } from '../../lib/router';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; unprovisioned: boolean }
  | { status: 'ready'; campaigns: SurveyCampaign[]; completed: Record<string, number> };

const isUnprovisioned = (error: unknown) =>
  error instanceof Error && /(Cannot query field|Unknown type).*[sS]urvey/.test(error.message);

const open = (campaign: SurveyCampaign) => navigate(`/campaign/${campaign.id}`);

export const CampaignsView = (_props: { user: CurrentUser }) => {
  const { capabilities } = useSurveyCapabilities();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | ''>('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const campaigns = await listCampaigns();
      const completed = await countCompletedByCampaign(campaigns.map((campaign) => campaign.id));

      setState({ status: 'ready', campaigns, completed });
    } catch (error) {
      setState({ status: 'error', unprovisioned: isUnprovisioned(error) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const campaigns = useMemo(() => {
    if (state.status !== 'ready') return [];

    const needle = search.trim().toLowerCase();

    return state.campaigns.filter(
      (campaign) =>
        (statusFilter === '' || campaign.campaignStatus === statusFilter) &&
        (needle === '' ||
          campaign.name.toLowerCase().includes(needle) ||
          campaign.city.toLowerCase().includes(needle)),
    );
  }, [state, search, statusFilter]);

  const completedOf = (campaign: SurveyCampaign) =>
    state.status === 'ready' ? (state.completed[campaign.id] ?? 0) : 0;

  return (
    <main className="page svk-page">
      <div className="page-head">
        <div>
          <h1>{TINS.campaignsTitle}</h1>
          <div className="sub">{TINS.campaignsSub}</div>
        </div>
        {capabilities.canManageCampaigns && (
          <button type="button" className="btn gold" onClick={() => setCreating(true)}>
            <IconPlus size={16} />
            {TINS.newCampaign}
          </button>
        )}
      </div>

      {state.status === 'loading' && <div className="card card-pad svk-muted-note">{TINS.loading}</div>}

      {state.status === 'error' && (
        <div className="card card-pad svk-error" role="alert">
          <span>{state.unprovisioned ? TINS.notProvisioned : TINS.loadError}</span>
          {!state.unprovisioned && (
            <button type="button" className="btn line sm" onClick={() => void load()}>
              {TINS.retry}
            </button>
          )}
        </div>
      )}

      {state.status === 'ready' && state.campaigns.length === 0 && (
        <div className="card empty-state">{TINS.noCampaigns}</div>
      )}

      {state.status === 'ready' && state.campaigns.length > 0 && (
        <>
          <div className="toolbar svk-toolbar">
            <input
              type="search"
              className="svk-search"
              placeholder={TINS.searchCampaigns}
              aria-label={TINS.searchCampaigns}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              aria-label={TINS.status}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as CampaignStatus | '')}
            >
              <option value="">{TINS.allStatuses}</option>
              {CAMPAIGN_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {CAMPAIGN_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          {campaigns.length === 0 ? (
            <div className="card empty-state">{TINS.noMatch}</div>
          ) : (
            <>
              <div className="card svk-desktop-only">
                <table className="svk-table svk-list-table">
                  <thead>
                    <tr>
                      <th scope="col">{TINS.campaignName}</th>
                      <th scope="col">{TINS.status}</th>
                      <th scope="col">{TINS.dates}</th>
                      <th scope="col">{TINS.city}</th>
                      <th scope="col" title={TINS.progressBasis}>{TINS.progress}</th>
                      <th scope="col">{TINS.formsCount}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((campaign) => (
                      <tr key={campaign.id} onClick={() => open(campaign)}>
                        <td>
                          <a
                            href={`#/campaign/${campaign.id}`}
                            className="svk-row-link"
                            dir="auto"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {campaign.name}
                          </a>
                        </td>
                        <td>
                          <CampaignStatusPill status={campaign.campaignStatus} />
                        </td>
                        <td className="num">{campaignDates(campaign.startsAt, campaign.endsAt)}</td>
                        <td dir="auto">{campaign.city || '—'}</td>
                        <td>
                          <CampaignTarget completed={completedOf(campaign)} target={campaign.targetResponses} />
                        </td>
                        <td className="num">{toPersianDigits(campaign.formIds.length)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="svk-cards svk-mobile-only">
                {campaigns.map((campaign) => (
                  <li key={campaign.id}>
                    <a href={`#/campaign/${campaign.id}`} className="card card-pad svk-campaign-card">
                      <div className="svk-card-head">
                        <strong dir="auto">{campaign.name}</strong>
                        <CampaignStatusPill status={campaign.campaignStatus} />
                      </div>
                      <div className="svk-card-meta num">
                        {campaignDates(campaign.startsAt, campaign.endsAt)}
                        {campaign.city !== '' && ` · ${campaign.city}`}
                        {` · ${TINS.formsN(campaign.formIds.length)}`}
                      </div>
                      <CampaignTarget completed={completedOf(campaign)} target={campaign.targetResponses} />
                    </a>
                  </li>
                ))}
              </ul>
              <p className="svk-note">{TINS.progressBasis}</p>
            </>
          )}
        </>
      )}

      {creating && (
        <CampaignCreateSheet
          onClose={() => setCreating(false)}
          onCreated={(campaignId) => navigate(`/campaign/${campaignId}`)}
        />
      )}
    </main>
  );
};
