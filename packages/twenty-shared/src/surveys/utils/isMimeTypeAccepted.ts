import { FILE_TYPE_MIME_PATTERNS } from '../constants/FILE_TYPE_MIME_PATTERNS';
import { type FileTypeGroup } from '../types/FormDefinition';

const DEFAULT_FILE_TYPES: FileTypeGroup[] = ['image', 'pdf'];

export const isMimeTypeAccepted = (
  mimeType: string,
  fileTypes: FileTypeGroup[] | undefined,
): boolean =>
  (fileTypes !== undefined && fileTypes.length > 0
    ? fileTypes
    : DEFAULT_FILE_TYPES
  ).some((group) => FILE_TYPE_MIME_PATTERNS[group].test(mimeType));
