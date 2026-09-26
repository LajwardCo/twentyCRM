import { type FormDefinition, type FormLanguage, type Question } from '@shared/surveys';

import { formText, formatNumberFor } from '../../lib/forms/formText';
import { type RespondentStrings } from '../../lib/forms/surveyStrings';
import { AddressInput } from './inputs/AddressInput';
import { ChoiceInput } from './inputs/ChoiceInput';
import { ConsentInput } from './inputs/ConsentInput';
import { FileInput } from './inputs/FileInput';
import { type RendererServices } from './inputs/inputTypes';
import { LocationInput } from './inputs/LocationInput';
import { ScaleInput } from './inputs/ScaleInput';
import { TextLikeInput } from './inputs/TextLikeInput';

type QuestionFieldProps = {
  question: Question;
  definition: FormDefinition;
  language: FormLanguage;
  strings: RespondentStrings;
  number: number | null;
  required: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
  error: string | null;
  services: RendererServices;
  disabled?: boolean;
  // Paper entry: a transcriber marks an answer they cannot read instead of
  // guessing it.
  unclear?: { marked: boolean; onToggle: () => void; label: string };
  staffBadge?: string;
};

export const QuestionField = ({
  question,
  definition,
  language,
  strings,
  number,
  required,
  value,
  onChange,
  error,
  services,
  disabled,
  unclear,
  staffBadge,
}: QuestionFieldProps) => {
  const inputId = `sv-q-${question.id}`;
  const errorId = `${inputId}-error`;
  const descriptionId = `${inputId}-description`;
  const description = formText(question.description, definition, language);
  const describedBy =
    [description !== '' ? descriptionId : null, error !== null ? errorId : null]
      .filter((id) => id !== null)
      .join(' ') || undefined;
  const inputProps = {
    question,
    definition,
    language,
    strings,
    value,
    onChange,
    inputId,
    describedBy,
    invalid: error !== null,
    disabled: disabled || unclear?.marked,
  };
  const groupLike = ['single_choice', 'multi_choice', 'yes_no', 'rating', 'opinion_scale', 'address', 'location'].includes(question.type);

  let input: React.ReactNode;

  switch (question.type) {
    case 'single_choice':
    case 'multi_choice':
    case 'dropdown':
    case 'yes_no':
      input = <ChoiceInput {...inputProps} />;
      break;
    case 'rating':
    case 'opinion_scale':
      input = <ScaleInput {...inputProps} />;
      break;
    case 'address':
      input = <AddressInput {...inputProps} />;
      break;
    case 'location':
      input = <LocationInput {...inputProps} />;
      break;
    case 'file':
      input = <FileInput {...inputProps} uploadFile={services.uploadFile} />;
      break;
    case 'consent':
      input = <ConsentInput {...inputProps} />;
      break;
    case 'crm_company':
    case 'crm_contact':
    case 'crm_lead':
      input = services.renderCrmPicker?.(question, value, onChange) ?? null;
      break;
    default:
      input = <TextLikeInput {...inputProps} />;
  }

  const Label = groupLike ? 'div' : 'label';

  return (
    <div
      className={`sv-field${error !== null ? ' has-error' : ''}${unclear?.marked ? ' is-unclear' : ''}`}
      role={groupLike ? 'group' : undefined}
      aria-labelledby={groupLike ? `${inputId}-label` : undefined}
    >
      <Label
        id={`${inputId}-label`}
        className="sv-label"
        {...(groupLike ? {} : { htmlFor: inputId })}
      >
        {number !== null && definition.appearance.showQuestionNumbers && (
          <span className="sv-number">{formatNumberFor(number, language)}.</span>
        )}
        <span dir="auto">{formText(question.label, definition, language)}</span>
        {required ? (
          <span className="sv-required" aria-label={strings.required}>*</span>
        ) : null}
        {staffBadge !== undefined && <span className="sv-badge">{staffBadge}</span>}
      </Label>
      {description !== '' && (
        <div id={descriptionId} className="sv-description" dir="auto">
          {description}
        </div>
      )}
      {input}
      {unclear !== undefined && (
        <label className="sv-unclear-toggle">
          <input type="checkbox" checked={unclear.marked} onChange={unclear.onToggle} />
          <span>{unclear.label}</span>
        </label>
      )}
      {error !== null && (
        <div id={errorId} className="sv-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
};
