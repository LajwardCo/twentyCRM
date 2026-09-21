import { type TaskAttachment } from '../api/attachments';
import { previewKindOf } from './fileType';

// Pure helpers behind the Files manager list: cursor pages are appended, and
// "play the next one" walks the rows the way a reviewer's eye does.

type PageRow = Pick<TaskAttachment, 'id' | 'file'>;

// A record can appear on two consecutive pages when a file lands between the
// two loads and shifts the cursor window; keep the first occurrence.
export const mergePages = <TRow extends PageRow>(
  existing: TRow[],
  next: TRow[],
): TRow[] => {
  const seen = new Set(existing.map((row) => row.id));
  const fresh = next.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
  return [...existing, ...fresh];
};

export const isPlayable = (row: PageRow): boolean => {
  const kind = previewKindOf(row.file?.[0]?.extension, row.file?.[0]?.label);
  return kind === 'audio' || kind === 'video';
};

// Index of the next audio/video row after `fromIndex`, or null at the end.
// Never wraps: auto-advance must stop, not loop the day's calls forever.
export const nextPlayableIndex = (
  rows: PageRow[],
  fromIndex: number,
): number | null => {
  for (let index = fromIndex + 1; index < rows.length; index += 1) {
    if (isPlayable(rows[index])) return index;
  }
  return null;
};
