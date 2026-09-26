import {
  CHOICE_QUESTION_TYPES,
  type FileTypeGroup,
  type FormLanguage,
  type Question,
  type QuestionConfig,
  SURVEY_LIMITS,
} from '@shared/surveys';
import { useId } from 'react';

import { TB } from '../../../lib/forms/builderStrings';
import { NumberField } from '../../NumberField';
import { ChoicesEditor } from './ChoicesEditor';
import { LocalizedField } from './LocalizedField';

type NumberInputProps = {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  integer?: boolean;
  allowNegative?: boolean;
};

export const LabelledNumber = ({ label, value, onChange, integer = true, allowNegative = false }: NumberInputProps) => {
  const id = useId();

  return (
    <div className="fld svb-fld">
      <label htmlFor={id}>{label}</label>
      <NumberField
        id={id}
        value={value ?? null}
        integer={integer}
        allowNegative={allowNegative}
        onChange={(next) => onChange(next ?? undefined)}
      />
    </div>
  );
};

const FILE_TYPES: FileTypeGroup[] = ['image', 'pdf', 'document', 'spreadsheet', 'audio'];
const TEXT_LENGTH_TYPES = new Set(['short_text', 'long_text']);

type QuestionConfigFieldsProps = {
  question: Question;
  language: FormLanguage;
  languages: FormLanguage[];
  referencedChoiceIds: Set<string>;
  onChange: (config: QuestionConfig) => void;
};

const DefaultValueField = ({ question, onChange }: Pick<QuestionConfigFieldsProps, 'question' | 'onChange'>) => {
  const id = useId();
  const config = question.config;
  const current = config.defaultValue;

  if (question.type === 'number') {
    return (
      <LabelledNumber
        label={TB.defaultValue}
        value={typeof current === 'number' ? current : undefined}
        integer={false}
        allowNegative
        onChange={(value) => onChange({ ...config, defaultValue: value })}
      />
    );
  }

  if (question.type === 'yes_no' || question.type === 'single_choice' || question.type === 'dropdown') {
    const options =
      question.type === 'yes_no'
        ? [
            { value: 'true', label: TB.yes },
            { value: 'false', label: TB.no },
          ]
        : (config.choices ?? []).map((choice, index) => ({
            value: choice.id,
            label: Object.values(choice.label).find((text) => text !== '') ?? TB.choiceN(index + 1),
          }));
    const selected = current === undefined ? '' : String(current);

    return (
      <div className="fld svb-fld">
        <label htmlFor={id}>{TB.defaultValue}</label>
        <select
          id={id}
          value={selected}
          onChange={(event) => {
            const raw = event.target.value;
            const value = raw === '' ? undefined : question.type === 'yes_no' ? raw === 'true' : raw;

            onChange({ ...config, defaultValue: value });
          }}
        >
          <option value="">{TB.noDefault}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (question.type === 'short_text') {
    return (
      <div className="fld svb-fld">
        <label htmlFor={id}>{TB.defaultValue}</label>
        <input
          id={id}
          dir="auto"
          value={typeof current === 'string' ? current : ''}
          onChange={(event) =>
            onChange({ ...config, defaultValue: event.target.value === '' ? undefined : event.target.value })
          }
        />
      </div>
    );
  }

  return null;
};

// The settings that depend on the question type.
export const QuestionConfigFields = ({
  question,
  language,
  languages,
  referencedChoiceIds,
  onChange,
}: QuestionConfigFieldsProps) => {
  const config = question.config;
  const set = (patch: Partial<QuestionConfig>) => onChange({ ...config, ...patch });

  return (
    <>
      {CHOICE_QUESTION_TYPES.has(question.type) && (
        <ChoicesEditor
          question={question}
          language={language}
          languages={languages}
          referencedChoiceIds={referencedChoiceIds}
          onChange={onChange}
        />
      )}
      {question.type === 'multi_choice' && (
        <div className="svb-pair">
          <LabelledNumber label={TB.minSelected} value={config.minSelected} onChange={(minSelected) => set({ minSelected })} />
          <LabelledNumber label={TB.maxSelected} value={config.maxSelected} onChange={(maxSelected) => set({ maxSelected })} />
        </div>
      )}
      {TEXT_LENGTH_TYPES.has(question.type) && (
        <div className="svb-pair">
          <LabelledNumber label={TB.minLength} value={config.minLength} onChange={(minLength) => set({ minLength })} />
          <LabelledNumber label={TB.maxLength} value={config.maxLength} onChange={(maxLength) => set({ maxLength })} />
        </div>
      )}
      {question.type === 'number' && (
        <div className="svb-pair">
          <LabelledNumber label={TB.min} value={config.min} integer={false} allowNegative onChange={(min) => set({ min })} />
          <LabelledNumber label={TB.max} value={config.max} integer={false} allowNegative onChange={(max) => set({ max })} />
        </div>
      )}
      {question.type === 'rating' && (
        <LabelledNumber label={TB.ratingMax} value={config.scaleMax} onChange={(scaleMax) => set({ scaleMax })} />
      )}
      {question.type === 'opinion_scale' && (
        <>
          <div className="svb-pair">
            <LabelledNumber label={TB.scaleMin} value={config.scaleMin} onChange={(scaleMin) => set({ scaleMin })} />
            <LabelledNumber label={TB.scaleMax} value={config.scaleMax} onChange={(scaleMax) => set({ scaleMax })} />
          </div>
          <LocalizedField
            label={TB.scaleMinLabel}
            value={config.scaleMinLabel}
            onChange={(scaleMinLabel) => set({ scaleMinLabel })}
            language={language}
            languages={languages}
          />
          <LocalizedField
            label={TB.scaleMaxLabel}
            value={config.scaleMaxLabel}
            onChange={(scaleMaxLabel) => set({ scaleMaxLabel })}
            language={language}
            languages={languages}
          />
        </>
      )}
      {question.type === 'file' && (
        <>
          <fieldset className="svb-group">
            <legend>{TB.fileTypes}</legend>
            <div className="svb-check-row">
              {FILE_TYPES.map((fileType) => (
                <label key={fileType} className="svb-check">
                  <input
                    type="checkbox"
                    checked={(config.fileTypes ?? []).includes(fileType)}
                    onChange={(event) =>
                      set({
                        fileTypes: event.target.checked
                          ? [...(config.fileTypes ?? []), fileType]
                          : (config.fileTypes ?? []).filter((candidate) => candidate !== fileType),
                      })
                    }
                  />
                  {TB.fileTypeLabels[fileType]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="svb-pair">
            <LabelledNumber
              label={`${TB.maxFileMb} (≤ ${SURVEY_LIMITS.maxFileMb})`}
              value={config.maxFileMb}
              onChange={(maxFileMb) => set({ maxFileMb })}
            />
            <LabelledNumber
              label={`${TB.maxFiles} (≤ ${SURVEY_LIMITS.maxFiles})`}
              value={config.maxFiles}
              onChange={(maxFiles) => set({ maxFiles })}
            />
          </div>
        </>
      )}
      {question.type === 'consent' && (
        <LocalizedField
          label={TB.consentText}
          value={config.consentText}
          onChange={(consentText) => set({ consentText })}
          language={language}
          languages={languages}
          multiline
          rows={3}
        />
      )}
      <DefaultValueField question={question} onChange={onChange} />
    </>
  );
};
