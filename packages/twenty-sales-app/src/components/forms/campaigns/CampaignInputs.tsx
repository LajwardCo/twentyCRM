import { type KeyboardEvent, useState } from 'react';

import { TINS } from '../../../lib/forms/insightStrings';
import { IconCheck, IconX } from '../../icons';

export type ChipOption = { value: string; label: string; note?: string };

// Multi-select as a wrap of toggle buttons: every option visible at once,
// one tap to flip, readable state for screen readers (aria-pressed).
export const ToggleChips = ({
  options,
  selected,
  onChange,
  disabled,
  labelledBy,
}: {
  options: ChipOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  labelledBy: string;
}) => (
  <div className="svk-chips" role="group" aria-labelledby={labelledBy}>
    {options.map((option) => {
      const on = selected.includes(option.value);

      return (
        <button
          key={option.value}
          type="button"
          className={`svk-chip${on ? ' on' : ''}`}
          aria-pressed={on}
          disabled={disabled}
          onClick={() =>
            onChange(on ? selected.filter((value) => value !== option.value) : [...selected, option.value])
          }
        >
          {on && <IconCheck size={13} />}
          <span dir="auto">{option.label}</span>
          {option.note !== undefined && <small>{option.note}</small>}
        </button>
      );
    })}
  </div>
);

// Free-text tags (campaign areas). Enter or comma adds; duplicates ignored.
export const TagInput = ({
  id,
  values,
  onChange,
  disabled,
}: {
  id: string;
  values: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) => {
  const [text, setText] = useState('');

  const add = () => {
    const value = text.trim().replace(/\s+/g, ' ');

    if (value !== '' && !values.some((existing) => existing.toLowerCase() === value.toLowerCase())) {
      onChange([...values, value]);
    }

    setText('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === '،') {
      event.preventDefault();
      add();
    }
  };

  return (
    <div className="svk-tags">
      {values.map((value) => (
        <span key={value} className="svk-tag" dir="auto">
          {value}
          {!disabled && (
            <button
              type="button"
              aria-label={TINS.removeArea(value)}
              onClick={() => onChange(values.filter((existing) => existing !== value))}
            >
              <IconX size={12} />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <span className="svk-tag-add">
          <input
            id={id}
            value={text}
            dir="auto"
            placeholder={TINS.areaPlaceholder}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={add}
          />
          <button type="button" className="btn line sm" onClick={add} disabled={text.trim() === ''}>
            {TINS.addArea}
          </button>
        </span>
      )}
    </div>
  );
};
