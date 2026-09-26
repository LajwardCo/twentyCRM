import { type ResponseValidationError, type ValidationCode } from '@shared/surveys';

import { attachFileToResponse } from '../../../api/surveyAttachments';
import {
  type CompletionStatus,
  type ReviewStatus,
  type StaffResponseInput,
  createStaffResponse,
  invalidAnswersFrom,
  surveyErrorTag,
  updateResponse,
} from '../../../api/surveys';
import { pendingUploads, rewriteUploadRefs } from '../../../lib/forms/collect/fileRefs';
import { type StaffDraft } from '../../../lib/forms/collect/staffDraft';
import { TC } from '../../../lib/forms/collectStrings';

export type StaffSaveInput = Omit<StaffResponseInput, 'submissionKey' | 'answers' | 'completionStatus'> & {
  reviewStatus?: ReviewStatus;
};

export type StaffSaveResult =
  | { ok: true; responseId: string }
  | {
      ok: false;
      message: string;
      errors?: ResponseValidationError[];
      duplicateReference?: boolean;
    };

type DraftAccess = {
  current: { current: StaffDraft };
  update: (patch: Partial<StaffDraft>) => void;
};

const failureFrom = (error: unknown): StaffSaveResult => {
  const tag = surveyErrorTag(error);

  if (tag === 'SURVEY_INVALID_ANSWERS') {
    return {
      ok: false,
      message: TC.fixAnswers,
      errors: invalidAnswersFrom(error).map((entry) => ({
        questionId: entry.questionId,
        code: entry.code as ValidationCode,
      })),
    };
  }

  if (tag === 'SURVEY_DUPLICATE_PAPER_REFERENCE') {
    return { ok: false, message: TC.duplicateReference, duplicateReference: true };
  }

  return { ok: false, message: TC.saveFailed };
};

// Creates the response on the first save and updates it afterwards, reusing
// the draft's submission key so a retried create finds the saved record.
// Every step records its result in the draft before the next one, so a save
// interrupted half-way resumes instead of repeating what already happened.
export const saveStaffResponse = async (
  access: DraftAccess,
  completionStatus: CompletionStatus,
  input: StaffSaveInput,
): Promise<StaffSaveResult> => {
  const draft = access.current.current;
  let responseId = draft.responseId;

  try {
    if (responseId === null) {
      // The server accepts reviewStatus on create; the shared input type just
      // does not list it.
      const createInput: StaffResponseInput & { reviewStatus?: ReviewStatus } = {
        ...input,
        submissionKey: draft.submissionKey,
        answers: draft.answers,
        completionStatus,
      };
      const created = await createStaffResponse(createInput);

      responseId = created.id;
      access.update({ responseId });
    } else {
      const { source: _source, formVersionId: _formVersionId, ...patch } = input;

      await updateResponse(responseId, { ...patch, answers: draft.answers, completionStatus });
    }
  } catch (error) {
    return failureFrom(error);
  }

  try {
    const attachments = { ...access.current.current.attachments };

    for (const upload of pendingUploads(access.current.current.answers)) {
      if (attachments[upload.fileId] !== undefined) continue;

      const attachment = await attachFileToResponse({
        fileId: upload.fileId,
        name: upload.name,
        responseId,
      });

      attachments[upload.fileId] = attachment.id;
      access.update({ attachments });
    }

    const rewritten = rewriteUploadRefs(access.current.current.answers, attachments);

    if (rewritten !== access.current.current.answers) {
      await updateResponse(responseId, { answers: rewritten });
      access.update({ answers: rewritten });
    }
  } catch {
    return { ok: false, message: TC.attachFailed };
  }

  access.update({ dirty: false, savedAt: new Date().toISOString() });

  return { ok: true, responseId };
};
