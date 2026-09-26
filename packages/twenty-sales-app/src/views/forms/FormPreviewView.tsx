import { type FormAudience, type FormDefinition, type FormLanguage } from '@shared/surveys';
import { useEffect, useId, useMemo, useState } from 'react';

import { type SurveyForm, fetchForm, fetchVersions } from '../../api/surveys';
import { PrintPreviewFrame } from '../../components/forms/builder/PrintPreviewFrame';
import { FormRenderer } from '../../components/forms/FormRenderer';
import { IconRefresh } from '../../components/icons';
import { useCached } from '../../lib/cache';
import { completeDefinition } from '../../lib/forms/builder/definitionOps';
import { TB } from '../../lib/forms/builderStrings';
import { LANGUAGE_LABELS, TSV } from '../../lib/forms/surveyStrings';
import { navigate, replaceQuery } from '../../lib/router';

type PreviewSettings = {
  device: 'desktop' | 'mobile';
  mode: 'online' | 'print';
  version: string;
  language: FormLanguage | '';
  staff: boolean;
};

const readSettings = (query: string): PreviewSettings => {
  const params = new URLSearchParams(query);
  const version = params.get('version') ?? 'draft';
  const language = params.get('lang');

  return {
    device: params.get('device') === 'mobile' ? 'mobile' : 'desktop',
    mode: params.get('mode') === 'print' ? 'print' : 'online',
    version: /^\d+$/.test(version) ? version : 'draft',
    language: language === 'fa' || language === 'ps' || language === 'en' ? language : '',
    staff: params.get('audience') === 'staff',
  };
};

const writeSettings = (settings: PreviewSettings) => {
  const params = new URLSearchParams();

  if (settings.device !== 'desktop') params.set('device', settings.device);
  if (settings.mode !== 'online') params.set('mode', settings.mode);
  if (settings.version !== 'draft') params.set('version', settings.version);
  if (settings.language !== '') params.set('lang', settings.language);
  if (settings.staff) params.set('audience', 'staff');
  replaceQuery(params.toString());
};

// Sandboxed preview: the renderer gets no onSubmit, so there is no code path
// from here to the network — finishing the form shows the ending and saves
// nothing.
export const FormPreviewView = ({ formId, query }: { formId: string; query: string }) => {
  const id = useId();
  const [settings, setSettings] = useState<PreviewSettings>(() => readSettings(query));
  const [form, setForm] = useState<SurveyForm | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [run, setRun] = useState(0);
  const { data: versions } = useCached(`survey-versions-preview:${formId}`, () => fetchVersions(formId));

  useEffect(() => {
    fetchForm(formId)
      .then(setForm)
      .catch((failure: unknown) => setLoadError(failure instanceof Error ? failure.message : TSV.loadError));
  }, [formId]);

  const update = (patch: Partial<PreviewSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };

      writeSettings(next);

      return next;
    });
  };

  const selectedVersion =
    settings.version === 'draft' ? null : (versions ?? []).find((version) => String(version.versionNumber) === settings.version);
  const versionMissing = settings.version !== 'draft' && versions !== null && selectedVersion === undefined;
  const definition: FormDefinition | null = useMemo(() => {
    if (selectedVersion !== null && selectedVersion !== undefined) return completeDefinition(selectedVersion.definition);
    if (form === null) return null;

    return completeDefinition(form.draftDefinition);
  }, [form, selectedVersion]);
  const language: FormLanguage =
    definition !== null && settings.language !== '' && definition.languages.includes(settings.language)
      ? settings.language
      : (definition?.languages[0] ?? 'fa');
  const audience: FormAudience = settings.staff ? 'STAFF' : 'PUBLIC';

  const restart = () => {
    setAnswers({});
    setRun((current) => current + 1);
  };

  // Switching version or audience starts the respondent over.
  useEffect(() => {
    setAnswers({});
    setRun((current) => current + 1);
  }, [settings.version, settings.staff]);

  if (loadError !== null) {
    return (
      <main className="page">
        <div className="error-banner" role="alert">
          {TB.loadFailed} {loadError}
        </div>
      </main>
    );
  }

  return (
    <main className="page svb-preview">
      <div className="page-head">
        <div>
          <h1 dir="auto">
            {TB.previewTitle}
            {form !== null && <span className="svb-muted"> — {form.name}</span>}
          </h1>
        </div>
        <button type="button" className="btn line sm" onClick={() => navigate(`/form/${formId}/builder`)}>
          {TB.backToBuilder}
        </button>
      </div>

      <div className="svb-toolbar svb-preview-toolbar">
        <div className="seg" role="group" aria-label={TB.mode}>
          {(['online', 'print'] as const).map((mode) => (
            <button key={mode} type="button" className={settings.mode === mode ? 'on' : ''} aria-pressed={settings.mode === mode} onClick={() => update({ mode })}>
              {mode === 'online' ? TB.modeOnline : TB.modePrint}
            </button>
          ))}
        </div>
        {settings.mode === 'online' && (
          <div className="seg" role="group" aria-label={TB.device}>
            {(['desktop', 'mobile'] as const).map((device) => (
              <button key={device} type="button" className={settings.device === device ? 'on' : ''} aria-pressed={settings.device === device} onClick={() => update({ device })}>
                {device === 'desktop' ? TB.deviceDesktop : TB.deviceMobile}
              </button>
            ))}
          </div>
        )}
        <label className="svb-filter">
          <span className="svb-muted">{TB.version}</span>
          <select id={`${id}-version`} value={settings.version} onChange={(event) => update({ version: event.target.value })}>
            <option value="draft">{TB.draftVersion}</option>
            {(versions ?? []).map((version) => (
              <option key={version.id} value={String(version.versionNumber)}>
                {TB.versionN(version.versionNumber)}
              </option>
            ))}
          </select>
        </label>
        {definition !== null && definition.languages.length > 1 && settings.mode === 'online' && (
          <label className="svb-filter">
            <span className="svb-muted">{TB.language}</span>
            <select value={language} onChange={(event) => update({ language: event.target.value as FormLanguage })}>
              {definition.languages.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {LANGUAGE_LABELS[candidate]}
                </option>
              ))}
            </select>
          </label>
        )}
        {settings.mode === 'online' && (
          <label className="svb-check" title={TB.asStaffHint}>
            <input type="checkbox" checked={settings.staff} onChange={(event) => update({ staff: event.target.checked })} />
            {TB.asStaff}
          </label>
        )}
        {settings.mode === 'online' && (
          <button type="button" className="btn line sm" onClick={restart}>
            <IconRefresh size={14} />
            {TB.restart}
          </button>
        )}
      </div>

      {versionMissing && <p className="svb-note warn">{TB.versionNotFound}</p>}

      {definition === null ? (
        <div className="skeleton svb-skeleton-body" aria-busy="true" />
      ) : settings.mode === 'print' ? (
        <PrintPreviewFrame formId={formId} version={selectedVersion ? String(selectedVersion.versionNumber) : 'draft'} />
      ) : (
        <>
          <p className="svb-preview-banner" role="note">
            {TB.previewBanner}
          </p>
          <div className={settings.device === 'mobile' ? 'svb-device mobile' : 'svb-device desktop'}>
            <FormRenderer
              key={`${run}:${settings.version}:${audience}`}
              definition={definition}
              title={form?.name}
              audience={audience}
              language={language}
              onLanguageChange={(next) => update({ language: next })}
              answers={answers}
              onAnswersChange={setAnswers}
            />
          </div>
        </>
      )}
    </main>
  );
};
