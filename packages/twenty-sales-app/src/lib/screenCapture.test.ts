import { describe, expect, it } from 'vitest';

import {
  classifyCaptureKey,
  classifyCopyVolume,
  correlatesWithCapture,
  describeDevice,
  isPrintShortcut,
} from './screenCapture';

const key = (over: Partial<Parameters<typeof classifyCaptureKey>[0]>) => ({
  key: 'a',
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...over,
});

describe('classifyCaptureKey', () => {
  it('trusts the PrintScreen key', () => {
    expect(classifyCaptureKey(key({ key: 'PrintScreen' }))).toMatchObject({
      method: 'print-screen-key',
      confidence: 'high',
    });
    expect(classifyCaptureKey(key({ key: 'Unidentified', code: 'PrintScreen' })))
      .toMatchObject({ confidence: 'high' });
  });

  it('trusts the Windows snipping shortcut', () => {
    expect(classifyCaptureKey(key({ key: 'S', metaKey: true, shiftKey: true })))
      .toMatchObject({ method: 'win-shift-s', confidence: 'high' });
  });

  it('records macOS capture shortcuts at lower confidence', () => {
    for (const digit of ['3', '4', '5']) {
      expect(classifyCaptureKey(key({ key: digit, metaKey: true, shiftKey: true })))
        .toMatchObject({ method: `cmd-shift-${digit}`, confidence: 'medium' });
    }
  });

  it('ignores ordinary typing and near-miss combos', () => {
    expect(classifyCaptureKey(key({ key: 's' }))).toBeNull();
    expect(classifyCaptureKey(key({ key: '3', metaKey: true }))).toBeNull();
    expect(classifyCaptureKey(key({ key: '4', shiftKey: true }))).toBeNull();
    expect(classifyCaptureKey(key({ key: 'k', metaKey: true }))).toBeNull();
  });
});

describe('isPrintShortcut', () => {
  it('catches Cmd/Ctrl+P', () => {
    expect(isPrintShortcut(key({ key: 'p', metaKey: true }))).toBe(true);
    expect(isPrintShortcut(key({ key: 'P', ctrlKey: true }))).toBe(true);
  });

  it('is not confused by Cmd+Shift+P', () => {
    expect(isPrintShortcut(key({ key: 'p', metaKey: true, shiftKey: true }))).toBe(false);
    expect(isPrintShortcut(key({ key: 'p' }))).toBe(false);
  });
});

describe('correlatesWithCapture', () => {
  it('links a hide that follows a capture keypress', () => {
    expect(correlatesWithCapture(1000, 2000)).toBe(true);
  });

  it('does not link an unrelated tab switch', () => {
    expect(correlatesWithCapture(1000, 9000)).toBe(false);
    expect(correlatesWithCapture(null, 1000)).toBe(false);
    expect(correlatesWithCapture(5000, 1000)).toBe(false);
  });
});

describe('classifyCopyVolume', () => {
  it('separates a phone number from a whole list', () => {
    expect(classifyCopyVolume(12).severity).toBe('notice');
    expect(classifyCopyVolume(500).severity).toBe('sensitive');
    expect(classifyCopyVolume(50000)).toEqual({ severity: 'critical', bucket: 'bulk' });
  });
});

describe('describeDevice', () => {
  it('summarizes the browser, OS and screen', () => {
    expect(
      describeDevice(
        { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/605.1' },
        { width: 390, height: 844 },
      ),
    ).toBe('Safari/iOS 390x844');
  });

  it('degrades instead of throwing on an unknown agent', () => {
    expect(describeDevice({}, {})).toBe('unknown/unknown ?');
  });
});
