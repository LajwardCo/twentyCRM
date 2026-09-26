import { useEffect, useState } from 'react';

import { createCompany, createPerson } from '../../../api/surveyCrm';
import { type SimilarCompany, findSimilarCompanies } from '../../../api/surveyCollect';
import { type VisitRecordRef } from '../../../lib/forms/collect/visitState';
import { TC } from '../../../lib/forms/collectStrings';
import { CrmRecordPicker } from '../CrmRecordPicker';

type VisitBusinessStepProps = {
  onPick: (company: VisitRecordRef, person: VisitRecordRef | null) => void;
};

// Find the business, or add it as a new prospect on the spot. Similar names
// already in the CRM are shown first so two collectors do not add one shop
// twice.
export const VisitBusinessStep = ({ onPick }: VisitBusinessStepProps) => {
  const [adding, setAdding] = useState<{ name: string } | null>(null);
  const [city, setCity] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [similar, setSimilar] = useState<SimilarCompany[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = adding?.name ?? '';

  useEffect(() => {
    if (adding === null) return;

    const handle = window.setTimeout(() => {
      findSimilarCompanies(name)
        .then(setSimilar)
        .catch(() => setSimilar([]));
    }, 300);

    return () => window.clearTimeout(handle);
  }, [adding, name]);

  const create = async () => {
    if (name.trim() === '') return;

    setBusy(true);
    setError(null);

    try {
      const company = await createCompany({ name, city: city.trim() });
      let person: VisitRecordRef | null = null;

      if (contact.trim() !== '' || phone.trim() !== '') {
        const [firstName, ...rest] = (contact.trim() || name.trim()).split(/\s+/);
        const created = await createPerson({
          firstName,
          lastName: rest.join(' '),
          phone: phone.trim() || undefined,
          companyId: company.id,
        });

        person = { id: created.id, label: contact.trim() || phone.trim() };
      }

      onPick({ id: company.id, label: name.trim() }, person);
    } catch {
      setError(TC.visitFailed);
    } finally {
      setBusy(false);
    }
  };

  if (adding === null) {
    return (
      <div className="svc-step-body">
        <label className="svc-label" htmlFor="svc-visit-company">{TC.findBusiness}</label>
        <CrmRecordPicker
          kind="company"
          inputId="svc-visit-company"
          value={null}
          onChange={(value) => {
            if (value !== null) onPick({ id: value.recordId, label: value.label }, null);
          }}
          onCreate={(typed) => setAdding({ name: typed })}
          createLabel={TC.addProspect}
        />
        <button type="button" className="btn line svc-big" onClick={() => setAdding({ name: '' })}>
          + {TC.addProspect}
        </button>
      </div>
    );
  }

  return (
    <div className="svc-step-body">
      <div className="fld">
        <label htmlFor="svc-prospect-name">{TC.prospectName}</label>
        <input
          id="svc-prospect-name"
          dir="auto"
          value={name}
          autoFocus
          onChange={(event) => setAdding({ name: event.target.value })}
        />
      </div>
      {similar.length > 0 && (
        <div className="svc-warning" role="status">
          <p>{TC.duplicateCompanies}</p>
          {similar.map((company) => (
            <button
              key={company.id}
              type="button"
              className="btn line sm"
              onClick={() => onPick({ id: company.id, label: company.name }, null)}
            >
              <span dir="auto">{company.name}</span>
              {company.city !== '' && <small dir="auto"> · {company.city}</small>}
            </button>
          ))}
        </div>
      )}
      <div className="fld">
        <label htmlFor="svc-prospect-city">{TC.prospectCity}</label>
        <input id="svc-prospect-city" dir="auto" value={city} onChange={(event) => setCity(event.target.value)} />
      </div>
      <div className="svc-grid2">
        <div className="fld">
          <label htmlFor="svc-prospect-contact">{TC.prospectContact}</label>
          <input
            id="svc-prospect-contact"
            dir="auto"
            value={contact}
            onChange={(event) => setContact(event.target.value)}
          />
        </div>
        <div className="fld">
          <label htmlFor="svc-prospect-phone">{TC.prospectPhone}</label>
          <input
            id="svc-prospect-phone"
            dir="ltr"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>
      </div>
      {error !== null && <div className="error-banner" role="alert">{error}</div>}
      <div className="svc-actions">
        <button type="button" className="btn line" onClick={() => setAdding(null)}>
          {TC.back}
        </button>
        <button
          type="button"
          className="btn gold svc-big"
          disabled={busy || name.trim() === ''}
          onClick={() => void create()}
        >
          {busy ? TC.creatingProspect : TC.createProspect}
        </button>
      </div>
    </div>
  );
};
