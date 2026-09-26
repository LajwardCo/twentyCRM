import { type FormLanguage, type LocalizedText } from '@shared/surveys';
import { useId } from 'react';

import { TB } from '../../../lib/forms/builderStrings';
import { directionOf, withText } from '../../../lib/forms/formText';
import { LANGUAGE_LABELS } from '../../../lib/forms/surveyStrings';

type LocalizedFieldProps = {
  label: string;
  value: LocalizedText | undefined;
  onChange: (value: LocalizedText) => void;
  language: FormLanguage;
  languages: FormLanguage[];
  multiline?: boolean;
  rows?: number;
  hint?: string;
  placeholder?: string;
};

// One text of the form in the language being edited. A missing translation
// shows the default-language text as a placeholder — that is what the
// respondent would see.
export const LocalizedField = ({
  label,
  value,
  onChange,
  language,
  languages,
  multiline = false,
  rows = 2,
  hint,
  placeholder,
}: LocalizedFieldProps) => {
  const id = useId();
  const hintId = `${id}-hint`;
  const defaultLanguage = languages[0] ?? 'fa';
  const current = value?.[language] ?? '';
  const fallback = language === defaultLanguage ? '' : (value?.[defaultLanguage] ?? '');
  const showMissing = languages.length > 1 && current === '' && fallback !== '';
  const hintText = showMissing
    ? TB.translationMissing(LANGUAGE_LABELS[defaultLanguage])
    : hint;
  const common = {
    id,
    value: current,
    dir: directionOf(language),
    placeholder: fallback !== '' ? fallback : placeholder,
    'aria-describedby': hintText !== undefined ? hintId : undefined,
  };

  return (
    <div className="fld svb-fld">
      <label htmlFor={id}>
        {label}
        {languages.length > 1 && <span className="svb-lang-tag">{LANGUAGE_LABELS[language]}</span>}
      </label>
      {multiline ? (
        <textarea
          {...common}
          rows={rows}
          onChange={(event) => onChange(withText(value, language, event.target.value))}
        />
      ) : (
        <input
          {...common}
          onChange={(event) => onChange(withText(value, language, event.target.value))}
        />
      )}
      {hintText !== undefined && (
        <p id={hintId} className="svb-hint">
          {hintText}
        </p>
      )}
    </div>
  );
};

type LanguageTabsProps = {
  languages: FormLanguage[];
  value: FormLanguage;
  onChange: (language: FormLanguage) => void;
};

export const LanguageTabs = ({ languages, value, onChange }: LanguageTabsProps) =>
  languages.length > 1 ? (
    <div className="seg svb-lang-tabs" role="group" aria-label={TB.editingLanguage}>
      {languages.map((language) => (
        <button
          key={language}
          type="button"
          className={language === value ? 'on' : ''}
          aria-pressed={language === value}
          onClick={() => onChange(language)}
        >
          {LANGUAGE_LABELS[language]}
        </button>
      ))}
    </div>
  ) : null;
