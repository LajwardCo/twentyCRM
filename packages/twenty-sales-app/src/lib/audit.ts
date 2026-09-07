import type { CurrentUser } from '../api/auth';
import { sendAuditRecords } from '../api/auditTrail';
import { setRequestObserver, type RequestObservation } from '../api/client';
import {
  buildAuditRecord,
  changedFieldsOf,
  classifyOperation,
  parseOperation,
  targetIdOf,
  type AuditActor,
  type AuditEventInput,
} from './auditEvent';
import { createAuditQueue, type AuditQueue } from './auditQueue';
import {
  classifyCaptureKey,
  classifyCopyVolume,
  correlatesWithCapture,
  describeDevice,
  isPrintShortcut,
} from './screenCapture';

// Wiring: turns browser and API activity into audit records and gets them to
// the server. Everything decision-shaped lives in the pure modules next door
// (auditEvent, auditQueue, screenCapture) so it can be tested; this file is
// the part that touches window, and it is written to be inert on failure --
// an audit trail that can break the app it watches would just get switched off.

const BUFFER_KEY = 'salesAppAuditBuffer';
const FLUSH_INTERVAL_MS = 12000;

let actor: AuditActor | null = null;
let queue: AuditQueue | null = null;
let installed = false;
let sessionStartedAt = 0;
let lastCaptureKeyAt: number | null = null;
const teardown: (() => void)[] = [];

// One id per tab, per load. It is what turns a list of rows back into "this
// person sat down and did these fourteen things in four minutes".
const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const device = (): string | null => {
  try {
    return describeDevice(window.navigator, window.screen);
  } catch {
    return null;
  }
};

