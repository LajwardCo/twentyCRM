import { type FormDefinition, createEmptyFormDefinition, listFormQuestions } from '@shared/surveys';
import { useId, useMemo, useState } from 'react';

import { type SurveyPurpose, createForm } from '../../api/surveys';
import { BuilderDialog } from '../../components/forms/builder/BuilderDialog';
import { invalidateCache } from '../../lib/cache';
import { TB } from '../../lib/forms/builderStrings';
import { LANGUAGE_LABELS, PURPOSE_LABELS, TSV } from '../../lib/forms/surveyStrings';
import { SURVEY_TEMPLATES } from '../../lib/forms/templates';
import { useSurveyCapabilities } from '../../lib/forms/useSurveyCapabilities';
import { navigate } from '../../lib/router';

type Starter = {
  key: string;
  name: string;
  description: string;
  purpose: SurveyPurpose;
  build: () => FormDefinition;
};

const STARTERS: Starter[] = [
  {
    key: 'blank',
    name: TB.blankForm,
    description: TB.blankFormDescription,
    purpose: 'OTHER',
    build: () => createEmptyFormDefinition('fa'),
  },
  ...SURVEY_TEMPLATES,
];

const CreateDialog = ({ starter, onClose }: { starter: Starter; onClose: () => void }) => {
  const id = useId();
  const [name, setName] = useState(starter.key === 'blank' ? '' : starter.name);
  const [purpose, setPurpose] = useState<SurveyPurpose>(starter.purpose);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (name.trim() === '') {
      setError(TB.formNameRequired);

      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { id: formId } = await createForm({ name: name.trim(), purpose, draftDefinition: starter.build() });

      invalidateCache('survey-forms');
      navigate(`/form/${formId}/builder`);
    } catch (failure) {
      setError(`${TB.createFailed} ${failure instanceof Error ? failure.message : ''}`);
      setBusy(false);
    }
  };

  return (
    <BuilderDialog
      title={TB.createFormTitle}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn line" onClick={onClose}>
            {TSV.cancel}
          </button>
          <button type="submit" form={`${id}-form`} className="btn gold" disabled={busy}>
            {busy ? TB.creating : TB.create}
          </button>
        </>
      }
    >
      <form
        id={`${id}-form`}
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <div className="fld">
          <label htmlFor={`${id}-name`}>{TB.formName}</label>
          <input
            id={`${id}-name`}
            dir="auto"
            value={name}
            aria-invalid={error === TB.formNameRequired}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="fld">
          <label htmlFor={`${id}-purpose`}>{TSV.purpose}</label>
          <select id={`${id}-purpose`} value={purpose} onChange={(event) => setPurpose(event.target.value as SurveyPurpose)}>
            {(Object.keys(PURPOSE_LABELS) as SurveyPurpose[]).map((option) => (
              <option key={option} value={option}>
                {PURPOSE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
        {error !== null && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
      </form>
    </BuilderDialog>
  );
};

export const FormTemplatesView = () => {
  const { capabilities, loading } = useSurveyCapabilities();
  const [chosen, setChosen] = useState<Starter | null>(null);
  const summaries = useMemo(
    () =>
      STARTERS.map((starter) => {
        const definition = starter.build();

        return {
          starter,
          pages: definition.pages.length,
          questions: listFormQuestions(definition).length,
          languages: definition.languages.map((language) => LANGUAGE_LABELS[language]).join('، '),
        };
      }),
    [],
  );

  return (
    <main className="page svb-templates">
      <div className="page-head">
        <div>
          <h1>{TB.templatesTitle}</h1>
          <div className="sub">{TB.templatesSub}</div>
        </div>
      </div>
      {!loading && !capabilities.canBuild && (
        <p className="error-banner" role="alert">
          {TB.noBuildPermission}
        </p>
      )}
      <div className="svb-template-grid">
        {summaries.map(({ starter, pages, questions, languages }) => (
          <article key={starter.key} className={`card svb-template${starter.key === 'blank' ? ' blank' : ''}`}>
            <h2>{starter.name}</h2>
            <p>{starter.description}</p>
            <ul className="svb-template-meta">
              <li>{PURPOSE_LABELS[starter.purpose]}</li>
              <li>{TB.pagesN(pages)}</li>
              <li>{TB.questionsN(questions)}</li>
              <li>{languages}</li>
            </ul>
            <button
              type="button"
              className={`btn ${starter.key === 'blank' ? 'gold' : 'line'}`}
              disabled={!capabilities.canBuild}
              onClick={() => setChosen(starter)}
            >
              {starter.key === 'blank' ? TSV.newForm : TB.useTemplate}
            </button>
          </article>
        ))}
      </div>
      {chosen !== null && <CreateDialog starter={chosen} onClose={() => setChosen(null)} />}
    </main>
  );
};
