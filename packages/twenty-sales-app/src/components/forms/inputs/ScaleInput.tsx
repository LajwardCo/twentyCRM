import { formText, formatNumberFor } from '../../../lib/forms/formText';
import { type QuestionInputProps } from './inputTypes';

// Star rating (1..N) and opinion scale (min..max, typically 0..10) as a row
// of toggle buttons — large touch targets, arrow-key friendly radio group.
export const ScaleInput = ({
  question,
  definition,
  language,
  value,
  onChange,
  describedBy,
  invalid,
  disabled,
}: QuestionInputProps) => {
  const isRating = question.type === 'rating';
  const min = isRating ? 1 : (question.config.scaleMin ?? 0);
  const max = question.config.scaleMax ?? (isRating ? 5 : 10);
  const options = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  const current = typeof value === 'number' ? value : null;
  const minLabel = formText(question.config.scaleMinLabel, definition, language);
  const maxLabel = formText(question.config.scaleMaxLabel, definition, language);

  return (
    <div className="sv-scale-wrap">
      <div
        className={`sv-scale${isRating ? ' sv-rating' : ''}`}
        role="radiogroup"
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
      >
        {options.map((option) => {
          const selected = isRating ? current !== null && option <= current : current === option;

          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={current === option}
              aria-label={formatNumberFor(option, language)}
              className={`sv-scale-option${selected ? ' on' : ''}`}
              disabled={disabled}
              onClick={() => onChange(current === option ? undefined : option)}
            >
              {isRating ? '★' : formatNumberFor(option, language)}
            </button>
          );
        })}
      </div>
      {(minLabel !== '' || maxLabel !== '') && (
        <div className="sv-scale-labels">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  );
};
