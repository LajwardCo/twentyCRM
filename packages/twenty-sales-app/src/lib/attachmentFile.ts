import { type TaskAttachment } from '../api/attachments';

// Reading one attachment for display.
//
// The `file` composite is an array whose `url` the server signs freshly on
// every read (FilesFieldQueryResultGetterHandler) and which expires, so the URL
// is only ever used for the link rendered right now — never cached, never
// stored on a record.

export type AttachmentKind = 'audio' | 'image' | 'pdf' | 'doc' | 'sheet' | 'file';

const EXTENSION_KINDS: Record<string, AttachmentKind> = {
  mp3: 'audio',
  m4a: 'audio',
  wav: 'audio',
  ogg: 'audio',
  opus: 'audio',
  aac: 'audio',
  amr: 'audio',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  heic: 'image',
  pdf: 'pdf',
  doc: 'doc',
  docx: 'doc',
  txt: 'doc',
  rtf: 'doc',
  xls: 'sheet',
  xlsx: 'sheet',
  csv: 'sheet',
};

const FALLBACK_LABEL = 'فایل';

// Only http(s) is ever rendered as a link. The URL arrives from the API rather
// than from a user, but a link built from remote data is exactly the place a
// `javascript:` payload would be worth trying, so the scheme is checked here
// once instead of trusted at each call site.
export const attachmentDownloadUrl = (
  attachment: Pick<TaskAttachment, 'file'>,
  // Base for resolving a server-relative URL. Defaults to wherever the app is
  // running; passed explicitly by tests, which have no document.
  origin: string = globalThis.location?.origin ?? 'http://localhost',
): string | null => {
  const raw = attachment.file?.[0]?.url;
  if (typeof raw !== 'string' || raw.trim() === '') return null;

  try {
    const resolved = new URL(raw, origin);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
};

export const attachmentLabel = (
  attachment: Pick<TaskAttachment, 'name' | 'file'>,
): string => {
  const candidates = [attachment.name, attachment.file?.[0]?.label];
  const named = candidates.find(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  );
  return named?.trim() ?? FALLBACK_LABEL;
};

const extensionOf = (value: string): string =>
  value.replace(/^\./, '').split('.').pop()?.toLowerCase() ?? '';

export const attachmentKind = (
  extension: string | null | undefined,
  label?: string | null,
): AttachmentKind => {
  const fromField = typeof extension === 'string' ? extensionOf(extension) : '';
  const fromLabel = typeof label === 'string' ? extensionOf(label) : '';
  return EXTENSION_KINDS[fromField] ?? EXTENSION_KINDS[fromLabel] ?? 'file';
};
