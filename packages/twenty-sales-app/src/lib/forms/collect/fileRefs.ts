import { type FileAnswer } from '@shared/surveys';

// Staff uploads: a file is stored the moment it is chosen (so it survives a
// reload of the device draft), but a response only exists after the first
// save — so the answer carries "upload:<fileId>" until then, and is rewritten
// to "attachment:<id>" (the same form the public endpoint stores) once the
// file is attached to the saved response.

export const UPLOAD_REF_PREFIX = 'upload:';
export const ATTACHMENT_REF_PREFIX = 'attachment:';

export type PendingUpload = {
  questionId: string;
  fileId: string;
  name: string;
};

const isFileAnswer = (value: unknown): value is FileAnswer =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as FileAnswer).ref === 'string' &&
  typeof (value as FileAnswer).name === 'string';

export const uploadRef = (fileId: string): string => `${UPLOAD_REF_PREFIX}${fileId}`;

export const pendingUploads = (answers: Record<string, unknown>): PendingUpload[] => {
  const pending: PendingUpload[] = [];

  for (const [questionId, value] of Object.entries(answers)) {
    if (!Array.isArray(value)) continue;

    for (const file of value) {
      if (isFileAnswer(file) && file.ref.startsWith(UPLOAD_REF_PREFIX)) {
        pending.push({
          questionId,
          fileId: file.ref.slice(UPLOAD_REF_PREFIX.length),
          name: file.name,
        });
      }
    }
  }

  return pending;
};

// Replaces every upload ref that has an attachment; leaves the rest as-is.
export const rewriteUploadRefs = (
  answers: Record<string, unknown>,
  attachmentIdsByFileId: Record<string, string>,
): Record<string, unknown> => {
  let changed = false;
  const next: Record<string, unknown> = {};

  for (const [questionId, value] of Object.entries(answers)) {
    if (!Array.isArray(value)) {
      next[questionId] = value;
      continue;
    }

    next[questionId] = value.map((file: unknown) => {
      if (!isFileAnswer(file) || !file.ref.startsWith(UPLOAD_REF_PREFIX)) return file;

      const attachmentId = attachmentIdsByFileId[file.ref.slice(UPLOAD_REF_PREFIX.length)];

      if (attachmentId === undefined) return file;

      changed = true;

      return { ...file, ref: `${ATTACHMENT_REF_PREFIX}${attachmentId}` };
    });
  }

  return changed ? next : answers;
};
