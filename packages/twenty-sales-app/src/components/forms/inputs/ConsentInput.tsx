import { formText } from '../../../lib/forms/formText';
import { type QuestionInputProps } from './inputTypes';

export const ConsentInput = ({
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
}: QuestionInputProps) => (
  <label className={`sv-choice sv-consent${value === true ? ' on' : ''}`}>
    <input
      id={inputId}
      type="checkbox"
      checked={value === true}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked ? true : undefined)}
    />
    <span dir="auto">
      {formText(question.config.consentText, definition, language) || strings.yes}
    </span>
  </label>
);
