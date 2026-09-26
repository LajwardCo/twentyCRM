import { useState } from 'react';

import { type SurveyCampaign } from '../../../../api/surveys';
import { TC } from '../../../../lib/forms/collectStrings';
import { buildPrintQuery, clampCopies } from '../../../../lib/forms/print/printLayout';
import { NumberField } from '../../../NumberField';

type PrintOptionsSectionProps = {
  formId: string;
  published: boolean;
  campaigns: SurveyCampaign[];
};

// Opens the A4 print document in a new tab with the chosen options.
export const PrintOptionsSection = ({ formId, published, campaigns }: PrintOptionsSectionProps) => {
  const [copies, setCopies] = useState<number | null>(1);
  const [sheetRefs, setSheetRefs] = useState(false);
  const [qr, setQr] = useState(false);
  const [staff, setStaff] = useState(false);
  const [draft, setDraft] = useState(!published);
  const [campaignId, setCampaignId] = useState('');

  const open = () => {
    const query = buildPrintQuery({
      draft,
      copies: clampCopies(copies ?? 1),
      sheetRefs: sheetRefs && !draft,
      qr: qr && !draft,
      audience: staff ? 'STAFF' : 'PUBLIC',
      campaignId: campaignId === '' ? null : campaignId,
    });

    window.open(
      `${window.location.origin}${window.location.pathname}#/form/${formId}/print${query === '' ? '' : `?${query}`}`,
      '_blank',
      'noopener',
    );
  };

  return (
    <div className="svc-print-options">
      <div className="svc-grid3">
        <div className="fld">
          <label htmlFor="svc-print-copies">{TC.copies}</label>
          <NumberField id="svc-print-copies" integer value={copies} onChange={setCopies} />
        </div>
        {campaigns.length > 0 && (
          <div className="fld">
            <label htmlFor="svc-print-campaign">{TC.printCampaign}</label>
            <select id="svc-print-campaign" value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
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
      <div className="svc-checks">
        <label>
          <input type="checkbox" checked={sheetRefs} disabled={draft} onChange={(event) => setSheetRefs(event.target.checked)} />
          {TC.sheetRefs}
        </label>
        <label>
          <input type="checkbox" checked={qr} disabled={draft} onChange={(event) => setQr(event.target.checked)} />
          {TC.includeQr}
        </label>
        <label>
          <input type="checkbox" checked={staff} onChange={(event) => setStaff(event.target.checked)} />
          {TC.staffVersion}
        </label>
        <label>
          <input type="checkbox" checked={draft} disabled={!published} onChange={(event) => setDraft(event.target.checked)} />
          {TC.printDraft}
        </label>
      </div>
      <button type="button" className="btn gold" onClick={open}>
        {TC.openPrint}
      </button>
    </div>
  );
};
