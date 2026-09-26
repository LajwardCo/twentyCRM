import { type FileAnswer, SURVEY_LIMITS, isMimeTypeAccepted } from '@shared/surveys';
import { useState } from 'react';

import { type QuestionInputProps, type RendererServices } from './inputTypes';

const ACCEPT_BY_GROUP: Record<string, string> = {
  image: 'image/*',
  pdf: 'application/pdf',
  document: '.doc,.docx,.txt',
  spreadsheet: '.xls,.xlsx,.csv',
  audio: 'audio/*',
};

// Uploads each chosen file immediately through the host's uploader and keeps
// only the returned reference in the answer. Without an uploader (preview)
// the file is represented locally and never leaves the device.
export const FileInput = ({
  question,
  strings,
  value,
  onChange,
  inputId,
  describedBy,
  disabled,
  uploadFile,
}: QuestionInputProps & Pick<RendererServices, 'uploadFile'>) => {
  const files = Array.isArray(value) ? (value as FileAnswer[]) : [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileTypes = question.config.fileTypes ?? ['image', 'pdf'];
  const maxFiles = Math.min(question.config.maxFiles ?? 1, SURVEY_LIMITS.maxFiles);
  const maxMb = Math.min(question.config.maxFileMb ?? SURVEY_LIMITS.maxFileMb, SURVEY_LIMITS.maxFileMb);

  const choose = async (list: FileList | null) => {
    if (list === null || list.length === 0) return;

    setError(null);
    const next = [...files];

    setBusy(true);
    try {
      for (const file of Array.from(list).slice(0, maxFiles - files.length)) {
        if (file.size > maxMb * 1024 * 1024 || !isMimeTypeAccepted(file.type, fileTypes)) {
          setError(strings.errors.INVALID_FILE);
          continue;
        }

        next.push(
          uploadFile !== undefined
            ? await uploadFile(question, file)
            : { ref: `local:${file.name}`, name: file.name, mimeType: file.type, sizeBytes: file.size },
        );
      }

      onChange(next.length === 0 ? undefined : next);
    } catch {
      setError(strings.submitFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sv-stack" aria-describedby={describedBy}>
      {files.map((file) => (
        <div key={file.ref} className="sv-file-chip">
          <span dir="auto">📎 {file.name}</span>
          <button
            type="button"
            className="btn line sm"
            disabled={disabled}
            onClick={() => {
              const remaining = files.filter((candidate) => candidate.ref !== file.ref);

              onChange(remaining.length === 0 ? undefined : remaining);
            }}
          >
            {strings.remove}
          </button>
        </div>
      ))}
      {files.length < maxFiles && (
        <label className="btn line sm sv-file-button">
          {busy ? strings.uploading : strings.upload}
          <input
            id={inputId}
            type="file"
            className="sv-visually-hidden"
            accept={fileTypes.map((group) => ACCEPT_BY_GROUP[group]).join(',')}
            multiple={maxFiles - files.length > 1}
            disabled={disabled || busy}
            onChange={(event) => {
              void choose(event.target.files);
              event.target.value = '';
            }}
          />
        </label>
      )}
      {error !== null && <div className="sv-hint sv-warn">{error}</div>}
    </div>
  );
};
