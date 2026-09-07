import { useState } from 'react';

import { type CompanyAddress, updateCompanyAddress } from '../api/records';
import { T13 } from '../lib/strings';
import { ModalSheet } from './ModalSheet';

type CompanyAddressModalProps = {
  companyId: string;
  address: CompanyAddress | null;
  onClose: () => void;
  onSaved: (message: string) => void;
};

const FIELDS: { key: keyof CompanyAddress; label: string; wide: boolean }[] = [
  { key: 'addressStreet1', label: T13.addressStreet1Lbl, wide: true },
  { key: 'addressStreet2', label: T13.addressStreet2Lbl, wide: true },
  { key: 'addressCity', label: T13.addressCityLbl, wide: false },
  { key: 'addressState', label: T13.addressStateLbl, wide: false },
  { key: 'addressPostcode', label: T13.addressPostcodeLbl, wide: false },
  { key: 'addressCountry', label: T13.addressCountryLbl, wide: false },
];

const toDraft = (address: CompanyAddress | null): CompanyAddress => ({
  addressStreet1: address?.addressStreet1 ?? '',
  addressStreet2: address?.addressStreet2 ?? '',
  addressCity: address?.addressCity ?? '',
  addressState: address?.addressState ?? '',
  addressPostcode: address?.addressPostcode ?? '',
  addressCountry: address?.addressCountry ?? '',
});

export const CompanyAddressModal = ({
  companyId,
  address,
  onClose,
  onSaved,
}: CompanyAddressModalProps) => {
  const [draft, setDraft] = useState<CompanyAddress>(() => toDraft(address));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = (key: keyof CompanyAddress, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateCompanyAddress(companyId, draft);
      onSaved(T13.addressSaved);
    } catch (err) {
      setError(err instanceof Error ? err.message : T13.addressSaveFailed);
    } finally {
      setBusy(false);
    }
  };

  // Narrow fields are laid out two per row; the street lines get a row each.
  const rows: (typeof FIELDS)[] = [];
  for (const field of FIELDS) {
    const last = rows[rows.length - 1];
    if (field.wide || last === undefined || last.length === 2 || last[0].wide) {
      rows.push([field]);
    } else {
      last.push(field);
    }
  }

  return (
    <ModalSheet title={T13.addressTitle} onClose={onClose}>
      {rows.map((row) => (
        <div key={row[0].key} className={row.length === 2 ? 'f2' : undefined}>
          {row.map((field) => (
            <div className="fld" key={field.key}>
              <label htmlFor={`addr-${field.key}`}>{field.label}</label>
              <input
                id={`addr-${field.key}`}
                value={draft[field.key] ?? ''}
                onChange={(e) => setField(field.key, e.target.value)}
              />
            </div>
          ))}
        </div>
      ))}

      {error !== null && <div className="error-banner">{error}</div>}

      <button
        className="btn gold block"
        style={{ padding: 12 }}
        disabled={busy}
        onClick={() => void save()}
      >
        {busy ? T13.savingLbl : T13.save}
      </button>
    </ModalSheet>
  );
};
