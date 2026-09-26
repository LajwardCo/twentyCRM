import { type FormLanguage, analysePrintability, validateResponse } from '@shared/surveys';
import { useEffect, useMemo, useState } from 'react';

import { type CompletionStatus, type SurveyFormVersion } from '../../../api/surveys';
import {
  type PaperMeta,
  buildPaperReviewNotes,
  collectionDateToIso,
  normalizePaperReference,
  parsePaperMeta,
  todayLocalDate,
} from '../../../lib/forms/collect/paperEntry';
import { staffResponseName } from '../../../lib/forms/collect/responseName';
import { safeLocalStorage } from '../../../lib/forms/collect/staffDraft';
import { TC } from '../../../lib/forms/collectStrings';
import { toPersianDigits } from '../../../lib/jalali';
import { FormRenderer, type SubmitOutcome } from '../FormRenderer';
import { DraftStatusBadge } from './CollectChrome';
import { PaperMetaFields } from './PaperMetaFields';
import { PaperScans } from './PaperScans';
import { type StaffSaveInput, saveStaffResponse } from './staffSave';
import { staffRendererServices } from './staffServices';
import { useStaffDraft } from './useStaffDraft';

type PaperEntryFormProps = {
  formId: string;
  formName: string;
  version: SurveyFormVersion;
  enteredByName: string;
  onCompleted: (responseId: string) => void;
};

// Transcribing one paper sheet against the version that was printed. Answers
// the transcriber cannot read are marked unclear (left empty, listed for the
// reviewer, response flagged NEEDS_REVIEW) — never guessed.
export const PaperEntryForm = ({ formId, formName, version, enteredByName, onCompleted }: PaperEntryFormProps) => {
  const definition = version.definition;
  const handle = useStaffDraft(`paper:${formId}`, version.id);
  const { draft, update } = handle;
  const metaKey = `svc-paper-meta:${formId}:${version.id}`;
  const [meta, setMeta] = useState<PaperMeta>(() => {
    try {
      return parsePaperMeta(safeLocalStorage()?.getItem(metaKey) ?? null, todayLocalDate());
    } catch {
      return parsePaperMeta(null, todayLocalDate());
    }
  });
  const [language, setLanguage] = useState<FormLanguage>(definition.languages[0] ?? 'fa');
  const [partial, setPartial] = useState<{ kind: 'saving' | 'saved' } | { kind: 'error'; message: string } | null>(null);
  const unclearIds = useMemo(() => new Set(meta.unclearIds), [meta.unclearIds]);
  const numbering = useMemo(() => analysePrintability(definition, { audience: 'STAFF' }).numbering, [definition]);
  const services = useMemo(() => staffRendererServices(null), []);

  useEffect(() => {
    try {
      safeLocalStorage()?.setItem(metaKey, JSON.stringify(meta));
    } catch {
      // kept in memory only
    }
  }, [meta, metaKey]);

  const patchMeta = (next: Partial<PaperMeta>) => {
    setMeta((previous) => ({ ...previous, ...next }));
    update({ dirty: true });
  };

  const toggleUnclear = (questionId: string) => {
    const marked = !unclearIds.has(questionId);

    if (marked && draft.answers[questionId] !== undefined) {
      const answers = { ...draft.answers };

      delete answers[questionId];
      update({ answers, dirty: true });
    }

    patchMeta({
      unclearIds: marked ? [...meta.unclearIds, questionId] : meta.unclearIds.filter((id) => id !== questionId),
    });
  };

  const input = (): StaffSaveInput => {
    const reference = normalizePaperReference(meta.paperReference);

    return {
      formVersionId: version.id,
      source: 'PAPER',
      language,
      name: staffResponseName(definition, handle.current.current.answers, {
        fallback: reference === '' ? formName : `${formName} · ${reference}`,
      }),
      collectedAt: collectionDateToIso(meta.collectedDate) ?? undefined,
      collectorId: meta.collectorId === '' ? null : meta.collectorId,
      paperReference: reference,
      paperReviewNotes: buildPaperReviewNotes({
        definition,
        unclearIds,
        numbering,
        notes: meta.notes,
        language,
        unclearLine: TC.unclearNote,
      }),
      ...(unclearIds.size > 0 ? { reviewStatus: 'NEEDS_REVIEW' as const } : {}),
    };
  };

  const save = (status: CompletionStatus) => saveStaffResponse(handle, status, input());

  const saveIncomplete = async () => {
    if (validateResponse(definition, draft.answers, { audience: 'STAFF', mode: 'PARTIAL' }).errors.length > 0) {
      setPartial({ kind: 'error', message: TC.fixAnswers });

      return;
    }

    setPartial({ kind: 'saving' });

    const result = await save('PARTIAL').catch(() => null);

    setPartial(result?.ok === true ? { kind: 'saved' } : { kind: 'error', message: result?.message ?? TC.saveFailed });
  };

  const submit = async (): Promise<SubmitOutcome> => {
    setPartial(null);

    const result = await save('COMPLETED').catch(() => null);

    if (result === null) return { ok: false, message: TC.saveFailed };
    if (!result.ok) return { ok: false, message: result.message, errors: result.errors };

    try {
      safeLocalStorage()?.removeItem(metaKey);
    } catch {
      // nothing to clear
    }

    handle.finish();
    onCompleted(result.responseId);

    return { ok: true, ending: null };
  };

  return (
    <div className="svc-collect">
      <div className="svc-status-bar">
        <DraftStatusBadge draft={draft} />
        {version.printCode !== '' && <span className="svc-code">{TC.version(version.printCode)}</span>}
      </div>
      {handle.restored && <div className="svc-note">{TC.restoredDraft}</div>}

      <PaperMetaFields
        formId={formId}
        responseId={draft.responseId}
        value={meta}
        onChange={patchMeta}
        enteredByName={enteredByName}
      />

      {unclearIds.size > 0 && (
        <div className="svc-note svc-warn-note">{TC.unclearCount(toPersianDigits(unclearIds.size))}</div>
      )}

      <FormRenderer
        definition={definition}
        audience="STAFF"
        language={language}
        onLanguageChange={setLanguage}
        answers={draft.answers}
        onAnswersChange={(answers) => update({ answers, dirty: true })}
        onSubmit={submit}
        services={services}
        layout="continuous"
        showWelcome={false}
        submitLabel={TC.submitResponse}
        unclear={{ ids: unclearIds, onToggle: toggleUnclear, label: TC.unclear }}
        footerExtra={
          <button
            type="button"
            className="btn line"
            disabled={partial?.kind === 'saving'}
            onClick={() => void saveIncomplete()}
          >
            {partial?.kind === 'saving' ? TC.savingIncomplete : TC.saveIncomplete}
          </button>
        }
      />

      {partial?.kind === 'saved' && <div className="svc-note svc-ok" role="status">{TC.savedIncomplete}</div>}
      {partial?.kind === 'error' && <div className="error-banner" role="alert">{partial.message}</div>}
      {draft.responseId !== null && (
        <section className="card svc-step">
          <PaperScans responseId={draft.responseId} />
        </section>
      )}
    </div>
  );
};
