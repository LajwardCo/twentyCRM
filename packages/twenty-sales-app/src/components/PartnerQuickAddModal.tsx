import { useState } from 'react';

import {
  createPartner,
  type Partner,
  PARTNER_TYPES,
  type PartnerType,
} from '../api/partners';
import { PARTNER_TYPE_LABELS, T, T9, T13 } from '../lib/strings';

// Creating a referrer/marketer from the picker that needed them.
//
// A seller standing in a clinic gets told "Dr. Najib sent us" -- and until this
// existed, that name could only be entered by leaving the half-typed lead,
// opening the partners screen, adding them and starting the form again. Now the
// picker's own "add new" row opens this with the typed name already in it.
//
// Deliberately the SAME record the partners screen manages, not a lighter
// second kind of referrer: a name added here shows up there, keeps its
// commission, and is picked from every other lead.

type PartnerQuickAddModalProps = {
  // Whatever was typed into the picker, so the name isn't asked for twice.
  initialName: string;
  defaultType: PartnerType;
  // The names already in the list. Checked here rather than only on the server,
  // which happily creates a second partner with the same name -- and then every
  // picker shows two identical rows and the commission goes to a coin toss.
  existingNames: string[];
  onCancel: () => void;
  // May do the follow-up save (e.g. attach the partner to a lead); a rejection
  // there is shown here rather than lost, since the dialog is still open.
  onCreated: (partner: Partner) => void | Promise<void>;
};

export const PartnerQuickAddModal = ({
  initialName,
  defaultType,
  existingNames,
  onCancel,
  onCreated,
}: PartnerQuickAddModalProps) => {
  const [name, setName] = useState(initialName);
  const [partnerType, setPartnerType] = useState<PartnerType>(defaultType);
  const [commissionInput, setCommissionInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed === '') {
      setError(T13.partnerNameRequired);
      return;
    }
    if (
      existingNames.some(
        (existing) => existing.trim().toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      setError(T13.partnerDuplicateName);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const commission = Number(commissionInput.trim());
      const result = await createPartner({
        name: trimmed,
        partnerType,
        commissionPercent:
          commissionInput.trim() === '' || !Number.isFinite(commission)
            ? null
            : commission,
      });
      if (!result.supported) {
        setError(T13.quickAddPartnerUnsupported);
        return;
      }
      await onCreated(result.value);
    } catch (err) {
      setError(err instanceof Error ? err.message : T13.partnerSaveFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="card-pad">
          <h3>{T13.quickAddPartnerTitle}</h3>
          <div className="sub" style={{ marginTop: 2 }}>
            {T13.quickAddPartnerHint}
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="fld">
              <label htmlFor="pqa-name">{T13.partnerNameLbl}</label>
              <input
                id="pqa-name"
                value={name}
                autoFocus
                onChange={(event) => setName(event.target.value)}
                // The dialog opens over a form; Enter has to save this and
                // nothing else.
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void save();
                  }
                }}
              />
            </div>
            <div className="f2">
              <div className="fld">
                <label htmlFor="pqa-type">{T13.partnerTypeLbl}</label>
                <select
                  id="pqa-type"
                  value={partnerType}
                  onChange={(event) =>
                    setPartnerType(event.target.value as PartnerType)
                  }
                >
                  {PARTNER_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {PARTNER_TYPE_LABELS[value] ?? value}
                    </option>
                  ))}
                </select>
              </div>
              <div className="fld">
                <label htmlFor="pqa-commission">
                  {T13.partnerCommissionLbl}
                </label>
                <input
                  id="pqa-commission"
                  inputMode="decimal"
                  dir="ltr"
                  value={commissionInput}
                  onChange={(event) => setCommissionInput(event.target.value)}
                />
              </div>
            </div>
          </div>

          {error !== null && <div className="err">{error}</div>}

          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 12,
              justifyContent: 'flex-end',
            }}
          >
            <button type="button" className="btn line sm" onClick={onCancel}>
              {T9.cancel}
            </button>
            <button
              type="button"
              className="btn gold sm"
              disabled={busy || name.trim() === ''}
              onClick={() => void save()}
            >
              {busy ? T.saving : T13.quickAddPartnerSave}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