const currentRoute = (): string => {
  try {
    // The query half can carry an upload token, so keep only the path.
    return window.location.hash.replace(/^#/, '').split('?')[0] || '/today';
  } catch {
    return '';
  }
};

const ensureQueue = (): AuditQueue => {
  if (queue !== null) return queue;
  queue = createAuditQueue({
    sink: sendAuditRecords,
    storage: {
      read: () => {
        try {
          return localStorage.getItem(BUFFER_KEY);
        } catch {
          return null;
        }
      },
      write: (value) => localStorage.setItem(BUFFER_KEY, value),
      clear: () => {
        try {
          localStorage.removeItem(BUFFER_KEY);
        } catch {
          /* nothing to clear */
        }
      },
    },
  });
  return queue;
};

// The single entry point. Safe to call before the user is known, before the
// listeners are installed, and from inside an error handler.
export const recordAudit = (input: AuditEventInput): void => {
  try {
    ensureQueue().push(
      buildAuditRecord(
        { route: currentRoute(), ...input },
        { actor, sessionId, device: device() },
      ),
    );
  } catch {
    // Never propagate: the caller is a user action, not a logging job.
  }
};

export const flushAudit = async (): Promise<void> => {
  try {
    await ensureQueue().flush();
  } catch {
    /* the queue keeps what it could not send */
  }
};

export const pendingAuditCount = (): number => {
  try {
    return ensureQueue().pending();
  } catch {
    return 0;
  }
};

// ---------------------------------------------------------------------------
// API traffic
// ---------------------------------------------------------------------------

// The audit's own writes must not audit themselves; reads of the audit trail
// very much must, because "who went through the log" is one of the events a
// log exists to capture.
const isAuditWrite = (rootField: string | null): boolean =>
  rootField !== null && /^(create|update|delete|destroy)AuditEvents?$/i.test(rootField);

const observeRequest = (observation: RequestObservation) => {
  const parsed = parseOperation(observation.query);
  if (isAuditWrite(parsed.rootField)) return;

  if (!observation.ok) {
    // A denial is a security event: it is what an account probing beyond its
    // scope looks like from the server's side.
    const denied = /permission|forbidden|denied|unauthorized/i.test(
      observation.errorMessage ?? '',
    );
    recordAudit({
      eventType: denied ? 'permission.denied' : 'api.error',
      category: denied ? 'security' : 'read',
      severity: denied ? 'critical' : 'info',
      targetType: parsed.rootField,
      detail: {
        operation: parsed.operationName,
        code: observation.errorCode,
        reason: observation.errorMessage,
      },
    });
    return;
  }

  const classified = classifyOperation(parsed);
  if (classified === null) return;

  const changed =
    classified.category === 'write'
      ? changedFieldsOf(observation.variables)
      : [];

  recordAudit({
    eventType: classified.eventType,
    category: classified.category,
    severity: classified.severity,
    targetType: classified.targetType,
    targetId: targetIdOf(observation.variables),
    detail: {
      operation: parsed.operationName,
      ...(changed.length > 0 ? { changedFields: changed } : {}),
      ...(observation.durationMs > 3000 ? { slowMs: observation.durationMs } : {}),
    },
  });
};

// ---------------------------------------------------------------------------
// Browser activity
// ---------------------------------------------------------------------------

const on = <K extends keyof WindowEventMap>(
  target: Window | Document,
  type: K | string,
  handler: (event: never) => void,
  options?: AddEventListenerOptions,
) => {
  target.addEventListener(type, handler as EventListener, options);
  teardown.push(() =>
    target.removeEventListener(type, handler as EventListener, options),
  );
};

const installListeners = () => {
  // --- navigation -----------------------------------------------------------
  on(window, 'hashchange', () => {
    recordAudit({
      eventType: 'screen.view',
      category: 'navigation',
      severity: 'info',
    });
  });

  // --- data leaving the app -------------------------------------------------
  const onCopy = (event: ClipboardEvent) => {
    const text = window.getSelection?.()?.toString() ?? '';
    const { severity, bucket } = classifyCopyVolume(text.length);
    recordAudit({
      eventType: event.type === 'cut' ? 'export.cut' : 'export.copy',
      category: 'exfiltration',
      severity,
      detail: { characters: text.length, volume: bucket },
    });
  };
  on(document, 'copy', onCopy as (e: never) => void);
  on(document, 'cut', onCopy as (e: never) => void);

  // Print is a full, high-fidelity export of the screen -- and unlike a
  // screenshot the browser actually tells us it happened.
  on(window, 'beforeprint', () => {
    recordAudit({
      eventType: 'export.print',
      category: 'exfiltration',
      severity: 'critical',
    });
  });

  // Buttons that copy a phone number or a link go through the async clipboard
  // API and never fire a `copy` event, so wrap it. The original is always
  // called, whatever the audit does.
  try {
    const clipboard = window.navigator.clipboard;
    if (clipboard && typeof clipboard.writeText === 'function') {
      const original = clipboard.writeText.bind(clipboard);
      clipboard.writeText = (text: string) => {
        const { severity, bucket } = classifyCopyVolume(text?.length ?? 0);
        recordAudit({
          eventType: 'export.clipboard',
          category: 'exfiltration',
          severity,
          detail: { characters: text?.length ?? 0, volume: bucket },
        });
        return original(text);
      };
      teardown.push(() => {
        clipboard.writeText = original;
      });
    }
  } catch {
    /* clipboard is unavailable on insecure origins; nothing to wrap */
  }

  // Downloads, file opens, and reaching a customer through an outside channel.
  on(document, 'click', (event: MouseEvent) => {
    const anchor = (event.target as HTMLElement | null)?.closest?.('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? '';
    if (anchor.hasAttribute('download') || /^blob:|\/files\//.test(href)) {
      recordAudit({
        eventType: 'file.download',
        category: 'exfiltration',
        severity: 'critical',
        targetLabel: anchor.getAttribute('download') || anchor.textContent?.slice(0, 80) || null,
        detail: { href: href.slice(0, 200) },
      });
      return;
    }
    const channel = /^tel:/.test(href)
      ? 'phone'
      : /^mailto:/.test(href)
        ? 'email'
        : /wa\.me|whatsapp/.test(href)
          ? 'whatsapp'
          : null;
    if (channel !== null) {
      recordAudit({
        eventType: 'contact.reach_out',
        category: 'exfiltration',
        severity: 'notice',
        detail: { channel },
      });
    }
  });

  // --- screen capture -------------------------------------------------------
  // See screenCapture.ts: this catches what the browser lets us catch and is
  // explicitly not a guarantee. Phone screenshots are invisible here; the
  // watermark is what covers them.
  const onCaptureKey = (event: KeyboardEvent) => {
    const signal = classifyCaptureKey(event);
    if (signal !== null) {
      lastCaptureKeyAt = Date.now();
      recordAudit({
        eventType: 'screenshot.suspected',
        category: 'security',
        severity: signal.confidence === 'high' ? 'critical' : 'sensitive',
        detail: {
          method: signal.method,
          confidence: signal.confidence,
          platform: signal.platform,
        },
      });
      return;
    }
    if (isPrintShortcut(event)) {
      recordAudit({
        eventType: 'export.print_shortcut',
        category: 'exfiltration',
        severity: 'sensitive',
      });
    }
  };
  on(window, 'keydown', onCaptureKey as (e: never) => void);
  // PrintScreen only reaches the page on keyup in most Chromium builds.
  on(window, 'keyup', onCaptureKey as (e: never) => void);

  on(document, 'visibilitychange', () => {
    const hidden = document.visibilityState === 'hidden';
    if (hidden && correlatesWithCapture(lastCaptureKeyAt, Date.now())) {
      recordAudit({
        eventType: 'screenshot.suspected',
        category: 'security',
        severity: 'sensitive',
        detail: { method: 'hide-after-capture-key', confidence: 'low' },
      });
    }
    recordAudit({
      eventType: hidden ? 'session.background' : 'session.foreground',
      category: 'navigation',
      severity: 'info',
    });
    if (hidden) void flushAudit();
  });

  // --- session end ----------------------------------------------------------
  // pagehide is the last reliable moment on mobile Safari. Anything the flush
  // does not manage is still on disk and goes out on the next load.
  on(window, 'pagehide', () => {
    recordAudit({
      eventType: 'session.end',
      category: 'auth',
      severity: 'info',
      detail: { durationSeconds: Math.round((Date.now() - sessionStartedAt) / 1000) },
    });
    void flushAudit();
  });

  const timer = window.setInterval(() => void flushAudit(), FLUSH_INTERVAL_MS);
  teardown.push(() => window.clearInterval(timer));
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export const startAudit = (user: CurrentUser): void => {
  actor = {
    workspaceMemberId: user.workspaceMemberId,
    name: `${user.firstName} ${user.lastName}`.trim() || user.userEmail,
    email: user.userEmail,
    role: user.role,
  };

  if (!installed) {
    installed = true;
    sessionStartedAt = Date.now();
    setRequestObserver(observeRequest);
    installListeners();
    recordAudit({
      eventType: 'session.start',
      category: 'auth',
      severity: 'sensitive',
      detail: { role: user.role, partner: user.partner?.name ?? null },
    });
  }

  // Anything buffered from before the user was known (a failed login, a
  // previous session that ended offline) now has a chance to go out.
  void flushAudit();
};

export const recordSignOut = (reason: 'user' | 'session-expired'): void => {
  recordAudit({
    eventType: 'auth.logout',
    category: 'auth',
    severity: 'sensitive',
    detail: { reason },
  });
  void flushAudit();
};

export const recordSignInFailure = (email: string, reason: string): void => {
  recordAudit({
    eventType: 'auth.failed',
    category: 'auth',
    severity: 'critical',
    // The attempted address, which is the part that matters when the row is
    // later attributed to whoever eventually signed in on this device.
    targetLabel: email,
    detail: { reason },
  });
  void flushAudit();
};

// Used by screens that show something worth naming explicitly -- opening one
// customer's file is a different fact from the list query behind it.
export const recordScreenView = (
  targetType: string,
  targetId: string | null,
  targetLabel: string | null,
): void => {
  recordAudit({
    eventType: 'screen.view',
    category: 'navigation',
    severity: 'notice',
    targetType,
    targetId,
    targetLabel,
  });
};

// Test seam and sign-out cleanup: drops every listener and forgets the actor.
export const stopAudit = (): void => {
  while (teardown.length > 0) teardown.pop()?.();
  setRequestObserver(null);
  installed = false;
  actor = null;
};
