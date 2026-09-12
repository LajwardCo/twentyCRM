import { useEffect, useState } from 'react';

import { type TaskAttachment } from '../api/attachments';
import { fetchFile } from '../api/files';
import { recordAudit } from '../lib/audit';
import {
  attachmentDownloadUrl,
  attachmentLabel,
} from '../lib/attachmentFile';
import { TFILES } from '../lib/fileStrings';
import { fileTypeLabel, previewKindOf } from '../lib/fileType';
import { formatJalaliDateTime } from '../lib/jalali';
import { navigate } from '../lib/router';
import { FilePreview } from './FilePreview';
import { ModalSheet } from './ModalSheet';

type FileViewerModalProps = {
  attachment: TaskAttachment;
  onClose: () => void;
  // Where the file lives, for the "open task / open lead" links.
  taskId?: string | null;
  leadId?: string | null;
  // Shown when the file is opened from somewhere other than its own page.
  showDetailLink?: boolean;
};

// Opens an attachment in place instead of in a new tab. Renders from the
// record it was handed (whose signed URL is fresh from that screen's query);
// if the media element then fails -- typically an expired URL on a screen
// left open -- it refetches the record once for a new URL before giving up.
export const FileViewerModal = ({
  attachment,
  onClose,
  taskId,
  leadId,
  showDetailLink = true,
}: FileViewerModalProps) => {
  const [record, setRecord] = useState<TaskAttachment>(attachment);
  const [retried, setRetried] = useState(false);

  useEffect(() => {
    setRecord(attachment);
    setRetried(false);
  }, [attachment]);

  useEffect(() => {
    recordAudit({
      eventType: 'file.view',
      category: 'read',
      severity: 'sensitive',
      targetType: 'attachment',
      targetId: attachment.id,
      targetLabel: attachmentLabel(attachment),
    });
  }, [attachment]);

  const onMediaError = () => {
    if (retried) return;
    setRetried(true);
    fetchFile(attachment.id)
      .then((fresh) => {
        if (fresh !== null) setRecord(fresh);
      })
      .catch(() => {
        // The preview already shows "unavailable"; nothing more to do.
      });
  };

  const file = record.file?.[0] ?? null;
  const label = attachmentLabel(record);
  const url = attachmentDownloadUrl(record);
  const kind = previewKindOf(file?.extension, file?.label);

  return (
    <ModalSheet title={label} onClose={onClose}>
      <FilePreview
        key={url ?? 'none'}
        url={url}
        kind={kind}
        label={label}
        extension={file?.extension ?? null}
        onError={onMediaError}
      />

      <div
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginTop: 12,
        }}
      >
        {record.fileType && (
          <span className="pill stage">{fileTypeLabel(record.fileType)}</span>
        )}
        <span className="muted" style={{ fontSize: 12 }}>
          {formatJalaliDateTime(record.createdAt)}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        {url !== null && (
          <a className="btn line sm" href={url} download={label} rel="noreferrer noopener">
            ⬇ {TFILES.download}
          </a>
        )}
        {showDetailLink && (
          <button
            type="button"
            className="btn line sm"
            onClick={() => {
              onClose();
              navigate(`/files/${record.id}`);
            }}
          >
            {TFILES.detailTitle}
          </button>
        )}
        {taskId && (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              onClose();
              navigate(`/task/${taskId}`);
            }}
          >
            {TFILES.openTask}
          </button>
        )}
        {leadId && (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              onClose();
              navigate(`/lead/${leadId}`);
            }}
          >
            {TFILES.openLead}
          </button>
        )}
      </div>
    </ModalSheet>
  );
};
