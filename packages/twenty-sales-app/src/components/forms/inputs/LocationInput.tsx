import { useState } from 'react';

import { NumberField } from '../../NumberField';
import { type QuestionInputProps } from './inputTypes';

type LocationValue = {
  lat?: number;
  lng?: number;
  accuracy?: number;
  source: 'GPS' | 'MANUAL';
  description?: string;
};

// The browser asks for location permission only when the button is pressed.
// Coordinates can always be typed, and a written landmark alone is a valid
// answer — GPS is a convenience, never a requirement.
export const LocationInput = ({
  strings,
  value,
  onChange,
  inputId,
  describedBy,
  disabled,
}: QuestionInputProps) => {
  const location = (
    typeof value === 'object' && value !== null ? value : { source: 'MANUAL' }
  ) as LocationValue;
  const [status, setStatus] = useState<'idle' | 'locating' | 'denied'>('idle');

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setStatus('denied');

      return;
    }

    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStatus('idle');
        onChange({
          ...location,
          source: 'GPS',
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
          accuracy: Math.round(position.coords.accuracy),
        });
      },
      () => setStatus('denied'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  const setCoordinate = (key: 'lat' | 'lng', next: number | null) => {
    const updated = { ...location, source: 'MANUAL' as const, accuracy: undefined };

    if (next === null) delete updated[key];
    else updated[key] = next;

    onChange(updated);
  };

  return (
    <div className="sv-stack" aria-describedby={describedBy}>
      <button type="button" className="btn line sm" onClick={locate} disabled={disabled || status === 'locating'}>
        📍 {status === 'locating' ? strings.locating : strings.useMyLocation}
      </button>
      {status === 'denied' && <div className="sv-hint sv-warn">{strings.locationDenied}</div>}
      <div className="sv-grid-2">
        <label className="sv-sub-field">
          <span>{strings.latitude}</span>
          <NumberField
            id={inputId}
            className="sv-input"
            value={location.lat ?? null}
            allowNegative
            disabled={disabled}
            onChange={(next) => setCoordinate('lat', next)}
          />
        </label>
        <label className="sv-sub-field">
          <span>{strings.longitude}</span>
          <NumberField
            className="sv-input"
            value={location.lng ?? null}
            allowNegative
            disabled={disabled}
            onChange={(next) => setCoordinate('lng', next)}
          />
        </label>
      </div>
      {location.lat !== undefined && location.lng !== undefined && (
        <a
          className="sv-hint"
          dir="ltr"
          href={`https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=17/${location.lat}/${location.lng}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {location.lat}, {location.lng}
          {location.accuracy !== undefined ? ` (±${location.accuracy}m)` : ''}
        </a>
      )}
      <label className="sv-sub-field">
        <span>{strings.locationDescription}</span>
        <input
          className="sv-input"
          dir="auto"
          disabled={disabled}
          value={location.description ?? ''}
          onChange={(event) => onChange({ ...location, description: event.target.value })}
        />
      </label>
    </div>
  );
};
