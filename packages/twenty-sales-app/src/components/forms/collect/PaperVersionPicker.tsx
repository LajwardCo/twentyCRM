import { useEffect, useState } from 'react';

import {
  type SurveyFormSummary,
  type SurveyFormVersion,
  fetchVersionByPrintCode,
  fetchVersions,
  listForms,
} from '../../../api/surveys';
import { toPersianDigits } from '../../../lib/jalali';
import { TC } from '../../../lib/forms/collectStrings';

export type PickedVersion = { formId: string; formName: string; version: SurveyFormVersion };

type PaperVersionPickerProps = {
  initialFormId: string | null;
  onPick: (picked: PickedVersion) => void;
};

// Paper is entered against the exact version that was printed: the code in
// the sheet's footer (e.g. F1G46-v2) finds it; otherwise pick form + version.
export const PaperVersionPicker = ({ initialFormId, onPick }: PaperVersionPickerProps) => {
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState<'idle' | 'searching' | 'missing' | 'error'>('idle');
  const [forms, setForms] = useState<SurveyFormSummary[] | null>(null);
  const [formId, setFormId] = useState(initialFormId ?? '');
  const [versions, setVersions] = useState<SurveyFormVersion[] | null>(null);
  const [versionId, setVersionId] = useState('');

  useEffect(() => {
    listForms()
      .then((result) =>
        setForms(result.supported ? result.forms.filter((form) => form.publishedVersion !== null) : []),
      )
      .catch(() => setForms([]));
  }, []);

  useEffect(() => {
    setVersions(null);
    setVersionId('');

    if (formId === '') return;

    fetchVersions(formId)
      .then((list) => {
        setVersions(list);
        setVersionId(list[0]?.id ?? '');
      })
      .catch(() => setVersions([]));
  }, [formId]);

  const formName = (id: string) => forms?.find((form) => form.id === id)?.name ?? '';

  const findByCode = async () => {
    if (code.trim() === '') return;

    setCodeState('searching');

    try {
      const version = await fetchVersionByPrintCode(code);

      if (version === null) {
        setCodeState('missing');

        return;
      }

      setCodeState('idle');
      onPick({ formId: version.formId, formName: formName(version.formId), version });
    } catch {
      setCodeState('error');
    }
  };

  const chosen = versions?.find((version) => version.id === versionId);

  return (
    <div className="card svc-step">
      <form
        className="svc-step-body"
        onSubmit={(event) => {
          event.preventDefault();
          void findByCode();
        }}
      >
        <label className="svc-label" htmlFor="svc-paper-code">{TC.printedCode}</label>
        <div className="svc-row">
          <input
            id="svc-paper-code"
            className="sv-input svc-code-input"
            dir="ltr"
            autoComplete="off"
            placeholder={TC.printedCodeHint}
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setCodeState('idle');
            }}
          />
          <button type="submit" className="btn gold" disabled={codeState === 'searching'}>
            {TC.findByCode}
          </button>
        </div>
        {codeState === 'missing' && <div className="svc-hint svc-warn">{TC.codeNotFound}</div>}
        {codeState === 'error' && <div className="svc-hint svc-warn">{TC.loadFailed}</div>}
      </form>

      <div className="svc-divider">{TC.orPickForm}</div>

      <div className="svc-grid2">
        <div className="fld">
          <label htmlFor="svc-paper-form">{TC.pickForm}</label>
          <select id="svc-paper-form" value={formId} onChange={(event) => setFormId(event.target.value)}>
            <option value="">{forms === null ? TC.loading : TC.chooseForm}</option>
            {(forms ?? []).map((form) => (
              <option key={form.id} value={form.id}>
                {form.name}
              </option>
            ))}
          </select>
        </div>
        <div className="fld">
          <label htmlFor="svc-paper-version">{TC.pickVersion}</label>
          <select
            id="svc-paper-version"
            value={versionId}
            disabled={versions === null || versions.length === 0}
            onChange={(event) => setVersionId(event.target.value)}
          >
            {(versions ?? []).map((version) => (
              <option key={version.id} value={version.id}>
                {toPersianDigits(version.versionNumber)} — {version.printCode}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="svc-actions">
        <button
          type="button"
          className="btn gold svc-big"
          disabled={chosen === undefined}
          onClick={() => {
            if (chosen !== undefined) onPick({ formId, formName: formName(formId), version: chosen });
          }}
        >
          {TC.next}
        </button>
      </div>
    </div>
  );
};
