import { useState } from 'react';

import { type CrmRecordKind } from '../../../../api/surveyCrm';
import { type InvitationTarget, type SurveyCampaign, createInvitations } from '../../../../api/surveys';
import { TC } from '../../../../lib/forms/collectStrings';
import { toPersianDigits } from '../../../../lib/jalali';
import { JalaliDatePicker } from '../../../JalaliDatePicker';
import { NumberField } from '../../../NumberField';
import { CrmRecordPicker } from '../../CrmRecordPicker';
import { CopyField, copyText } from './CopyField';

type Target = { kind: CrmRecordKind; recordId: string; label: string };

const MAX_PER_REQUEST = 200;

const KIND_LABELS: Record<CrmRecordKind, string> = {
  company: TC.kindCompany,
  person: TC.kindPerson,
  opportunity: TC.kindLead,
};

const toInvitationTarget = (target: Target): InvitationTarget => ({
  label: target.label,
  ...(target.kind === 'company' ? { companyId: target.recordId } : {}),
  ...(target.kind === 'person' ? { personId: target.recordId } : {}),
  ...(target.kind === 'opportunity' ? { opportunityId: target.recordId } : {}),
});

// One-time links for named recipients (a suggestion of who answered, never
// proof) or anonymous batches. The plain URLs exist only in this response —
// the server keeps hashes — so they are shown once, with copy buttons.
export const InvitationsSection = ({ formId, campaigns }: { formId: string; campaigns: SurveyCampaign[] }) => {
  const [kind, setKind] = useState<CrmRecordKind>('company');
  const [targets, setTargets] = useState<Target[]>([]);
  const [anonymous, setAnonymous] = useState<number | null>(null);
  const [expiry, setExpiry] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; label: string; url: string }[] | null>(null);

  const anonymousCount = Math.max(0, Math.min(MAX_PER_REQUEST - targets.length, anonymous ?? 0));

  const create = async () => {
    const all: InvitationTarget[] = [
      ...targets.map(toInvitationTarget),
      ...Array.from({ length: anonymousCount }, () => ({})),
    ];

    if (all.length === 0) {
      setError(TC.noInviteTargets);

      return;
    }

    setBusy(true);
    setError(null);

    try {
      // End of the chosen day, local time.
      const expiresAt = /^\d{4}-\d{2}-\d{2}/.test(expiry)
        ? new Date(`${expiry.slice(0, 10)}T23:59:59`).toISOString()
        : null;
      const result = await createInvitations(formId, {
        targets: all,
        campaignId: campaignId === '' ? null : campaignId,
        expiresAt,
      });

      setCreated(result.invitations);
      setTargets([]);
      setAnonymous(null);
    } catch (caught) {
      setError(caught instanceof Error && caught.message !== '' ? caught.message : TC.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  if (created !== null) {
    return (
      <div className="svc-invites-result">
        <div className="svc-warning" role="status">
          <p>{TC.invitationsCreated}</p>
          <button
            type="button"
            className="btn line sm"
            onClick={() => void copyText(created.map((entry) => `${entry.label}\t${entry.url}`).join('\n'))}
          >
            {TC.copyAll}
          </button>
        </div>
        {created.map((entry) => (
          <CopyField key={entry.id} label={entry.label} value={entry.url} />
        ))}
        <button type="button" className="btn line sm" onClick={() => setCreated(null)}>
          {TC.close}
        </button>
      </div>
    );
  }

  return (
    <div className="svc-invites">
      <div className="svc-label">{TC.invitationTargets}</div>
      <div className="svc-invite-picker">
        <select aria-label={TC.targetKind} value={kind} onChange={(event) => setKind(event.target.value as CrmRecordKind)}>
          {(Object.keys(KIND_LABELS) as CrmRecordKind[]).map((candidate) => (
            <option key={candidate} value={candidate}>
              {KIND_LABELS[candidate]}
            </option>
          ))}
        </select>
        <CrmRecordPicker
          key={`${kind}-${targets.length}`}
          kind={kind}
          value={null}
          onChange={(value) => {
            if (value === null || targets.some((target) => target.recordId === value.recordId)) return;
            setTargets((previous) => [...previous, { kind, recordId: value.recordId, label: value.label }]);
          }}
        />
      </div>
      {targets.length > 0 && (
        <ul className="svc-target-list">
          {targets.map((target) => (
            <li key={target.recordId}>
              <span className="svc-chip">{KIND_LABELS[target.kind]}</span>
              <span dir="auto">{target.label}</span>
              <button
                type="button"
                className="btn line sm"
                onClick={() => setTargets((previous) => previous.filter((entry) => entry.recordId !== target.recordId))}
              >
                {TC.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="svc-grid3">
        <div className="fld">
          <label htmlFor="svc-invite-anon">{TC.anonymousCount}</label>
          <NumberField id="svc-invite-anon" integer value={anonymous} onChange={setAnonymous} />
        </div>
        <div className="fld">
          <label htmlFor="svc-invite-expiry">{TC.expiresAt}</label>
          <JalaliDatePicker id="svc-invite-expiry" withTime={false} value={expiry} onChange={setExpiry} />
        </div>
        {campaigns.length > 0 && (
          <div className="fld">
            <label htmlFor="svc-invite-campaign">{TC.invitationCampaign}</label>
            <select id="svc-invite-campaign" value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
              <option value="">{TC.noCampaign}</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {error !== null && <div className="error-banner" role="alert">{error}</div>}
      <button type="button" className="btn gold" disabled={busy} onClick={() => void create()}>
        {busy
          ? TC.creatingInvitations
          : `${TC.createInvitations} (${toPersianDigits(targets.length + anonymousCount)})`}
      </button>
    </div>
  );
};
