// What the browser can do with an attachment, and what the seller says it is.
//
// Two separate questions. previewKindOf answers the first from the file
// extension alone (so the list screen can decide to show a play button before
// touching the file). The FILE_TYPE_* values answer the second: they mirror the
// options of the provisioned `attachment.fileType` SELECT field
// (tools/sales-crm/provision-attachment-file-type.mjs) and are what the seller
// picks at upload time and filters on in the Files manager.

export type PreviewKind = 'audio' | 'video' | 'image' | 'pdf' | 'none';

// Only formats every mainstream browser decodes natively belong here. amr and
// heic are deliberately absent: they arrive from phones all the time, and a
// <audio>/<img> that silently shows nothing is worse than a download card.
export const EXTENSIONS_BY_KIND: Record<Exclude<PreviewKind, 'none'>, string[]> = {
  audio: ['mp3', 'm4a', 'wav', 'ogg', 'oga', 'opus', 'aac', 'weba'],
  video: ['mp4', 'webm', 'mov', 'm4v'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'],
  pdf: ['pdf'],
};

const KIND_BY_EXTENSION: Record<string, PreviewKind> = Object.fromEntries(
  Object.entries(EXTENSIONS_BY_KIND).flatMap(([kind, extensions]) =>
    extensions.map((extension) => [extension, kind as PreviewKind]),
  ),
);

export const normalizeExtension = (value: string | null | undefined): string =>
  typeof value === 'string'
    ? (value.replace(/^\./, '').split('.').pop() ?? '').toLowerCase()
    : '';

export const previewKindOf = (
  extension: string | null | undefined,
  label?: string | null,
): PreviewKind => {
  const fromField = normalizeExtension(extension);
  if (fromField !== '') return KIND_BY_EXTENSION[fromField] ?? 'none';
  const fromLabel = normalizeExtension(label);
  return KIND_BY_EXTENSION[fromLabel] ?? 'none';
};

export type FileTypeValue =
  | 'CALL_RECORDING'
  | 'VOICE_NOTE'
  | 'MEETING_RECORDING'
  | 'PHOTO'
  | 'DOCUMENT'
  | 'CONTRACT'
  | 'QUOTE'
  | 'OTHER';

export const FILE_TYPE_OPTIONS: { value: FileTypeValue; label: string }[] = [
  { value: 'CALL_RECORDING', label: 'ضبط تماس' },
  { value: 'VOICE_NOTE', label: 'یادداشت صوتی' },
  { value: 'MEETING_RECORDING', label: 'ضبط جلسه' },
  { value: 'PHOTO', label: 'عکس' },
  { value: 'DOCUMENT', label: 'سند' },
  { value: 'CONTRACT', label: 'قرارداد' },
  { value: 'QUOTE', label: 'پیش‌فاکتور' },
  { value: 'OTHER', label: 'دیگر' },
];

const LABEL_BY_TYPE = new Map(
  FILE_TYPE_OPTIONS.map((option) => [option.value as string, option.label]),
);

export const fileTypeLabel = (value: string | null | undefined): string =>
  (value && LABEL_BY_TYPE.get(value)) || (LABEL_BY_TYPE.get('OTHER') as string);

// The pre-selected type in the upload sheet. A recording attached to a task is
// almost always the call itself; the seller can still change it.
export const defaultFileTypeFor = (kind: PreviewKind): FileTypeValue => {
  switch (kind) {
    case 'audio':
      return 'CALL_RECORDING';
    case 'video':
      return 'MEETING_RECORDING';
    case 'image':
      return 'PHOTO';
    default:
      return 'DOCUMENT';
  }
};

const SAFARI_ONLY_UNSUPPORTED = new Set(['ogg', 'oga', 'opus', 'webm', 'weba']);

// WebKit (Safari, and every browser on iOS that is not Chrome-branded, which
// ships its own decoders) cannot play Ogg/Opus/WebM. The UI says so up front
// and offers download instead of a player that errors after a click.
export const isUnplayableOnThisBrowser = (
  kind: PreviewKind,
  extension: string | null | undefined,
  userAgent: string = globalThis.navigator?.userAgent ?? '',
): boolean => {
  if (kind !== 'audio' && kind !== 'video') return false;
  if (!SAFARI_ONLY_UNSUPPORTED.has(normalizeExtension(extension))) return false;
  const isChromeLike = /Chrome|CriOS|Chromium|Edg\//.test(userAgent);
  const isSafari = /Safari/.test(userAgent) && /AppleWebKit/.test(userAgent);
  return isSafari && !isChromeLike;
};
