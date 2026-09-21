import { useState } from 'react';

import { type TaskAttachment } from '../api/attachments';
import {
  attachmentDownloadUrl,
  attachmentKind,
  attachmentLabel,
} from '../lib/attachmentFile';
import { fileTypeLabel } from '../lib/fileType';
import { formatJalaliDateTime } from '../lib/jalali';
import { T13 } from '../lib/strings';
import { FileViewerModal } from './FileViewerModal';

type AttachmentChipProps = {
  attachment: TaskAttachment;
  taskId?: string | null;
  leadId?: string | null;
  // External accounts have no Files manager to link to.
  showDetailLink?: boolean;
};

const KIND_ICONS: Record<string, string> = {
  audio: '🎙',
  image: '🖼',
  pdf: '📄',
  doc: '📝',
  sheet: '📊',
  file: '📎',
};

// One uploaded file, as a chip that opens it in the in-app viewer (player for
// recordings, image/pdf preview, download card for the rest).
//
// The URL is the server-signed one from this render's query — it expires, so
// the chip is deliberately re-rendered from fresh data rather than holding on
// to a URL. When the server returned none the chip stays a plain, unclickable
// pill instead of a viewer that would 404.
export const AttachmentChip = ({
  attachment,
  taskId,
  leadId,
  showDetailLink = true,
}: AttachmentChipProps) => {
  const [open, setOpen] = useState(false);
  const href = attachmentDownloadUrl(attachment);
  const label = attachmentLabel(attachment);
  const icon =
    KIND_ICONS[
      attachmentKind(attachment.file?.[0]?.extension, attachment.file?.[0]?.label)
    ] ?? KIND_ICONS.file;
  const typeSuffix = attachment.fileType ? ` · ${fileTypeLabel(attachment.fileType)}` : '';
  const title = `${label}${typeSuffix} — ${formatJalaliDateTime(attachment.createdAt)}`;

  if (href === null) {
    return (
      <span className="pill stage" title={`${title} — ${T13.fileUnavailable}`}>
        {icon} {label}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className="pill stage"
        title={title}
        style={{ cursor: 'pointer', border: 0, fontFamily: 'inherit' }}
        onClick={() => setOpen(true)}
      >
        {icon} {label}
        {attachment.fileType && (
          <span className="muted" style={{ fontWeight: 500 }}>
            {fileTypeLabel(attachment.fileType)}
          </span>
        )}
      </button>
      {open && (
        <FileViewerModal
          attachment={attachment}
          onClose={() => setOpen(false)}
          taskId={taskId}
          leadId={leadId}
          showDetailLink={showDetailLink}
        />
      )}
    </>
  );
};
