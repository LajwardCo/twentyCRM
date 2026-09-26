import {
  type FormDefinition,
  type FormLanguage,
  type Question,
  type ResponseValidationError,
  type ValidationCode,
  buildQuestionIndex,
  pickLocalizedText,
} from '@shared/surveys';
import { useMemo, useState } from 'react';

import { uploadCorrectionFile } from '../../../../api/surveyResponseExtras';
import {
  type CompletionStatus,
  type SurveyResponse,
  invalidAnswersFrom,
  updateResponse,
} from '../../../../api/surveys';
import { type CrmRecordKind } from '../../../../api/surveyCrm';
import { TSR } from '../../../../lib/forms/responseStrings';
import { RESPONDENT_STRINGS, TSV } from '../../../../lib/forms/surveyStrings';
import { CrmRecordPicker } from '../../CrmRecordPicker';
import { FormRenderer, type SubmitOutcome } from '../../FormRenderer';

type ResponseCorrectionProps = {
  response: SurveyResponse;
  definition: FormDefinition;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

const CRM_KINDS: Partial<Record<Question['type'], CrmRecordKind>> = {
  crm_company: 'company',
  crm_contact: 'person',
  crm_lead: 'opportunity',
};

const asErrors = (error: unknown): ResponseValidationError[] =>
  invalidAnswersFrom(error).map((entry) => ({ questionId: entry.questionId, code: entry.code as ValidationCode }));

// Corrections go through the same server hook as every other write: answers
// are re-validated against the response's own version, hidden answers are
// stripped, and the change lands in the record's history.
export const ResponseCorrection = ({ response, definition, onClose, onSaved }: ResponseCorrectionProps) => {
  const language: FormLanguage = definition.languages.includes(response.language as FormLanguage)
    ? (response.language as FormLanguage)
    : (definition.languages[0] ?? 'fa');
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => ({ ...response.answers }));
  const [partialState, setPartialState] = useState<{ saving: boolean; message: string | null }>({ saving: false, message: null });
  const questions = useMemo(() => buildQuestionIndex(definition), [definition]);

  const save = async (completionStatus: CompletionStatus): Promise<SubmitOutcome> => {
    try {
      await updateResponse(response.id, { answers, completionStatus });
      await onSaved();

      return { ok: true, ending: null };
    } catch (error) {
      const errors = asErrors(error);

      return {
        ok: false,
        message: errors.length > 0 ? TSR.correctionInvalid : `${TSR.correctionFailed}: ${error instanceof Error ? error.message : ''}`,
        errors,
      };
    }
  };

  // Partial saves skip the renderer's "complete" validation; the server still
  // checks every answer's format and reports it here by question.
  const savePartial = async () => {
    if (partialState.saving) return;

    setPartialState({ saving: true, message: null });

    const outcome = await save('PARTIAL');

    if (outcome.ok) {
      onClose();

      return;
    }

    const labels = (outcome.errors ?? [])
      .map((entry) => {
        const question = questions.get(entry.questionId);
        const label = question === undefined ? entry.questionId : pickLocalizedText(question.label, language, definition.languages);

        return `${label}: ${RESPONDENT_STRINGS.fa.errors[entry.code] ?? entry.code}`;
      })
      .join(' — ');

    setPartialState({ saving: false, message: labels === '' ? outcome.message : `${outcome.message} ${labels}` });
  };

  return (
    <div className="svr-overlay" role="dialog" aria-modal="true" aria-labelledby="svr-correction-title">
      <div className="svr-overlay-panel">
        <div className="svr-overlay-head">
          <div>
            <h2 id="svr-correction-title">{TSR.editTitle}</h2>
            <p className="svr-muted">{TSR.editHint}</p>
          </div>
          <button type="button" className="btn line sm" onClick={onClose}>
            {TSR.close}
          </button>
        </div>
        {partialState.message !== null && (
          <div className="error-banner" role="alert">
            {partialState.message}
          </div>
        )}
        <FormRenderer
          definition={definition}
          audience="STAFF"
          language={language}
          layout="continuous"
          showWelcome={false}
          answers={answers}
          onAnswersChange={setAnswers}
          submitLabel={TSR.saveComplete}
          onSubmit={() => save('COMPLETED')}
          onFinished={onClose}
          staffBadge={(question) =>
            question.audience === 'STAFF_ONLY' || question.type.startsWith('crm_') ? TSV.staffOnly : undefined
          }
          footerExtra={
            <button type="button" className="btn line" disabled={partialState.saving} onClick={() => void savePartial()}>
              {partialState.saving ? TSV.saving : TSR.savePartial}
            </button>
          }
          services={{
            uploadFile: (_question, file) => uploadCorrectionFile(response.id, file),
            renderCrmPicker: (question, value, onChange) => {
              const kind = CRM_KINDS[question.type];

              if (kind === undefined) return null;

              const current = value as { recordId?: string; label?: string } | undefined;

              return (
                <CrmRecordPicker
                  kind={kind}
                  value={current?.recordId ? { recordId: current.recordId, label: current.label ?? '' } : null}
                  companyId={kind === 'company' ? null : (response.company?.id ?? null)}
                  onChange={(next) => onChange(next ?? undefined)}
                />
              );
            },
          }}
        />
      </div>
    </div>
  );
};
