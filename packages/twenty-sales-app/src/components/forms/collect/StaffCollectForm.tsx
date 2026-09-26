import {
  type FormLanguage,
  type Question,
  STAFF_ONLY_QUESTION_TYPES,
  analysePrintability,
  formatSurveyNumber,
  pickLocalizedText,
  validateResponse,
} from '@shared/surveys';
import { type ReactNode, useCallback, useMemo, useState } from 'react';

import { type CompletionStatus, type SurveyFormVersion } from '../../../api/surveys';
import {
  type CollectLinks,
  type LinkLabels,
  applyCrmPrefill,
  resolveResponseLinks,
} from '../../../lib/forms/collect/prefill';
import { staffResponseName } from '../../../lib/forms/collect/responseName';
import { type StaffDraft } from '../../../lib/forms/collect/staffDraft';
import { TC } from '../../../lib/forms/collectStrings';
import { TSV } from '../../../lib/forms/surveyStrings';
import { FormRenderer, type SubmitOutcome } from '../FormRenderer';
import { DraftStatusBadge } from './CollectChrome';
import { FieldDataFields } from './FieldDataFields';
import { type StaffSaveInput, saveStaffResponse } from './staffSave';
import { staffRendererServices } from './staffServices';
import { useStaffDraft } from './useStaffDraft';

type StaffCollectFormProps = {
  version: SurveyFormVersion;
  formName: string;
  draftScope: string;
  links: CollectLinks;
  linkLabels: LinkLabels;
  // Extra response fields decided at save time (the visit flow creates its
  // visit task here). Must be idempotent: it runs again on a retry.
  prepareSave?: (completionStatus: CompletionStatus) => Promise<Partial<StaffSaveInput>>;
  onSaved: (result: { responseId: string; completionStatus: CompletionStatus }) => void;
  submitLabel?: string;
  header?: ReactNode;
};

const staffBadge = (question: Question): string | undefined =>
  question.audience === 'STAFF_ONLY' || STAFF_ONLY_QUESTION_TYPES.has(question.type)
    ? TSV.staffOnly
    : undefined;

