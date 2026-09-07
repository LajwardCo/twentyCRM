// Screen-capture signals.
//
// Read this before trusting anything in here: **a web page cannot reliably
// detect that a screenshot was taken.** There is no browser API for it, by
// design. What we can do is three things, and this module is honest about
// which is which:
//
//   1. Catch the capture *keyboard shortcuts* that still reach the page.
//      PrintScreen and Win+Shift+S do reach Chrome/Edge/Firefox on Windows.
//      macOS grabs Cmd+Shift+3/4/5 at the system level, so those often never
//      arrive -- when one does, it is real, and when it doesn't we simply
//      never know. On iOS and Android there is *nothing*: the side-button and
//      power+volume gestures are invisible to the page. A phone screenshot of
//      a customer list will not appear in the log, and no amount of JavaScript
//      changes that.
//
//   2. Notice the weaker circumstantial signals -- the page being hidden or
//      losing focus right after a capture-shaped keypress -- and record them
//      at a lower confidence so a reviewer can weigh them instead of trusting
//      them.
//
//   3. Make captures *attributable* rather than preventable. That is the
//      watermark (see components/AuditWatermark.tsx): every screenshot of a
//      sensitive screen carries the viewer's name, email and the time. This is
//      the part that actually deters, and it works on the phones where
//      detection cannot.
//
// This module is pure so the rules above can be tested.

export type CaptureConfidence = 'high' | 'medium' | 'low';

export type CaptureSignal = {
  method: string;
  confidence: CaptureConfidence;
  platform: 'windows' | 'macos' | 'any';
};

// Minimal shape of a KeyboardEvent, so the classifier can be tested without
// a DOM and reused for both keydown and keyup.
export type CaptureKeyEvent = {
  key: string;
  code?: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
};

export const classifyCaptureKey = (
  event: CaptureKeyEvent,
): CaptureSignal | null => {
  // Windows / Linux: the dedicated key. Chromium and Firefox both deliver this
  // (usually only on keyup), which makes it the one high-confidence signal we
  // get on a desktop.
  if (event.key === 'PrintScreen' || event.code === 'PrintScreen') {
    return { method: 'print-screen-key', confidence: 'high', platform: 'windows' };
  }

  // Windows 10/11 Snipping Tool: Win+Shift+S. The Windows key surfaces as
  // metaKey in the browser.
  if (event.metaKey && event.shiftKey && event.key.toLowerCase() === 's') {
    return { method: 'win-shift-s', confidence: 'high', platform: 'windows' };
  }

  // macOS screen capture: Cmd+Shift+3/4/5. The system usually swallows these
  // before the page sees them, so absence proves nothing -- but presence is a
  // genuine capture attempt.
  if (
    event.metaKey &&
    event.shiftKey &&
    !event.ctrlKey &&
    ['3', '4', '5'].includes(event.key)
  ) {
    return {
      method: `cmd-shift-${event.key}`,
      confidence: 'medium',
      platform: 'macos',
    };
  }

  return null;
};

// Print-to-PDF is a full-fidelity export of whatever is on screen, and unlike
// a screenshot the browser *does* tell us about it.
export const isPrintShortcut = (event: CaptureKeyEvent): boolean =>
  (event.metaKey || event.ctrlKey) &&
  !event.shiftKey &&
  event.key.toLowerCase() === 'p';

// A capture keypress followed within a moment by the page being hidden is the
// shape of "screenshot, then switch away to send it". On its own the hide is
// meaningless -- people change tabs constantly -- so it only ever raises the
// confidence of a signal we already have.
export const CAPTURE_CORRELATION_MS = 2500;

export const correlatesWithCapture = (
  lastCaptureKeyAt: number | null,
  hiddenAt: number,
  windowMs: number = CAPTURE_CORRELATION_MS,
): boolean =>
  lastCaptureKeyAt !== null &&
  hiddenAt >= lastCaptureKeyAt &&
  hiddenAt - lastCaptureKeyAt <= windowMs;

// How much text left the app in one gesture. Copying a phone number is normal
// work; copying the whole list is the thing worth a reviewer's morning.
export const classifyCopyVolume = (
  length: number,
): { severity: 'notice' | 'sensitive' | 'critical'; bucket: string } => {
  if (length >= 2000) return { severity: 'critical', bucket: 'bulk' };
  if (length >= 200) return { severity: 'sensitive', bucket: 'large' };
  return { severity: 'notice', bucket: 'small' };
};

export const describeDevice = (
  navigatorLike: { userAgent?: string; platform?: string; language?: string },
  screenLike: { width?: number; height?: number },
): string => {
  const ua = navigatorLike.userAgent ?? '';
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'unknown';
  const os =
    /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'unknown';
  const size =
    screenLike.width && screenLike.height
      ? `${screenLike.width}x${screenLike.height}`
      : '?';
  return `${browser}/${os} ${size}`;
};
