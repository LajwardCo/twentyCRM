import { useCallback, useEffect, useState } from 'react';

import { type Member, fetchMembers } from '../../api/admin';
import { type CurrentUser } from '../../api/auth';
import { type CampaignFormOption, listFormOptions } from '../../api/surveyInsights';
import {
  type SurveyCampaign,
  fetchCampaign,
  updateCampaign,
} from '../../api/surveys';
import { CampaignAttribution } from '../../components/forms/campaigns/CampaignAttribution';
import {
  type CampaignDraft,
  CampaignEditor,
  draftFromCampaign,
  draftToInput,
} from '../../components/forms/campaigns/CampaignEditor';
import { CampaignProgress } from '../../components/forms/campaigns/CampaignProgress';
import { CampaignStatusPill, campaignDates } from '../../components/forms/campaigns/CampaignStatusPill';
import { TINS } from '../../lib/forms/insightStrings';
import { useSurveyCapabilities } from '../../lib/forms/useSurveyCapabilities';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'missing' }
  | { status: 'ready'; campaign: SurveyCampaign };

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const sameDraft = (left: CampaignDraft, right: CampaignDraft) =>
  JSON.stringify(left) === JSON.stringify(right);

export const CampaignDetailView = ({ campaignId }: { campaignId: string; user: CurrentUser }) => {
  const { capabilities } = useSurveyCapabilities();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [draft, setDraft] = useState<CampaignDraft | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [forms, setForms] = useState<CampaignFormOption[]>([]);
  const [save, setSave] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const campaign = await fetchCampaign(campaignId);

      if (campaign === null) {
        setState({ status: 'missing' });
        return;
      }

      setState({ status: 'ready', campaign });
      setDraft(draftFromCampaign(campaign));
    } catch {
      setState({ status: 'error' });
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
    // Pickers degrade to empty lists: the campaign itself still loads.
    fetchMembers().then(setMembers, () => setMembers([]));
    listFormOptions().then(setForms, () => setForms([]));
  }, [load]);

  if (state.status === 'loading') {
    return (
      <main className="page svk-page">
        <div className="card card-pad svk-muted-note" aria-busy="true">{TINS.loading}</div>
      </main>
    );
  }

  if (state.status !== 'ready' || draft === null) {
    return (
      <main className="page svk-page">
        <div className="card card-pad svk-error" role="alert">
          <span>{state.status === 'missing' ? TINS.notFound : TINS.loadError}</span>
          {state.status === 'error' && (
            <button type="button" className="btn line sm" onClick={() => void load()}>
              {TINS.retry}
            </button>
          )}
        </div>
      </main>
    );
  }

  const { campaign } = state;
  const canEdit = capabilities.canManageCampaigns;
  const dirty = !sameDraft(draft, draftFromCampaign(campaign));

  const onSave = async () => {
    if (draft.name.trim() === '') {
      setError(TINS.nameRequired);
      return;
    }

    if (draft.startsAt !== '' && draft.endsAt !== '' && draft.endsAt < draft.startsAt) {
      setError(TINS.datesInvalid);
      return;
    }

    setSave('saving');
    setError(null);

    try {
      await updateCampaign(campaign.id, draftToInput(draft, draftFromCampaign(campaign)));

      const fresh = await fetchCampaign(campaign.id);

      if (fresh !== null) {
        setState({ status: 'ready', campaign: fresh });
        setDraft(draftFromCampaign(fresh));
      }

      setSave('saved');
      window.setTimeout(() => setSave((current) => (current === 'saved' ? 'idle' : current)), 2000);
    } catch {
      setSave('error');
      setError(TINS.saveFailed);
    }
  };

  return (
    <main className="page svk-page">
      <div className="page-head">
        <div>
          <h1 dir="auto">{campaign.name}</h1>
          <div className="sub svk-head-meta">
            <CampaignStatusPill status={campaign.campaignStatus} />
            <span className="num">{campaignDates(campaign.startsAt, campaign.endsAt)}</span>
            {campaign.city !== '' && <span dir="auto">{campaign.city}</span>}
          </div>
        </div>
      </div>

      <div className="svk-detail-grid">
        <section className="card card-pad" aria-labelledby="svk-details-title">
          <div className="svk-section-head">
            <h3 id="svk-details-title">{TINS.details}</h3>
            {dirty && <span className="pill svk-pill-warn">{TINS.unsaved}</span>}
          </div>
          {!canEdit && <p className="svk-note">{TINS.readOnly}</p>}
          <CampaignEditor
            draft={draft}
            onChange={(next) => {
              setDraft(next);
              if (save === 'saved') setSave('idle');
            }}
            members={members}
            forms={forms}
            disabled={!canEdit || save === 'saving'}
          />
          {error !== null && (
            <div className="err" role="alert">
              {error}
            </div>
          )}
          {canEdit && (
            <div className="svk-sheet-actions">
              <button
                type="button"
                className="btn gold"
                disabled={!dirty || save === 'saving'}
                onClick={() => void onSave()}
              >
                {save === 'saving' ? TINS.saving : TINS.save}
              </button>
              {dirty && (
                <button
                  type="button"
                  className="btn line"
                  disabled={save === 'saving'}
                  onClick={() => {
                    setDraft(draftFromCampaign(campaign));
                    setError(null);
                  }}
                >
                  {TINS.cancel}
                </button>
              )}
              <span className="svk-save-state" role="status">
                {save === 'saved' ? TINS.saved : ''}
              </span>
            </div>
          )}
        </section>

        <CampaignAttribution campaign={campaign} forms={forms} />
      </div>

      <CampaignProgress campaign={campaign} />
    </main>
  );
};
