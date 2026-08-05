import { useEffect, useState } from 'react';

import {
  applyUpdate,
  dismissInstallPrompt,
  onUpdateAvailable,
  promptInstall,
  useInstallState,
} from '../lib/pwa';
import { IconPlus, IconRefresh, IconX } from './icons';

// Two small, non-blocking bars pinned above the mobile nav:
//   - "install this app" (native sheet on Chrome/Android, instructions on iOS)
//   - "a new version is ready" once the service worker has one waiting
export const InstallPrompt = () => {
  const state = useInstallState();
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => onUpdateAvailable(() => setUpdateReady(true)), []);

  if (updateReady) {
    return (
      <div className="install-bar" role="status">
        <IconRefresh size={16} />
        <span>نسخهٔ تازه‌ای آماده است</span>
        <button className="btn gold sm" onClick={() => applyUpdate()}>
          بروزرسانی
        </button>
        <button
          className="btn ghost sm"
          aria-label="بستن"
          onClick={() => setUpdateReady(false)}
        >
          <IconX size={14} />
        </button>
      </div>
    );
  }

  if (state.kind === 'installed' || state.kind === 'unavailable') return null;

  if (state.kind === 'ios-instructions') {
    return (
      <div className="install-bar" role="dialog" aria-label="نصب اپلیکیشن">
        {showIosHelp ? (
          <span style={{ lineHeight: 1.9 }}>
            دکمهٔ «هم‌رسانی» <span aria-hidden>⬆️</span> در پایین سافاری را بزنید،
            سپس «Add to Home Screen» را انتخاب کنید.
          </span>
        ) : (
          <span>این اپ را روی صفحهٔ اصلی موبایل نصب کنید</span>
        )}
        {!showIosHelp && (
          <button className="btn gold sm" onClick={() => setShowIosHelp(true)}>
            چطور؟
          </button>
        )}
        <button
          className="btn ghost sm"
          aria-label="بستن"
          onClick={dismissInstallPrompt}
        >
          <IconX size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="install-bar" role="dialog" aria-label="نصب اپلیکیشن">
      <IconPlus size={16} />
      <span>نصب اپلیکیشن روی این دستگاه</span>
      <button className="btn gold sm" onClick={() => void promptInstall()}>
        نصب
      </button>
      <button
        className="btn ghost sm"
        aria-label="بستن"
        onClick={dismissInstallPrompt}
      >
        <IconX size={14} />
      </button>
    </div>
  );
};
