import { useEffect, useState } from 'react';

import { type SurveyCampaign, type SurveyForm, listCampaigns, updateFormSettings } from '../../../api/surveys';
import { TC } from '../../../lib/forms/collectStrings';
import { CAMPAIGN_STATUS_LABELS } from '../../../lib/forms/surveyStrings';
import { useSurveyCapabilities } from '../../../lib/forms/useSurveyCapabilities';
import { renderQrDataUrl } from '../../../lib/qr';
import { CopyField } from './share/CopyField';
import { InvitationsSection } from './share/InvitationsSection';
import { PrintOptionsSection } from './share/PrintOptionsSection';

const publicFormUrl = (slug: string, campaignCode?: string) =>
  `${window.location.origin}/sales/#/f/${slug}${campaignCode === undefined ? '' : `?c=${encodeURIComponent(campaignCode)}`}`;

// Share tab of the form workspace: public link + QR, campaign links,
// one-time invitations and print options.
export const FormSharePanel = ({ form, onChanged }: { form: SurveyForm; onChanged: () => void }) => {
  const { capabilities } = useSurveyCapabilities();
  const [campaigns, setCampaigns] = useState<SurveyCampaign[]>([]);
  const [qr, setQr] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState(false);
  const published = form.publishedVersion !== null && form.publicSlug !== '';
  const url = published ? publicFormUrl(form.publicSlug) : null;
  const acceptsResponses = form.formStatus === 'PUBLISHED';

  useEffect(() => {
    listCampaigns()
      .then((all) => setCampaigns(all.filter((campaign) => form.campaignIds.includes(campaign.id))))
      .catch(() => setCampaigns([]));
  }, [form.campaignIds]);

  useEffect(() => {
    setQr(null);
    if (url === null) return;

    renderQrDataUrl(url).then(setQr).catch(() => setQr(null));
  }, [url]);

  const togglePublic = async () => {
    setToggling(true);
    setToggleError(false);

    try {
      await updateFormSettings(form.id, { publicEnabled: !form.publicEnabled });
      onChanged();
    } catch {
      setToggleError(true);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="svc-share">
      <section className="card svc-share-card">
        <h3>{TC.publicLink}</h3>
        {url === null ? (
          <p className="svc-hint">{TC.notPublishedShare}</p>
        ) : (
          <>
            {!acceptsResponses && <div className="svc-warning"><p>{TC.formNotOpen}</p></div>}
            {!form.publicEnabled && <div className="svc-warning"><p>{TC.publicLinkOff}</p></div>}
            <div className="svc-share-link">
              <div className="svc-share-link-main">
                <CopyField value={url} />
                <div className="svc-row">
                  <a
                    className="btn line sm"
                    href={`https://wa.me/?text=${encodeURIComponent(`${form.name}\n${url}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {TC.whatsapp}
                  </a>
                  {qr !== null && (
                    <a className="btn line sm" href={qr} download={`form-${form.publicSlug}.png`}>
                      {TC.downloadQr}
                    </a>
                  )}
                </div>
              </div>
              {qr !== null && <img className="svc-share-qr" src={qr} alt={TC.publicLink} />}
            </div>
            <p className="svc-hint">{TC.republishNote}</p>
          </>
        )}

        {capabilities.canBuild && (
          <label className="svc-switch">
            <input
              type="checkbox"
              role="switch"
              checked={form.publicEnabled}
              disabled={toggling}
              onChange={() => void togglePublic()}
            />
            <span>{form.publicEnabled ? TC.publicEnabled : TC.publicDisabled}</span>
          </label>
        )}
        {toggleError && <div className="error-banner" role="alert">{TC.toggleFailed}</div>}
      </section>

      {url !== null && (
        <section className="card svc-share-card">
          <h3>{TC.campaignLinks}</h3>
          <p className="svc-hint">{TC.campaignLinksHint}</p>
          {campaigns.length === 0 && <p className="svc-hint">{TC.noCampaigns}</p>}
          {campaigns.map((campaign) => (
            <div key={campaign.id} className="svc-campaign-link">
              <div className="svc-row">
                <b dir="auto">{campaign.name}</b>
                <span className={`pill${campaign.campaignStatus === 'ACTIVE' ? ' ok' : ''}`}>
                  {CAMPAIGN_STATUS_LABELS[campaign.campaignStatus]}
                </span>
                {campaign.campaignStatus !== 'ACTIVE' && <small className="svc-muted">{TC.campaignInactive}</small>}
              </div>
              {campaign.publicCode !== '' && <CopyField value={publicFormUrl(form.publicSlug, campaign.publicCode)} />}
            </div>
          ))}
        </section>
      )}

      {url !== null && (
        <section className="card svc-share-card">
          <h3>{TC.invitations}</h3>
          <p className="svc-hint">{TC.invitationsHint}</p>
          {capabilities.canInvite ? (
            <InvitationsSection formId={form.id} campaigns={campaigns} />
          ) : (
            <p className="svc-hint">{TC.noInvitePermission}</p>
          )}
        </section>
      )}

      <section className="card svc-share-card">
        <h3>{TC.printOptions}</h3>
        <PrintOptionsSection formId={form.id} published={published} campaigns={campaigns} />
      </section>
    </div>
  );
};