// The staff side of collection: the published version in STAFF audience,
// device-local draft, field data, save-incomplete and submit. Shared by the
// "collect" screen and the visit flow.
export const StaffCollectForm = ({
  version,
  formName,
  draftScope,
  links,
  linkLabels,
  prepareSave,
  onSaved,
  submitLabel,
  header,
}: StaffCollectFormProps) => {
  const definition = version.definition;
  const seed = useCallback(
    (draft: StaffDraft): StaffDraft => ({
      ...draft,
      answers: applyCrmPrefill(definition, draft.answers, linkLabels),
    }),
    [definition, linkLabels],
  );
  const handle = useStaffDraft(draftScope, version.id, seed);
  const { draft, update } = handle;
  const [language, setLanguage] = useState<FormLanguage>(definition.languages[0] ?? 'fa');
  const [partialState, setPartialState] = useState<
    { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string } | null
  >(null);
  const numbering = useMemo(
    () => analysePrintability(definition, { audience: 'STAFF' }).numbering,
    [definition],
  );

  const responseLinks = resolveResponseLinks(definition, draft.answers, links);
  const services = useMemo(
    () => staffRendererServices(responseLinks.companyId),
    [responseLinks.companyId],
  );

  const save = async (completionStatus: CompletionStatus) => {
    const current = handle.current.current;
    const resolved = resolveResponseLinks(definition, current.answers, links);
    const extra = prepareSave === undefined ? {} : await prepareSave(completionStatus);

    return saveStaffResponse(handle, completionStatus, {
      formVersionId: version.id,
      source: 'STAFF_VISIT',
      name: staffResponseName(definition, current.answers, {
        companyLabel: linkLabels.company?.label,
        fallback: formName,
      }),
      language,
      buyingInterest: current.fieldData.buyingInterest,
      city: current.fieldData.city.trim(),
      area: current.fieldData.area.trim(),
      location: current.fieldData.location,
      ...resolved,
      campaignId: links.campaignId,
      visitId: links.visitId,
      ...extra,
    });
  };

  const describeQuestion = (questionId: string): string => {
    for (const page of definition.pages) {
      for (const item of page.items) {
        if (item.kind === 'question' && item.id === questionId) {
          const label = pickLocalizedText(item.label, language, definition.languages);
          const number = numbering[item.id];

          return number === undefined ? label : `${formatSurveyNumber(number, language)}. ${label}`;
        }
      }
    }

    return questionId;
  };

  const saveIncomplete = async () => {
    const check = validateResponse(definition, draft.answers, { audience: 'STAFF', mode: 'PARTIAL' });

    if (check.errors.length > 0) {
      setPartialState({
        kind: 'error',
        message: `${TC.fixAnswers} ${check.errors.map((error) => describeQuestion(error.questionId)).join('، ')}`,
      });

      return;
    }

    setPartialState({ kind: 'saving' });

    try {
      const result = await save('PARTIAL');

      setPartialState(result.ok ? { kind: 'saved' } : { kind: 'error', message: result.message });
    } catch {
      setPartialState({ kind: 'error', message: TC.saveFailed });
    }
  };

  const submit = async (): Promise<SubmitOutcome> => {
    setPartialState(null);

    try {
      const result = await save('COMPLETED');

      if (!result.ok) {
        const named =
          result.errors === undefined || result.errors.length === 0
            ? ''
            : ` ${result.errors.map((error) => describeQuestion(error.questionId)).join('، ')}`;

        return { ok: false, message: `${result.message}${named}`, errors: result.errors };
      }

      handle.finish();
      onSaved({ responseId: result.responseId, completionStatus: 'COMPLETED' });

      return { ok: true, ending: null };
    } catch {
      return { ok: false, message: TC.saveFailed };
    }
  };

  const hasFileQuestion = definition.pages.some((page) =>
    page.items.some((item) => item.kind === 'question' && item.type === 'file'),
  );

  return (
    <div className="svc-collect">
      <div className="svc-status-bar">
        <DraftStatusBadge draft={draft} />
        {version.printCode !== '' && <span className="svc-code">{TC.version(version.printCode)}</span>}
        {draft.responseId === null && Object.keys(draft.answers).length > 0 && (
          <button
            type="button"
            className="btn line sm"
            onClick={() => {
              if (window.confirm(TC.discardConfirm)) handle.reset();
            }}
          >
            {TC.discardDraft}
          </button>
        )}
      </div>
      {handle.restored && <div className="svc-note">{TC.restoredDraft}</div>}
      {header}
      {hasFileQuestion && <div className="svc-note">{TC.staffFilesNote}</div>}

      <FormRenderer
        definition={definition}
        title={formName}
        audience="STAFF"
        language={language}
        onLanguageChange={setLanguage}
        answers={draft.answers}
        onAnswersChange={(answers) => {
          update({ answers, dirty: true });
          if (partialState?.kind === 'saved') setPartialState(null);
        }}
        onSubmit={submit}
        services={services}
        showWelcome={false}
        submitLabel={submitLabel ?? TC.submitResponse}
        staffBadge={staffBadge}
        finalExtra={
          <FieldDataFields
            idPrefix={`svc-${version.id}`}
            value={draft.fieldData}
            onChange={(patch) =>
              update((previous) => ({ fieldData: { ...previous.fieldData, ...patch }, dirty: true }))
            }
          />
        }
        footerExtra={
          <button
            type="button"
            className="btn line"
            disabled={partialState?.kind === 'saving'}
            onClick={() => void saveIncomplete()}
          >
            {partialState?.kind === 'saving' ? TC.savingIncomplete : TC.saveIncomplete}
          </button>
        }
      />

      {partialState?.kind === 'saved' && (
        <div className="svc-note svc-ok" role="status">{TC.savedIncomplete}</div>
      )}
      {partialState?.kind === 'error' && (
        <div className="error-banner" role="alert">{partialState.message}</div>
      )}
    </div>
  );
};
