import { useRef, useState } from 'react';

import { fetchResponseAttachments, uploadResponseAttachment } from '../../../../api/surveyResponseExtras';
import { useCached } from '../../../../lib/cache';
import { TSR } from '../../../../lib/forms/responseStrings';
import { AttachmentChip } from '../../../AttachmentChip';
import { IconPaperclip } from '../../../icons';

type ResponseAttachmentsProps = {
  responseId: string;
  canEdit: boolean;
};

// Scans of paper sheets, photos from a visit, and files attached while
// correcting answers.
export const ResponseAttachments = ({ responseId, canEdit }: ResponseAttachmentsProps) => {
  const { data: attachments, error, refresh } = useCached(`svr:attachments:${responseId}`, () =>
    fetchResponseAttachments(responseId),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const upload = async (files: FileList | null) => {
    if (files === null || files.length === 0 || uploading) return;

    // Copied before the input is reset: the FileList is live.
    const chosen = Array.from(files);

    setUploading(true);
    setMessage(null);

    try {
      for (const file of chosen) await uploadResponseAttachment(responseId, file);
      await refresh();
    } catch (failure) {
      setMessage(`${TSR.uploadFailed}: ${failure instanceof Error ? failure.message : ''}`);
    } finally {
      setUploading(false);

      if (inputRef.current !== null) inputRef.current.value = '';
    }
  };

  return (
    <section className="card svr-section" aria-labelledby="svr-attachments-title">
      <h3 id="svr-attachments-title">{TSR.attachments}</h3>
      {error !== null && <p className="svr-muted">{error}</p>}
      {attachments !== null && attachments.length === 0 && <p className="svr-muted">{TSR.noAttachments}</p>}
      <div className="svr-attachments">
        {(attachments ?? []).map((attachment) => (
          <AttachmentChip key={attachment.id} attachment={attachment} showDetailLink={false} />
        ))}
      </div>
      {canEdit && (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="sv-visually-hidden"
            aria-label={TSR.upload}
            onChange={(event) => void upload(event.target.files)}
          />
          <button type="button" className="btn line sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
            <IconPaperclip size={14} />
            {uploading ? TSR.uploading : TSR.upload}
          </button>
        </>
      )}
      {message !== null && <p className="svr-action-message" role="status">{message}</p>}
    </section>
  );
};
