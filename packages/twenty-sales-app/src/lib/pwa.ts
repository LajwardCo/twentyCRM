import { useEffect, useState } from 'react';

// Install + service-worker plumbing for the installable (PWA) build.
//
// Chrome/Edge/Android fire `beforeinstallprompt` and let us trigger the native
// install sheet. iOS Safari has no such event — installing is "Share → Add to
// Home Screen" — so there we detect the browser and show instructions instead.

export type InstallState =
  | { kind: 'unavailable' }
  | { kind: 'installed' }
  | { kind: 'prompt' }
  | { kind: 'ios-instructions' };

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

const DISMISS_KEY = 'salesAppInstallDismissedAt';
// Once dismissed, stay quiet for a week rather than nagging every launch.
const DISMISS_QUIET_MS = 7 * 24 * 60 * 60 * 1000;

export const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: minimal-ui)').matches ||
  // iOS Safari's non-standard flag, the only signal there
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const isIosSafari = (): boolean => {
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as desktop Mac but is the only Mac with touch
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIos && isSafari;
};

export const dismissInstallPrompt = () => {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // private mode — the banner simply reappears next launch
  }
  emit();
};

const isRecentlyDismissed = (): boolean => {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (raw === null) return false;
    return Date.now() - Number(raw) < DISMISS_QUIET_MS;
  } catch {
    return false;
  }
};

const computeState = (): InstallState => {
  if (isStandalone()) return { kind: 'installed' };
  if (isRecentlyDismissed()) return { kind: 'unavailable' };
  if (deferredPrompt !== null) return { kind: 'prompt' };
  if (isIosSafari()) return { kind: 'ios-instructions' };
  return { kind: 'unavailable' };
};

export const useInstallState = (): InstallState => {
  const [state, setState] = useState<InstallState>(computeState);

  useEffect(() => {
    const onChange = () => setState(computeState());
    listeners.add(onChange);

    const onBeforeInstallPrompt = (event: Event) => {
      // Suppress the mini-infobar so the banner is ours to place.
      event.preventDefault();
      deferredPrompt = event as BeforeInstallPromptEvent;
      onChange();
    };
    const onInstalled = () => {
      deferredPrompt = null;
      onChange();
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    onChange();

    return () => {
      listeners.delete(onChange);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return state;
};

// Returns true when the user accepted the native install sheet.
export const promptInstall = async (): Promise<boolean> => {
  if (deferredPrompt === null) return false;
  const event = deferredPrompt;
  // The event can only be used once, whatever the outcome.
  deferredPrompt = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  emit();
  return outcome === 'accepted';
};

// ---------- service worker ----------

const updateListeners = new Set<() => void>();
let waitingWorker: ServiceWorker | null = null;

export const onUpdateAvailable = (fn: () => void) => {
  updateListeners.add(fn);
  return () => {
    updateListeners.delete(fn);
  };
};

export const applyUpdate = () => {
  waitingWorker?.postMessage('SKIP_WAITING');
};

export const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return;
  // The dev server has no built shell to cache, and a stale SW there hides
  // HMR updates behind the cache.
  if (!import.meta.env.PROD) return;

  // Derived from Vite's base rather than hardcoded: the SW's scope must match
  // wherever the app is actually mounted, or registration is rejected.
  const base = import.meta.env.BASE_URL;

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .then((registration) => {
        const track = (worker: ServiceWorker | null) => {
          if (worker === null) return;
          worker.addEventListener('statechange', () => {
            // "installed" while another SW controls the page means an update
            // is sitting in the wings.
            if (
              worker.state === 'installed' &&
              navigator.serviceWorker.controller !== null
            ) {
              waitingWorker = worker;
              updateListeners.forEach((fn) => fn());
            }
          });
        };

        if (registration.waiting !== null) {
          waitingWorker = registration.waiting;
          updateListeners.forEach((fn) => fn());
        }
        registration.addEventListener('updatefound', () =>
          track(registration.installing),
        );
      })
      .catch(() => {
        // No SW means no offline shell — the app still works online.
      });
  });

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
};
