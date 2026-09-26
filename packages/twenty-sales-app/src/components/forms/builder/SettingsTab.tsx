import { useId, useState } from 'react';

import { fetchMembers } from '../../../api/admin';
import {
  type SurveyForm,
  type SurveyPurpose,
  listCampaigns,
  updateFormSettings,
} from '../../../api/surveys';
import { useCached } from '../../../lib/cache';
import { TB } from '../../../lib/forms/builderStrings';
import { type StatusAction, statusActionsFor } from '../../../lib/forms/builder/formsList';
import {
  type SettingsDraft,
  buildSettingsPatch,
  settingsDraftFrom,
  settingsProblems,
} from '../../../lib/forms/builder/settingsForm';
import { FORM_STATUS_LABELS, PURPOSE_LABELS, TSV } from '../../../lib/forms/surveyStrings';
import { JalaliDatePicker } from '../../JalaliDatePicker';
import { NumberField } from '../../NumberField';
import { StatusChangeDialog } from './StatusChangeDialog';
import { VersionHistory } from './VersionHistory';

type SettingsTabProps = {
  form: SurveyForm;
  readOnly: boolean;
  canChangeStatus: boolean;
  onChanged: () => void;
};

export const SettingsTab = ({ form, readOnly, canChangeStatus, onChanged }: SettingsTabProps) => {
  const id = useId();
  const [draft, setDraft] = useState<SettingsDraft>(() => settingsDraftFrom(form));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [statusAction, setStatusAction] = useState<StatusAction | null>(null);
  const { data: members } = useCached('workspace-members', fetchMembers);
  const { data: campaigns, error: campaignsError } = useCached('survey-campaigns', listCampaigns);
  const patch = buildSettingsPatch(form, draft);
  const dirty = Object.keys(patch).length > 0;
  const problems = settingsProblems(draft);
  const set = (next: Partial<SettingsDraft>) => {
    setDraft((current) => ({ ...current, ...next }));
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await updateFormSettings(form.id, patch);
      setMessage({ ok: true, text: TB.settingsSaved });
      onChanged();
    } catch (failure) {
      setMessage({ ok: false, text: `${TB.settingsSaveFailed}: ${failure instanceof Error ? failure.message : ''}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="svb-settings-grid">
      <fieldset disabled={readOnly} className="svb-fieldset card card-pad">
        <h3>{TB.settingsGeneral}</h3>
        <div className="fld svb-fld">
          <label htmlFor={`${id}-name`}>{TB.formName}</label>
          <input id={`${id}-name`} dir="auto" value={draft.name} aria-invalid={problems.includes('NAME_REQUIRED')} onChange={(event) => set({ name: event.target.value })} />
          {problems.includes('NAME_REQUIRED') && <p className="svb-hint error">{TB.nameRequired}</p>}
        </div>
        <div className="svb-pair">
          <div className="fld svb-fld">
            <label htmlFor={`${id}-purpose`}>{TSV.purpose}</label>
            <select id={`${id}-purpose`} value={draft.purpose} onChange={(event) => set({ purpose: event.target.value as SurveyPurpose })}>
              {(Object.keys(PURPOSE_LABELS) as SurveyPurpose[]).map((purpose) => (
                <option key={purpose} value={purpose}>
                  {PURPOSE_LABELS[purpose]}
                </option>
              ))}
            </select>
          </div>
          <div className="fld svb-fld">
            <label htmlFor={`${id}-owner`}>{TB.owner}</label>
            <select id={`${id}-owner`} value={draft.ownerId} onChange={(event) => set({ ownerId: event.target.value })}>
              {draft.ownerId === '' && <option value="">—</option>}
              {form.owner !== null && !(members ?? []).some((member) => member.id === form.owner?.id) && (
                <option value={form.owner.id}>{`${form.owner.name.firstName} ${form.owner.name.lastName}`}</option>
              )}
              {(members ?? []).map((member) => (
                <option key={member.id} value={member.id}>
                  {`${member.name.firstName} ${member.name.lastName}`.trim() || member.userEmail}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="fld svb-fld">
          <label htmlFor={`${id}-description`}>{TB.formDescription}</label>
          <textarea id={`${id}-description`} dir="auto" rows={3} value={draft.description} onChange={(event) => set({ description: event.target.value })} />
        </div>

        <h3 className="svb-subhead">{TB.publicAccess}</h3>
        <label className="svb-check">
          <input type="checkbox" checked={draft.publicEnabled} onChange={(event) => set({ publicEnabled: event.target.checked })} />
          {TB.publicEnabled}
        </label>
        <p className="svb-hint">{TB.publicEnabledHint}</p>
        <div className="svb-pair">
          <div className="fld svb-fld">
            <label htmlFor={`${id}-opens`}>{TB.opensAt}</label>
            <div className="svb-inline">
              <JalaliDatePicker id={`${id}-opens`} value={draft.opensAt} onChange={(opensAt) => set({ opensAt })} withTime />
              {draft.opensAt !== '' && (
                <button type="button" className="btn line sm" onClick={() => set({ opensAt: '' })}>
                  {TB.clearDate}
                </button>
              )}
            </div>
          </div>
          <div className="fld svb-fld">
            <label htmlFor={`${id}-closes`}>{TB.closesAt}</label>
            <div className="svb-inline">
              <JalaliDatePicker id={`${id}-closes`} value={draft.closesAt} onChange={(closesAt) => set({ closesAt })} withTime />
              {draft.closesAt !== '' && (
                <button type="button" className="btn line sm" onClick={() => set({ closesAt: '' })}>
                  {TB.clearDate}
                </button>
              )}
            </div>
          </div>
        </div>
        {problems.includes('CLOSE_BEFORE_OPEN') && <p className="svb-hint error">{TB.closeDateBeforeOpen}</p>}
        <div className="fld svb-fld">
          <label htmlFor={`${id}-limit`}>{TB.responseLimit}</label>
          <NumberField id={`${id}-limit`} integer value={draft.responseLimit} placeholder={TB.noLimit} onChange={(responseLimit) => set({ responseLimit })} />
        </div>

        <fieldset className="svb-group">
          <legend>{TB.campaigns}</legend>
          {campaignsError !== null && campaigns === null && <p className="svb-hint error">{TSV.loadError}</p>}
          {campaigns !== null && campaigns.length === 0 && <p className="svb-hint">{TB.noCampaigns}</p>}
          <div className="svb-check-col">
            {(campaigns ?? []).map((campaign) => (
              <label key={campaign.id} className="svb-check">
                <input
                  type="checkbox"
                  checked={draft.campaignIds.includes(campaign.id)}
                  onChange={(event) =>
                    set({
                      campaignIds: event.target.checked
                        ? [...draft.campaignIds, campaign.id]
                        : draft.campaignIds.filter((candidate) => candidate !== campaign.id),
                    })
                  }
                />
                <span dir="auto">{campaign.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {message !== null && (
          <p className={message.ok ? 'svb-note ok' : 'error-banner'} role="status">
            {message.text}
          </p>
        )}
        <button type="button" className="btn gold" disabled={!dirty || saving || problems.length > 0} onClick={() => void save()}>
          {saving ? TSV.saving : TB.saveSettings}
        </button>
      </fieldset>

      <div className="svb-settings-side">
        <section className="card card-pad">
          <h3>{TB.statusSection}</h3>
          <p>
            {TB.currentStatus}: <span className={`pill svb-status ${form.formStatus.toLowerCase()}`}>{FORM_STATUS_LABELS[form.formStatus]}</span>
          </p>
          {canChangeStatus ? (
            <div className="svb-inline">
              {statusActionsFor(form).map((action) => (
                <button
                  key={action.kind}
                  type="button"
                  className={`btn line sm${action.kind === 'archive' || action.kind === 'close' ? ' danger' : ''}`}
                  onClick={() => setStatusAction(action)}
                >
                  {TB.statusAction[action.kind]}
                </button>
              ))}
            </div>
          ) : (
            <p className="svb-hint">{TSV.noPermission}</p>
          )}
          <p className="svb-hint">{TB.archiveInsteadOfDelete}</p>
        </section>
        <section className="card card-pad">
          <h3>{TB.versions}</h3>
          <VersionHistory formId={form.id} currentVersionNumber={form.currentVersionNumber} />
        </section>
      </div>

      {statusAction !== null && (
        <StatusChangeDialog
          formId={form.id}
          formName={form.name}
          action={statusAction}
          onCancel={() => setStatusAction(null)}
          onDone={() => {
            setStatusAction(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
};
