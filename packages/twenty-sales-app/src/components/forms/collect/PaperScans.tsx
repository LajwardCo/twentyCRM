import { useEffect, useState } from 'react';

import {
  type SurveyAttachment,
  listResponseAttachments,
  uploadResponseAttachment,
} from '../../../api/surveyAttachments';
import { TC } from '../../../lib/forms/collectStrings';

// Scans or photos of the paper sheet, attached to the saved response so a
// reviewer can compare the transcription with the original.
export const PaperScans = ({ responseId }: { responseId: string }) => {
  const [attachments, setAttachments] = useState<SurveyAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listResponseAttachments(responseId)
      .then(setAttachments)
      .catch(() => undefined);
  }, [responseId]);

  const upload = async (files: File[]) => {
    if (files.length === 0) return;

    setBusy(true);
    setError(null);

    try {
      for (const file of files) {
        const attachment = await uploadResponseAttachment({ file, responseId });

        setAttachments((previous) => [...previous, attachment]);
      }
    } catch {
      setError(TC.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="svc-scans">
      <div className="svc-label">{TC.scansTitle}</div>
      <div className="svc-hint">{TC.scansHint}</div>
      {attachments.length > 0 && (
        <ul className="svc-scan-list">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              <span aria-hidden="true">📎</span> <span dir="auto">{attachment.name}</span>
              <small>{TC.scanAttached}</small>
            </li>
          ))}
        </ul>
      )}
      <label className={`btn line svc-file-label${busy ? ' disabled' : ''}`}>
        {busy ? TC.uploading : TC.addScan}
        <input
          type="file"
          className="sv-visually-hidden"
          accept="image/*,application/pdf"
          multiple
          disabled={busy}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);

            event.target.value = '';
            void upload(files);
          }}
        />
      </label>
      {error !== null && <div className="svc-hint svc-warn" role="alert">{error}</div>}
    </div>
  );
};
