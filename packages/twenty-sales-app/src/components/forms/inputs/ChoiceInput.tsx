import { OTHER_CHOICE_ID } from '@shared/surveys';

import { formText } from '../../../lib/forms/formText';
import { type QuestionInputProps } from './inputTypes';

type SingleValue = { choiceId?: string; otherText?: string };
type MultiValue = { choiceIds: string[]; otherText?: string };

const asSingle = (value: unknown): SingleValue =>
  typeof value === 'string'
    ? { choiceId: value }
    : typeof value === 'object' && value !== null
      ? (value as SingleValue)
      : {};

const asMulti = (value: unknown): MultiValue =>
  Array.isArray(value)
    ? { choiceIds: value as string[] }
    : typeof value === 'object' && value !== null && Array.isArray((value as MultiValue).choiceIds)
      ? (value as MultiValue)
      : { choiceIds: [] };

// Single / multiple choice, dropdown and yes-no. Real radio and checkbox
// inputs inside a fieldset, so keyboard and screen readers work natively.
export const ChoiceInput = ({
  question,
  definition,
  language,
  strings,
  value,
  onChange,
  inputId,
  describedBy,
  invalid,
  disabled,
}: QuestionInputProps) => {
  const choices = question.config.choices ?? [];
  const allowOther = question.config.allowOther === true;
  const otherLabel = formText(question.config.otherLabel, definition, language) || strings.other;

  if (question.type === 'yes_no') {
    return (
      <div className="sv-choices sv-choices-row" role="radiogroup" aria-describedby={describedBy} aria-invalid={invalid || undefined}>
        {[true, false].map((option) => (
          <label key={String(option)} className={`sv-choice${value === option ? ' on' : ''}`}>
            <input
              type="radio"
              name={inputId}
              checked={value === option}
              disabled={disabled}
              onChange={() => onChange(option)}
            />
            <span>{option ? strings.yes : strings.no}</span>
          </label>
        ))}
      </div>
    );
  }

  if (question.type === 'dropdown') {
    const single = asSingle(value);

    return (
      <div className="sv-stack">
        <select
          id={inputId}
          className="sv-input"
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          value={single.choiceId ?? ''}
          onChange={(event) =>
            onChange(event.target.value === '' ? undefined : { choiceId: event.target.value })
          }
        >
          <option value="">{strings.choose}</option>
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {formText(choice.label, definition, language)}
            </option>
          ))}
          {allowOther && <option value={OTHER_CHOICE_ID}>{otherLabel}</option>}
        </select>
        {single.choiceId === OTHER_CHOICE_ID && (
          <input
            className="sv-input"
            dir="auto"
            aria-label={otherLabel}
            placeholder={strings.otherPlaceholder}
            value={single.otherText ?? ''}
            onChange={(event) => onChange({ choiceId: OTHER_CHOICE_ID, otherText: event.target.value })}
          />
        )}
      </div>
    );
  }

  if (question.type === 'single_choice') {
    const single = asSingle(value);

    return (
      <div className="sv-choices" role="radiogroup" aria-describedby={describedBy} aria-invalid={invalid || undefined}>
        {choices.map((choice) => (
          <label key={choice.id} className={`sv-choice${single.choiceId === choice.id ? ' on' : ''}`}>
            <input
              type="radio"
              name={inputId}
              checked={single.choiceId === choice.id}
              disabled={disabled}
              onChange={() => onChange({ choiceId: choice.id })}
            />
            <span dir="auto">{formText(choice.label, definition, language)}</span>
          </label>
        ))}
        {allowOther && (
          <label className={`sv-choice sv-choice-other${single.choiceId === OTHER_CHOICE_ID ? ' on' : ''}`}>
            <input
              type="radio"
              name={inputId}
              checked={single.choiceId === OTHER_CHOICE_ID}
              disabled={disabled}
              onChange={() => onChange({ choiceId: OTHER_CHOICE_ID, otherText: single.otherText ?? '' })}
            />
            <span>{otherLabel}</span>
            {single.choiceId === OTHER_CHOICE_ID && (
              <input
                className="sv-input sv-other-input"
                dir="auto"
                aria-label={otherLabel}
                placeholder={strings.otherPlaceholder}
                value={single.otherText ?? ''}
                onChange={(event) => onChange({ choiceId: OTHER_CHOICE_ID, otherText: event.target.value })}
              />
            )}
          </label>
        )}
      </div>
    );
  }

  const multi = asMulti(value);
  const toggle = (choiceId: string) => {
    const has = multi.choiceIds.includes(choiceId);
    const choiceIds = has
      ? multi.choiceIds.filter((id) => id !== choiceId)
      : [...multi.choiceIds, choiceId];

    onChange(choiceIds.length === 0 && !multi.otherText ? undefined : { ...multi, choiceIds });
  };

  return (
    <div className="sv-choices" role="group" aria-describedby={describedBy} aria-invalid={invalid || undefined}>
      {choices.map((choice) => (
        <label key={choice.id} className={`sv-choice${multi.choiceIds.includes(choice.id) ? ' on' : ''}`}>
          <input
            type="checkbox"
            checked={multi.choiceIds.includes(choice.id)}
            disabled={disabled}
            onChange={() => toggle(choice.id)}
          />
          <span dir="auto">{formText(choice.label, definition, language)}</span>
        </label>
      ))}
      {allowOther && (
        <label className={`sv-choice sv-choice-other${multi.choiceIds.includes(OTHER_CHOICE_ID) ? ' on' : ''}`}>
          <input
            type="checkbox"
            checked={multi.choiceIds.includes(OTHER_CHOICE_ID)}
            disabled={disabled}
            onChange={() => toggle(OTHER_CHOICE_ID)}
          />
          <span>{otherLabel}</span>
          {multi.choiceIds.includes(OTHER_CHOICE_ID) && (
            <input
              className="sv-input sv-other-input"
              dir="auto"
              aria-label={otherLabel}
              placeholder={strings.otherPlaceholder}
              value={multi.otherText ?? ''}
              onChange={(event) => onChange({ ...multi, otherText: event.target.value })}
            />
          )}
        </label>
      )}
      {(question.config.maxSelected !== undefined || question.config.minSelected !== undefined) && (
        <div className="sv-hint">{strings.selectedCount(String(multi.choiceIds.length))}</div>
      )}
    </div>
  );
};
