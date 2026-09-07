import { type TaskAttachment } from '../api/attachments';
import {
  attachmentDownloadUrl,
  attachmentKind,
  attachmentLabel,
} from '../lib/attachmentFile';
import { formatJalaliDateTime } from '../lib/jalali';
import { T13 } from '../lib/strings';

type AttachmentChipProps = {
  attachment: TaskAttachment;
};

const KIND_ICONS: Record<string, string> = {
  audio: '🎙',
  image: '🖼',
  pdf: '📄',
  doc: '📝',
  sheet: '📊',
  file: '📎',
};

// One uploaded file, as a link that actually opens it.
//
// The href is the server-signed URL from this render's query — it expires, so
// the chip is deliberately re-rendered from fresh data rather than holding on
// to a URL. When the server returned none the chip stays a plain, unclickable
// pill instead of a link that would 404.
export const AttachmentChip = ({ attachment }: AttachmentChipProps) => {
  const href = attachmentDownloadUrl(attachment);
  const label = attachmentLabel(attachment);
  const icon =
    KIND_ICONS[
      attachmentKind(attachment.file?.[0]?.extension, attachment.file?.[0]?.label)
    ] ?? KIND_ICONS.file;
  const title = `${label} — ${formatJalaliDateTime(attachment.createdAt)}`;

  if (href === null) {
    return (
      <span className="pill stage" title={`${title} — ${T13.fileUnavailable}`}>
        {icon} {label}
      </span>
    );
  }

  return (
    <a
      className="pill stage"
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title={title}
      style={{ textDecoration: 'none', cursor: 'pointer' }}
    >
      {icon} {label}
    </a>
  );
};
