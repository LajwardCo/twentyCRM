import { useEffect, useMemo, useRef, useState } from 'react';

import { removeViaPublicToken, uploadViaPublicToken } from '../api/attachments';
import { parseUploadTokenFromHash } from '../lib/publicUpload';
import { toPersianDigits } from '../lib/jalali';
import { IconCheck, IconMic, IconTrash, IconX } from '../components/icons';

// Standalone, login-free page opened by scanning the QR on a task. It has NO
// access to the CRM — the only capability it holds is the upload token in the
// URL fragment, which can only attach files to one task for a short window.

type UploadItem = {
  id: string;
  name: string;
  sizeBytes: number;
  // Object URL for images so the sender can see what they actually sent;
  // null for documents, which get a file-type chip instead.
  previewUrl: string | null;
  status: 'uploading' | 'done' | 'error' | 'removing';
  attachmentId: string | null;
  error?: string;
};

const pageStyle: React.CSSProperties = {
  minHeight: '100dvh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '24px 18px calc(24px + var(--safe-bottom))',
  gap: 18,
};

let itemSeq = 0;

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return toPersianDigits(`${bytes} B`);
  if (bytes < 1024 * 1024) return toPersianDigits(`${Math.round(bytes / 1024)} KB`);
  return toPersianDigits(`${(bytes / (1024 * 1024)).toFixed(1)} MB`);
};

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toUpperCase() : 'FILE';
};

export const PublicUploadView = () => {
  const token = useMemo(
    () => parseUploadTokenFromHash(window.location.hash),
    [],
  );
  const [items, setItems] = useState<UploadItem[]>([]);
  const [taskLabel, setTaskLabel] = useState<string | null>(null);
  const [tokenRejected, setTokenRejected] = useState(false);

  // Object URLs outlive the render that created them, so they are revoked on
  // unmount rather than per-render.
  const objectUrlsRef = useRef<string[]>([]);
  useEffect(
    () => () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  const onPick = async (fileList: FileList | null) => {
    if (fileList === null || token === null) return;
    const files = Array.from(fileList);

    for (const file of files) {
      const id = `f${itemSeq++}`;
      let previewUrl: string | null = null;
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file);
        objectUrlsRef.current.push(previewUrl);
      }

      setItems((prev) => [
        ...prev,
        {
          id,
          name: file.name,
          sizeBytes: file.size,
          previewUrl,
          status: 'uploading',
          attachmentId: null,
        },
      ]);

      try {
        const { taskLabel: label, attachmentId } = await uploadViaPublicToken(
          file,
          token,
        );
        if (label) setTaskLabel(label);
        setItems((prev) =>
          prev.map((it) =>
            it.id === id ? { ...it, status: 'done', attachmentId } : it,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'آپلود ناموفق بود';
        // A token problem invalidates the whole page, not just this file.
        if (/منقضی|نامعتبر|expired|invalid|token/i.test(message)) {
          setTokenRejected(true);
        }
        setItems((prev) =>
          prev.map((it) =>
            it.id === id ? { ...it, status: 'error', error: message } : it,
          ),
        );
      }
    }
  };

  const onRemove = async (item: UploadItem) => {
    // A failed upload never reached the server — drop it from the list only.
    if (item.status === 'error' || item.attachmentId === null) {
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      return;
    }
    if (token === null) return;

    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, status: 'removing' } : it)),
    );
    try {
      await removeViaPublicToken(item.attachmentId, token);
      setItems((prev) => prev.filter((it) => it.id !== item.id));
    } catch (err) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? {
                ...it,
                status: 'done',
                error: err instanceof Error ? err.message : 'حذف ناموفق بود',
              }
            : it,
        ),
      );
    }
  };

  const doneCount = items.filter((it) => it.status === 'done').length;

  if (token === null || tokenRejected) {
    return (
      <div style={pageStyle} dir="rtl">
        <div className="card" style={{ maxWidth: 420, textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>⏱</div>
          <h2 style={{ marginBottom: 8 }}>لینک آپلود معتبر نیست</h2>
          <p className="muted" style={{ lineHeight: 2 }}>
            {token === null
              ? 'این صفحه باید از طریق اسکن کد QR روی یک وظیفه باز شود.'
              : 'مهلت این کد به پایان رسیده است. لطفاً از فروشندهٔ مربوطه بخواهید کد تازه‌ای بسازد و دوباره اسکن کنید.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle} dir="rtl">
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>ارسال فایل</div>
        {taskLabel !== null ? (
          <div className="muted" style={{ marginTop: 4 }}>
            برای: {taskLabel}
          </div>
        ) : (
          <div className="muted" style={{ marginTop: 4 }}>
            فایل‌ها مستقیم به وظیفهٔ مربوطه پیوست می‌شوند
          </div>
        )}
      </div>

      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 480,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          padding: 20,
        }}
      >
        <label
          className="btn primary"
          style={{
            cursor: 'pointer',
            justifyContent: 'center',
            padding: '14px 16px',
            fontSize: 16,
          }}
        >
          <IconMic size={18} />
          انتخاب یا گرفتن عکس / فایل
          <input
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => void onPick(e.target.files)}
          />
        </label>

        {items.length > 0 && (
          <div className="pub-uploads">
            {items.map((it) => (
              <div key={it.id} className="pub-upload-row">
                <div className="pub-upload-thumb">
                  {it.previewUrl !== null ? (
                    <img src={it.previewUrl} alt={it.name} />
                  ) : (
                    <span className="pub-upload-ext">
                      {extensionOf(it.name)}
                    </span>
                  )}
                  {(it.status === 'uploading' || it.status === 'removing') && (
                    <span className="pub-upload-veil">…</span>
                  )}
                </div>

                <div className="pub-upload-meta">
                  <span className="pub-upload-name">{it.name}</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {it.status === 'uploading' && 'در حال آپلود…'}
                    {it.status === 'removing' && 'در حال حذف…'}
                    {it.status === 'done' && (
                      <>
                        <IconCheck size={13} /> ارسال شد ·{' '}
                        {formatSize(it.sizeBytes)}
                      </>
                    )}
                    {it.status === 'error' && (
                      <span style={{ color: 'var(--danger, #c0392b)' }}>
                        <IconX size={13} /> {it.error}
                      </span>
                    )}
                  </span>
                </div>

                <button
                  type="button"
                  className="btn ghost sm"
                  aria-label={`حذف ${it.name}`}
                  title="حذف"
                  disabled={it.status === 'uploading' || it.status === 'removing'}
                  onClick={() => void onRemove(it)}
                >
                  <IconTrash size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        {doneCount > 0 && (
          <div
            className="pill on"
            style={{
              alignSelf: 'center',
              background: 'var(--ok-bg, #e8f7ee)',
            }}
          >
            {toPersianDigits(doneCount)} فایل با موفقیت ارسال شد ✓
          </div>
        )}
      </div>

      <p className="muted" style={{ fontSize: 12, textAlign: 'center', maxWidth: 360, lineHeight: 2 }}>
        این صفحه فقط برای ارسال فایل است و به هیچ اطلاعات دیگری دسترسی ندارد.
      </p>
    </div>
  );
};
