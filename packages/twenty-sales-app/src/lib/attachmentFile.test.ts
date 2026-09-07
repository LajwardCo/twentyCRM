import { describe, expect, it } from 'vitest';

import {
  attachmentDownloadUrl,
  attachmentKind,
  attachmentLabel,
} from './attachmentFile';

const att = (file: unknown, name: string | null = null) =>
  ({ id: 'a1', name, createdAt: '', file } as never);

describe('attachmentDownloadUrl', () => {
  it('returns the signed url the server minted', () => {
    expect(
      attachmentDownloadUrl(
        att([{ fileId: 'f1', label: 'x.mp3', extension: 'mp3', url: 'https://crm.test/file/x?token=t' }]),
      ),
    ).toBe('https://crm.test/file/x?token=t');
  });

  it('makes a server-relative url absolute against the current origin', () => {
    expect(
      attachmentDownloadUrl(
        att([{ fileId: 'f1', label: null, extension: null, url: '/file/x?token=t' }]),
        'https://crm.test',
      ),
    ).toBe('https://crm.test/file/x?token=t');
  });

  it('is null when the server returned no url, so the UI can stay unclickable', () => {
    expect(attachmentDownloadUrl(att([{ fileId: 'f1', label: 'x', extension: null, url: null }]))).toBeNull();
    expect(attachmentDownloadUrl(att([]))).toBeNull();
    expect(attachmentDownloadUrl(att(null))).toBeNull();
  });

  it('rejects a non-http scheme rather than rendering a javascript: link', () => {
    expect(
      attachmentDownloadUrl(att([{ fileId: 'f1', label: 'x', extension: null, url: 'javascript:alert(1)' }])),
    ).toBeNull();
  });
});

describe('attachmentLabel', () => {
  it('prefers the attachment name, then the file label', () => {
    expect(attachmentLabel(att([{ fileId: 'f', label: 'lbl.pdf', extension: 'pdf', url: null }], 'Name.pdf'))).toBe('Name.pdf');
    expect(attachmentLabel(att([{ fileId: 'f', label: 'lbl.pdf', extension: 'pdf', url: null }]))).toBe('lbl.pdf');
  });

  it('falls back to a generic label when nothing is named', () => {
    expect(attachmentLabel(att(null))).toBe('فایل');
    expect(attachmentLabel(att([{ fileId: 'f', label: '  ', extension: null, url: null }]))).toBe('فایل');
  });
});

describe('attachmentKind', () => {
  it('classifies by extension, case-insensitively and with a leading dot tolerated', () => {
    expect(attachmentKind('MP3')).toBe('audio');
    expect(attachmentKind('.m4a')).toBe('audio');
    expect(attachmentKind('jpeg')).toBe('image');
    expect(attachmentKind('pdf')).toBe('pdf');
    expect(attachmentKind('docx')).toBe('doc');
    expect(attachmentKind('xlsx')).toBe('sheet');
    expect(attachmentKind('zip')).toBe('file');
    expect(attachmentKind(null)).toBe('file');
  });

  it('falls back to the label extension when the field carries none', () => {
    expect(attachmentKind(null, 'recording.ogg')).toBe('audio');
    expect(attachmentKind('', 'scan.PNG')).toBe('image');
  });
});
