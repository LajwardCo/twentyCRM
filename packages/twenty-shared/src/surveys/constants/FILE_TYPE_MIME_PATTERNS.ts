import { type FileTypeGroup } from '../types/FormDefinition';

export const FILE_TYPE_MIME_PATTERNS: Record<FileTypeGroup, RegExp> = {
  image: /^image\/(jpeg|png|webp|heic|heif|gif)$/,
  pdf: /^application\/pdf$/,
  document:
    /^(application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|text\/plain)$/,
  spreadsheet:
    /^(application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|text\/csv)$/,
  audio: /^audio\/(mpeg|mp4|aac|ogg|wav|webm|x-m4a)$/,
};
