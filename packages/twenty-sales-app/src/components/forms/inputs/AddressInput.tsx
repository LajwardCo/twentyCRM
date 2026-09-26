import { type QuestionInputProps } from './inputTypes';

type AddressValue = {
  street?: string;
  district?: string;
  city?: string;
  province?: string;
};

const PARTS = ['street', 'district', 'city', 'province'] as const;

export const AddressInput = ({
  strings,
  value,
  onChange,
  inputId,
  describedBy,
  disabled,
}: QuestionInputProps) => {
  const address = (typeof value === 'object' && value !== null ? value : {}) as AddressValue;

  return (
    <div className="sv-grid-2" aria-describedby={describedBy}>
      {PARTS.map((part, index) => (
        <label key={part} className="sv-sub-field">
          <span>{strings[part]}</span>
          <input
            id={index === 0 ? inputId : undefined}
            className="sv-input"
            dir="auto"
            disabled={disabled}
            value={address[part] ?? ''}
            onChange={(event) => onChange({ ...address, [part]: event.target.value })}
          />
        </label>
      ))}
    </div>
  );
};
