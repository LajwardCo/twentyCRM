import { describe, expect, it } from 'vitest';

import {
  FILE_TYPE_OPTIONS,
  defaultFileTypeFor,
  fileTypeLabel,
  isUnplayableOnThisBrowser,
  previewKindOf,
} from './fileType';

describe('previewKindOf', () => {
  it('maps browser-playable audio extensions to audio', () => {
    expect(previewKindOf('ogg')).toBe('audio');
    expect(previewKindOf('OPUS')).toBe('audio');
    expect(previewKindOf('.m4a')).toBe('audio');
    expect(previewKindOf('mp3')).toBe('audio');
  });

  it('maps video, image and pdf', () => {
    expect(previewKindOf('mp4')).toBe('video');
    expect(previewKindOf('png')).toBe('image');
    expect(previewKindOf('pdf')).toBe('pdf');
  });

  it('is none for formats no browser decodes or unknown ones', () => {
    expect(previewKindOf('amr')).toBe('none');
    expect(previewKindOf('heic')).toBe('none');
    expect(previewKindOf('docx')).toBe('none');
    expect(previewKindOf(null, null)).toBe('none');
  });

  it('falls back to the label extension when the field is empty', () => {
    expect(previewKindOf(null, 'call-2026.ogg')).toBe('audio');
    expect(previewKindOf('', 'photo.JPG')).toBe('image');
  });
});

describe('file type options', () => {
  it('lists the eight types in spec order', () => {
    expect(FILE_TYPE_OPTIONS.map((option) => option.value)).toEqual([
      'CALL_RECORDING',
      'VOICE_NOTE',
      'MEETING_RECORDING',
      'PHOTO',
      'DOCUMENT',
      'CONTRACT',
      'QUOTE',
      'OTHER',
    ]);
  });

  it('labels a known type in Persian and unknown/empty as other', () => {
    expect(fileTypeLabel('CALL_RECORDING')).toBe('ضبط تماس');
    expect(fileTypeLabel('SOMETHING_ELSE')).toBe('دیگر');
    expect(fileTypeLabel(null)).toBe('دیگر');
  });
});

describe('defaultFileTypeFor', () => {
  it('guesses the type from what the file is', () => {
    expect(defaultFileTypeFor('audio')).toBe('CALL_RECORDING');
    expect(defaultFileTypeFor('video')).toBe('MEETING_RECORDING');
    expect(defaultFileTypeFor('image')).toBe('PHOTO');
    expect(defaultFileTypeFor('pdf')).toBe('DOCUMENT');
    expect(defaultFileTypeFor('none')).toBe('DOCUMENT');
  });
});

describe('isUnplayableOnThisBrowser', () => {
  const SAFARI =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const CHROME_IOS =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1';
  const CHROME =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

  it('flags ogg/opus on Safari, which cannot decode them', () => {
    expect(isUnplayableOnThisBrowser('audio', 'ogg', SAFARI)).toBe(true);
    expect(isUnplayableOnThisBrowser('audio', 'opus', SAFARI)).toBe(true);
  });

  it('does not flag Chrome, including Chrome on iOS', () => {
    expect(isUnplayableOnThisBrowser('audio', 'ogg', CHROME)).toBe(false);
    expect(isUnplayableOnThisBrowser('audio', 'ogg', CHROME_IOS)).toBe(false);
  });

  it('never flags universally supported formats', () => {
    expect(isUnplayableOnThisBrowser('audio', 'mp3', SAFARI)).toBe(false);
    expect(isUnplayableOnThisBrowser('image', 'png', SAFARI)).toBe(false);
  });
});
