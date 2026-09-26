import { type FormLanguage, analysePrintability, validateResponse } from '@shared/surveys';
import { useEffect, useMemo, useRef, useState } from 'react';

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
import { createExclusiveSave } from '../../../lib/forms/collect/exclusiveSave';
import {
  clearStaffDraft,
  paperMetaKey,
  safeLocalStorage,
  staffDraftKey,
} from '../../../lib/forms/collect/staffDraft';
import { TC } from '../../../lib/forms/collectStrings';
import { toPersianDigits } from '../../../lib/jalali';
import { FormRenderer, type SubmitOutcome } from '../FormRenderer';
import { DraftStatusBadge, LoadingCard, OlderDraftNote } from './CollectChrome';
import { PaperMetaFields } from './PaperMetaFields';
import { PaperScans } from './PaperScans';
import { type StaffSaveInput, type StaffSaveResult, saveStaffResponse } from './staffSave';
import { staffRendererServices } from './staffServices';
import { useDraftVersion, useStaffDraft } from './useStaffDraft';

type PaperEntryFormProps = {
  formId: string;
  formName: string;
  version: SurveyFormVersion;
  // The signed-in member: drafts on a shared device are per person.
  memberId: string;
  enteredByName: string;
  onCompleted: (responseId: string) => void;
};

// Transcribing one paper sheet against the version that was printed. Answers
// the transcriber cannot read are marked unclear (left empty, listed for the
// reviewer, response flagged NEEDS_REVIEW) — never guessed. An unfinished
// sheet started on another version is finished on that version first.
export const PaperEntryForm = (props: PaperEntryFormProps) => {
  const draftKey = staffDraftKey(props.memberId, `paper:${props.formId}`);
  const { state, switchToCurrent } = useDraftVersion(draftKey, props.version);

  if (state.status === 'loading') return <LoadingCard />;

  return (
    <PaperEntryFormBody
      key={state.version.id}
      {...props}
      version={state.version}
      draftKey={draftKey}
      metaKey={paperMetaKey(props.memberId, props.formId)}
      olderThan={state.olderThan}
      onDiscardOlder={() => {
        clearStaffDraft(safeLocalStorage(), draftKey);
        switchToCurrent();
      }}
    />
  );
};

const PaperEntryFormBody = ({
  formName,
  formId,
  version,
  enteredByName,
  onCompleted,
  draftKey,
  metaKey,
  olderThan,
  onDiscardOlder,
}: Omit<PaperEntryFormProps, 'memberId'> & {
  draftKey: string;
  metaKey: string;
  olderThan: SurveyFormVersion | null;
  onDiscardOlder: () => void;
}) => {
  const definition = version.definition;
  const handle = useStaffDraft(draftKey, version.id);
  const { draft, update } = handle;
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

  const [running, setRunning] = useState<CompletionStatus | null>(null);
  const runSave = (status: CompletionStatus): Promise<StaffSaveResult> => saveStaffResponse(handle, status, input());
  const latestRunSave = useRef(runSave);

  latestRunSave.current = runSave;

  // One save at a time, shared by "save incomplete" and submit.
  const [save] = useState(() =>
    createExclusiveSave((status) => latestRunSave.current(status), setRunning),
  );

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
      {olderThan !== null && (
        <OlderDraftNote
          draftVersion={version.versionNumber}
          currentVersion={olderThan.versionNumber}
          canDiscard={draft.responseId === null}
          onDiscard={() => {
            try {
              safeLocalStorage()?.removeItem(metaKey);
            } catch {
              // nothing to clear
            }
            onDiscardOlder();
          }}
        />
      )}

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
        submitDisabled={running !== null}
        services={services}
        layout="continuous"
        showWelcome={false}
        submitLabel={TC.submitResponse}
        unclear={{ ids: unclearIds, onToggle: toggleUnclear, label: TC.unclear }}
        footerExtra={
          <button
            type="button"
            className="btn line"
            disabled={running !== null}
            onClick={() => void saveIncomplete()}
          >
            {running === 'PARTIAL' ? TC.savingIncomplete : TC.saveIncomplete}
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
