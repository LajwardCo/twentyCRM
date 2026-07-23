import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchTaskAttachments,
  generateTaskUploadToken,
  uploadTaskAttachment,
  type TaskAttachment,
} from '../api/attachments';
import { buildPublicUploadUrl, secondsUntil } from '../lib/publicUpload';
import { renderQrDataUrl } from '../lib/qr';
import { toPersianDigits } from '../lib/jalali';
import { IconMic, IconRefresh, IconX } from './icons';

type AttachmentUploadModalProps = {
  taskId: string;
  opportunityId?: string | null;
  onUploaded: () => void | Promise<void>;
  onClose: () => void;
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(8, 23, 55, 0.55)',
  zIndex: 60,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  animation: 'fade-in .2s both',
};

const sheetStyle: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: '18px 18px 0 0',
  width: '100%',
  maxWidth: 560,
  maxHeight: '88dvh',
  overflowY: 'auto',
  padding: '18px 18px calc(18px + var(--safe-bottom))',
  animation: 'rise-in .3s both',
};

const formatCountdown = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return toPersianDigits(
    `${minutes}:${seconds.toString().padStart(2, '0')}`,
  );
};

type Tab = 'device' | 'mobile';

export const AttachmentUploadModal = ({
  taskId,
  opportunityId,
  onUploaded,
  onClose,
}: AttachmentUploadModalProps) => {
  const [tab, setTab] = useState<Tab>('device');

  // --- device upload ---
  const [uploading, setUploading] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const onDeviceUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setDeviceError(null);
    try {
      await uploadTaskAttachment({ file, taskId, opportunityId });
      await onUploaded();
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : 'آپلود ناموفق بود');
    } finally {
      setUploading(false);
    }
  };

  // --- QR / mobile upload ---
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const makeToken = useCallback(async () => {
    setQrLoading(true);
    setQrError(null);
    setQrDataUrl(null);
    try {
      const { token, expiresAt: exp } = await generateTaskUploadToken(taskId);
      const url = buildPublicUploadUrl(window.location.origin, token);
      const dataUrl = await renderQrDataUrl(url);
      setQrDataUrl(dataUrl);
      setExpiresAt(exp);
      setSecondsLeft(secondsUntil(exp, Date.now()));
    } catch (err) {
      setQrError(err instanceof Error ? err.message : 'ساخت کد ناموفق بود');
    } finally {
      setQrLoading(false);
    }
  }, [taskId]);

  // mint the token the first time the mobile tab is opened
  useEffect(() => {
    if (tab === 'mobile' && qrDataUrl === null && !qrLoading && qrError === null) {
      void makeToken();
    }
  }, [tab, qrDataUrl, qrLoading, qrError, makeToken]);

  // live countdown
  useEffect(() => {
    if (expiresAt === null) return;
    const id = window.setInterval(() => {
      setSecondsLeft(secondsUntil(expiresAt, Date.now()));
    }, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  const expired = expiresAt !== null && secondsLeft === 0;

  // poll for files arriving from the phone while the mobile tab is open
  const [arrivedCount, setArrivedCount] = useState<number | null>(null);
  const baselineRef = useRef<number | null>(null);
  useEffect(() => {
    if (tab !== 'mobile') return;
    let stopped = false;
    const poll = async () => {
      try {
        const list: TaskAttachment[] = await fetchTaskAttachments(taskId);
        if (stopped) return;
        if (baselineRef.current === null) {
          baselineRef.current = list.length;
          setArrivedCount(0);
        } else {
          const delta = list.length - baselineRef.current;
          if (delta > 0) {
            setArrivedCount(delta);
            void onUploaded();
          }
        }
      } catch {
        // transient poll failure is non-fatal
      }
    };
    void poll();
    const id = window.setInterval(poll, 4000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [tab, taskId, onUploaded]);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={sheetStyle} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <strong style={{ fontSize: 16 }}>افزودن فایل</strong>
          <button className="btn ghost sm" onClick={onClose} aria-label="بستن">
            <IconX size={16} />
          </button>
        </div>

        <div className="temp-seg" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className={tab === 'device' ? 'on' : ''}
            onClick={() => setTab('device')}
          >
            آپلود از این دستگاه
          </button>
          <button
            type="button"
            className={tab === 'mobile' ? 'on' : ''}
            onClick={() => setTab('mobile')}
          >
            اسکن با موبایل
          </button>
        </div>

        {tab === 'device' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.9 }}>
              فایل، عکس یا سند را از همین دستگاه انتخاب کنید.
            </p>
            <label
              className="btn primary"
              style={{ cursor: 'pointer', justifyContent: 'center' }}
            >
              <IconMic size={16} />
              {uploading ? 'در حال آپلود…' : 'انتخاب فایل'}
              <input
                type="file"
                style={{ display: 'none' }}
                onChange={(e) => onDeviceUpload(e.target.files?.[0])}
                disabled={uploading}
              />
            </label>
            {deviceError !== null && (
              <div className="error-banner">{deviceError}</div>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              textAlign: 'center',
            }}
          >
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.9 }}>
              با دوربین موبایل این کد را اسکن کنید تا صفحهٔ آپلود باز شود و
              بتوانید مستقیم از موبایل فایل بفرستید.
            </p>

            <div
              style={{
                width: 260,
                height: 260,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#fff',
                borderRadius: 14,
                border: '1px solid var(--line)',
                position: 'relative',
              }}
            >
              {qrLoading && <span className="muted">در حال ساخت کد…</span>}
              {qrError !== null && (
                <span className="error" style={{ padding: 12 }}>
                  {qrError}
                </span>
              )}
              {qrDataUrl !== null && (
                <>
                  <img
                    src={qrDataUrl}
                    alt="کد QR آپلود"
                    width={260}
                    height={260}
                    style={{ opacity: expired ? 0.2 : 1 }}
                  />
                  {expired && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--danger, #c0392b)',
                        fontWeight: 600,
                      }}
                    >
                      کد منقضی شد
                    </div>
                  )}
                </>
              )}
            </div>

            {expiresAt !== null && !expired && (
              <div className="pill stage" style={{ fontVariantNumeric: 'tabular-nums' }}>
                اعتبار کد تا {formatCountdown(secondsLeft)}
              </div>
            )}

            <button
              className="btn line sm"
              onClick={() => void makeToken()}
              disabled={qrLoading}
            >
              <IconRefresh size={15} />
              کد تازه
            </button>

            {arrivedCount !== null && arrivedCount > 0 && (
              <div className="pill on" style={{ background: 'var(--ok-bg, #e8f7ee)' }}>
                {toPersianDigits(arrivedCount)} فایل از موبایل دریافت شد ✓
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
