import { type FormEvent, useState } from 'react';

import { type CampaignStatus, createCampaign } from '../../../api/surveys';
import { localDateToIso } from '../../../lib/forms/insights';
import { TINS } from '../../../lib/forms/insightStrings';
import { CAMPAIGN_STATUS_LABELS } from '../../../lib/forms/surveyStrings';
import { JalaliDatePicker } from '../../JalaliDatePicker';
import { ModalSheet } from '../../ModalSheet';

export const CAMPAIGN_STATUSES: CampaignStatus[] = ['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'];

// Only the essentials; assignees, forms, channels and targets are set on
// the campaign page once it exists.
export const CampaignCreateSheet = ({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (campaignId: string) => void;
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<CampaignStatus>('PLANNED');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (name.trim() === '') {
      setError(TINS.nameRequired);
      return;
    }

    if (startsAt !== '' && endsAt !== '' && endsAt < startsAt) {
      setError(TINS.datesInvalid);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const { id } = await createCampaign({
        name: name.trim(),
        description: description.trim(),
        campaignStatus: status,
        startsAt: localDateToIso(startsAt),
        endsAt: localDateToIso(endsAt),
        city: city.trim(),
      });

      onCreated(id);
    } catch {
      setError(TINS.saveFailed);
      setBusy(false);
    }
  };

  return (
    <ModalSheet title={TINS.createTitle} onClose={onClose}>
      <form className="svk-sheet-form" onSubmit={(event) => void submit(event)} noValidate>
        <div className="fld">
          <label htmlFor="svk-new-name">{TINS.campaignName}</label>
          <input
            id="svk-new-name"
            value={name}
            autoFocus
            dir="auto"
            required
            aria-invalid={error === TINS.nameRequired}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="fld">
          <label htmlFor="svk-new-description">{TINS.description}</label>
          <textarea
            id="svk-new-description"
            value={description}
            dir="auto"
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="f2">
          <div className="fld">
            <label htmlFor="svk-new-start">{TINS.startsAt}</label>
            <JalaliDatePicker id="svk-new-start" withTime={false} value={startsAt} onChange={setStartsAt} />
          </div>
          <div className="fld">
            <label htmlFor="svk-new-end">{TINS.endsAt}</label>
            <JalaliDatePicker id="svk-new-end" withTime={false} value={endsAt} onChange={setEndsAt} />
          </div>
        </div>
        <div className="f2">
          <div className="fld">
            <label htmlFor="svk-new-city">{TINS.city}</label>
            <input id="svk-new-city" value={city} dir="auto" onChange={(event) => setCity(event.target.value)} />
          </div>
          <div className="fld">
            <label htmlFor="svk-new-status">{TINS.status}</label>
            <select
              id="svk-new-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as CampaignStatus)}
            >
              {CAMPAIGN_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {CAMPAIGN_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error !== null && (
          <div className="err" role="alert">
            {error}
          </div>
        )}
        <div className="svk-sheet-actions">
          <button type="submit" className="btn gold" disabled={busy}>
            {busy ? TINS.creating : TINS.create}
          </button>
          <button type="button" className="btn line" disabled={busy} onClick={onClose}>
            {TINS.cancel}
          </button>
        </div>
      </form>
    </ModalSheet>
  );
};
