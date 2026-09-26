import { type FormLanguage, type FormPresentation } from '@shared/surveys';
import { useId } from 'react';

import { TB } from '../../../lib/forms/builderStrings';
import { LANGUAGE_LABELS } from '../../../lib/forms/surveyStrings';
import { IconPlus, IconX } from '../../icons';
import { HttpsUrlField } from './BlockInspector';
import { type EditorProps } from './builderTypes';
import { EndingsEditor } from './EndingsEditor';
import { LanguageTabs, LocalizedField } from './LocalizedField';

const ALL_LANGUAGES: FormLanguage[] = ['fa', 'ps', 'en'];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

type AppearanceTabProps = EditorProps & { numbering: Record<string, number> };

export const AppearanceTab = ({
  definition,
  onEdit,
  readOnly,
  editLanguage,
  onEditLanguageChange,
  numbering,
}: AppearanceTabProps) => {
  const id = useId();
  const { appearance, welcome, languages } = definition;
  const setAppearance = (patch: Partial<typeof appearance>) =>
    onEdit((current) => ({ ...current, appearance: { ...current.appearance, ...patch } }));
  const setWelcome = (patch: Partial<typeof welcome>) =>
    onEdit((current) => ({ ...current, welcome: { ...current.welcome, ...patch } }));
  const setLanguages = (next: FormLanguage[]) => {
    onEdit((current) => ({ ...current, languages: next }));
    if (!next.includes(editLanguage)) onEditLanguageChange(next[0]);
  };
  const missing = ALL_LANGUAGES.filter((language) => !languages.includes(language));

  return (
    <fieldset disabled={readOnly} className="svb-fieldset svb-settings-grid">
      <section className="card card-pad">
        <h3>{TB.appearanceBrand}</h3>
        <div className="fld svb-fld">
          <label htmlFor={`${id}-accent`}>{TB.accent}</label>
          <div className="svb-color">
            <input
              id={`${id}-accent`}
              type="color"
              value={HEX_COLOR.test(appearance.accent) ? appearance.accent : '#1f3a8a'}
              onChange={(event) => setAppearance({ accent: event.target.value })}
            />
            <code dir="ltr">{appearance.accent}</code>
          </div>
        </div>
        <HttpsUrlField
          label={TB.logoUrl}
          value={appearance.logoUrl}
          onChange={(logoUrl) => setAppearance({ logoUrl })}
        />
        <label className="svb-check">
          <input
            type="checkbox"
            checked={appearance.showProgress}
            onChange={(event) => setAppearance({ showProgress: event.target.checked })}
          />
          {TB.showProgress}
        </label>
        <label className="svb-check">
          <input
            type="checkbox"
            checked={appearance.showQuestionNumbers}
            onChange={(event) => setAppearance({ showQuestionNumbers: event.target.checked })}
          />
          {TB.showQuestionNumbers}
        </label>
        <fieldset className="svb-group">
          <legend>{TB.presentation}</legend>
          {(['ALL_ON_PAGE', 'ONE_QUESTION'] as FormPresentation[]).map((presentation) => (
            <label key={presentation} className="svb-check">
              <input
                type="radio"
                name={`${id}-presentation`}
                checked={definition.presentation === presentation}
                onChange={() => onEdit((current) => ({ ...current, presentation }))}
              />
              {TB.presentations[presentation]}
            </label>
          ))}
        </fieldset>
      </section>

      <section className="card card-pad">
        <h3>{TB.languages}</h3>
        <p className="svb-hint">{TB.languagesHint}</p>
        <ul className="svb-langs">
          {languages.map((language, index) => (
            <li key={language}>
              <span>{LANGUAGE_LABELS[language]}</span>
              {index === 0 ? (
                <span className="pill stage">{TB.defaultLanguage}</span>
              ) : (
                <button
                  type="button"
                  className="btn line sm"
                  onClick={() => setLanguages([language, ...languages.filter((candidate) => candidate !== language)])}
                >
                  {TB.makeDefault}
                </button>
              )}
              <button
                type="button"
                className="svb-tool danger"
                aria-label={TB.removeLanguage(LANGUAGE_LABELS[language])}
                disabled={languages.length <= 1}
                onClick={() => setLanguages(languages.filter((candidate) => candidate !== language))}
              >
                <IconX size={14} />
              </button>
            </li>
          ))}
        </ul>
        {missing.length > 0 && (
          <div className="svb-inline">
            {missing.map((language) => (
              <button key={language} type="button" className="btn soft sm" onClick={() => setLanguages([...languages, language])}>
                <IconPlus size={14} />
                {TB.addLanguage}: {LANGUAGE_LABELS[language]}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card card-pad">
        <div className="svb-inspector-head">
          <h3>{TB.welcome}</h3>
          <LanguageTabs languages={languages} value={editLanguage} onChange={onEditLanguageChange} />
        </div>
        <label className="svb-check">
          <input
            type="checkbox"
            checked={welcome.enabled}
            onChange={(event) => setWelcome({ enabled: event.target.checked })}
          />
          {TB.welcomeEnabled}
        </label>
        {welcome.enabled && (
          <>
            <LocalizedField label={TB.welcomeTitle} value={welcome.title} onChange={(title) => setWelcome({ title })} language={editLanguage} languages={languages} />
            <LocalizedField label={TB.welcomeBody} value={welcome.body} onChange={(body) => setWelcome({ body })} language={editLanguage} languages={languages} multiline rows={4} />
            <LocalizedField
              label={TB.welcomeButton}
              value={welcome.buttonLabel}
              onChange={(buttonLabel) => setWelcome({ buttonLabel })}
              language={editLanguage}
              languages={languages}
            />
          </>
        )}
      </section>

      <section className="card card-pad">
        <div className="svb-inspector-head">
          <h3>{TB.endings}</h3>
          <LanguageTabs languages={languages} value={editLanguage} onChange={onEditLanguageChange} />
        </div>
        <EndingsEditor definition={definition} onEdit={onEdit} language={editLanguage} numbering={numbering} showConditions={false} />
      </section>

      <section className="card card-pad">
        <div className="svb-inspector-head">
          <h3>{TB.printInstructions}</h3>
          <LanguageTabs languages={languages} value={editLanguage} onChange={onEditLanguageChange} />
        </div>
        <LocalizedField
          label={TB.printInstructions}
          value={definition.print.instructions}
          onChange={(instructions) => onEdit((current) => ({ ...current, print: { ...current.print, instructions } }))}
          language={editLanguage}
          languages={languages}
          multiline
          rows={4}
        />
      </section>
    </fieldset>
  );
};
