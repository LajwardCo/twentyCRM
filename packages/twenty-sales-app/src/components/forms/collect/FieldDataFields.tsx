import { useState } from 'react';

import { type BuyingInterest, type LocationValue } from '../../../api/surveys';
import { toPersianDigits } from '../../../lib/jalali';
import { type FieldData } from '../../../lib/forms/collect/staffDraft';
import { TC } from '../../../lib/forms/collectStrings';
import { INTEREST_LABELS } from '../../../lib/forms/surveyStrings';

type FieldDataFieldsProps = {
  value: FieldData;
  onChange: (patch: Partial<FieldData>) => void;
  idPrefix: string;
};

const INTERESTS: BuyingInterest[] = ['INTERESTED', 'UNDECIDED', 'NOT_INTERESTED'];

// Staff-only facts about the visit that are not questions on the form:
// buying interest (kept apart from the visit outcome), city/area, location.
export const FieldDataFields = ({ value, onChange, idPrefix }: FieldDataFieldsProps) => {
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState(false);
  const location = value.location;

  const captureGps = () => {
    if (!('geolocation' in navigator)) {
      setGpsError(true);

      return;
    }

    setLocating(true);
    setGpsError(false);
    // The permission prompt appears only now, because the collector asked.
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onChange({
          location: {
            lat: Number(position.coords.latitude.toFixed(6)),
            lng: Number(position.coords.longitude.toFixed(6)),
            accuracy: Math.round(position.coords.accuracy),
            source: 'GPS',
            description: location?.description,
          },
        });
      },
      () => {
        setLocating(false);
        setGpsError(true);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  const setDescription = (description: string) => {
    const next: LocationValue =
      location !== null
        ? { ...location, description }
        : { source: 'MANUAL', description };

    onChange({
      location:
        next.lat === undefined && (next.description ?? '').trim() === '' ? null : next,
    });
  };

  return (
    <fieldset className="svc-fieldset">
      <legend>{TC.fieldData}</legend>

      <div className="svc-field">
        <span className="svc-label" id={`${idPrefix}-interest`}>{TC.buyingInterest}</span>
        <div className="svc-segments" role="radiogroup" aria-labelledby={`${idPrefix}-interest`}>
          {INTERESTS.map((interest) => (
            <button
              key={interest}
              type="button"
              role="radio"
              aria-checked={value.buyingInterest === interest}
              className={`svc-segment${value.buyingInterest === interest ? ' on' : ''}`}
              onClick={() =>
                onChange({ buyingInterest: value.buyingInterest === interest ? null : interest })
              }
            >
              {INTEREST_LABELS[interest]}
            </button>
          ))}
        </div>
      </div>

      <div className="svc-grid2">
        <div className="fld">
          <label htmlFor={`${idPrefix}-city`}>{TC.city}</label>
          <input
            id={`${idPrefix}-city`}
            dir="auto"
            value={value.city}
            onChange={(event) => onChange({ city: event.target.value })}
          />
        </div>
        <div className="fld">
          <label htmlFor={`${idPrefix}-area`}>{TC.area}</label>
          <input
            id={`${idPrefix}-area`}
            dir="auto"
            value={value.area}
            onChange={(event) => onChange({ area: event.target.value })}
          />
        </div>
      </div>

      <div className="svc-field">
        <span className="svc-label">{TC.location}</span>
        <div className="svc-row">
          <button type="button" className="btn line sm" disabled={locating} onClick={captureGps}>
            {locating ? TC.capturingGps : TC.captureGps}
          </button>
          {location?.lat !== undefined && (
            <button type="button" className="btn line sm" onClick={() => onChange({ location: null })}>
              {TC.clearLocation}
            </button>
          )}
        </div>
        {location?.lat !== undefined && location.lng !== undefined ? (
          <div className="svc-hint svc-ok" dir="ltr">
            {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
            {location.accuracy !== undefined && (
              <span dir="rtl"> — {TC.gpsCaptured(toPersianDigits(location.accuracy))}</span>
            )}
          </div>
        ) : (
          <div className="svc-hint">{gpsError ? TC.gpsUnavailable : TC.gpsHint}</div>
        )}
        <div className="fld svc-tight">
          <label htmlFor={`${idPrefix}-place`}>{TC.manualLocation}</label>
          <input
            id={`${idPrefix}-place`}
            dir="auto"
            value={location?.description ?? ''}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>
    </fieldset>
  );
};
