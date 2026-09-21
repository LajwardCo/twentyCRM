import { describe, expect, it } from 'vitest';

import { mergePages, nextPlayableIndex } from './filesPage';

const row = (id: string, extension: string) => ({
  id,
  name: `${id}.${extension}`,
  createdAt: '2026-09-01T00:00:00.000Z',
  file: [{ fileId: id, label: `${id}.${extension}`, extension, url: null }],
});

describe('mergePages', () => {
  it('appends the next page after the loaded rows', () => {
    const merged = mergePages([row('a', 'ogg')], [row('b', 'pdf')]);
    expect(merged.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('drops a row that already arrived, keeping its first position', () => {
    // A file uploaded between two page loads shifts the cursor window, so the
    // same record can come back twice.
    const merged = mergePages(
      [row('a', 'ogg'), row('b', 'pdf')],
      [row('b', 'pdf'), row('c', 'mp3')],
    );
    expect(merged.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('nextPlayableIndex', () => {
  const rows = [
    row('a', 'ogg'),
    row('b', 'pdf'),
    row('c', 'mp4'),
    row('d', 'png'),
  ];

  it('skips rows that are not audio or video', () => {
    expect(nextPlayableIndex(rows, 0)).toBe(2);
  });

  it('returns null after the last playable row rather than wrapping', () => {
    expect(nextPlayableIndex(rows, 2)).toBeNull();
  });

  it('starts from the first row when asked with -1', () => {
    expect(nextPlayableIndex(rows, -1)).toBe(0);
  });
});
