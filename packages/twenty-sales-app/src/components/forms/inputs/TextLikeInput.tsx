import { JalaliDatePicker } from '../../JalaliDatePicker';
import { NumberField } from '../../NumberField';
import { formText } from '../../../lib/forms/formText';
import { type QuestionInputProps } from './inputTypes';

// Free-text, number and date/time questions. Machine-shaped values (email,
// phone, URL, numbers) are always typed left-to-right; prose follows the
// writer's own direction.
export const TextLikeInput = ({
  question,
  definition,
  language,
  value,
  onChange,
  inputId,
  describedBy,
  invalid,
  disabled,
}: QuestionInputProps) => {
  const placeholder = formText(question.placeholder, definition, language);
  const text = typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
  const common = {
    id: inputId,
    'aria-describedby': describedBy,
    'aria-invalid': invalid || undefined,
    'aria-required': question.required || undefined,
    disabled,
    className: 'sv-input',
  };

  switch (question.type) {
    case 'long_text':
      return (
        <textarea
          {...common}
          dir="auto"
          rows={4}
          placeholder={placeholder}
          maxLength={question.config.maxLength ?? 10000}
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'number':
      return (
        <NumberField
          id={inputId}
          className="sv-input"
          placeholder={placeholder}
          value={typeof value === 'number' ? value : null}
          onChange={(next) => onChange(next ?? undefined)}
          allowNegative={(question.config.min ?? 0) < 0}
          disabled={disabled}
        />
      );
    case 'email':
    case 'phone':
    case 'website':
      return (
        <input
          {...common}
          dir="ltr"
          type={question.type === 'email' ? 'email' : question.type === 'phone' ? 'tel' : 'url'}
          inputMode={question.type === 'phone' ? 'tel' : question.type === 'email' ? 'email' : 'url'}
          autoComplete={question.type === 'email' ? 'email' : question.type === 'phone' ? 'tel' : 'url'}
          placeholder={placeholder}
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'date':
    case 'datetime':
      // English respondents get the Gregorian native picker; Dari/Pashto the
      // Afghan solar calendar. Both produce the same ISO value.
      return language === 'en' ? (
        <input
          {...common}
          dir="ltr"
          type={question.type === 'date' ? 'date' : 'datetime-local'}
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <JalaliDatePicker
          id={inputId}
          className="sv-input"
          value={text}
          withTime={question.type === 'datetime'}
          onChange={(next) => onChange(next)}
        />
      );
    case 'time':
      return (
        <input
          {...common}
          dir="ltr"
          type="time"
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    default:
      return (
        <input
          {...common}
          dir="auto"
          type="text"
          placeholder={placeholder}
          maxLength={question.config.maxLength ?? 500}
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
};
