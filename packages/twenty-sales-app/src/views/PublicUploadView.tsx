import { useMemo, useState } from 'react';

import { uploadViaPublicToken } from '../api/attachments';
import { parseUploadTokenFromHash } from '../lib/publicUpload';
import { toPersianDigits } from '../lib/jalali';
import { IconCheck, IconMic, IconX } from '../components/icons';

// Standalone, login-free page opened by scanning the QR on a task. It has NO
// access to the CRM — the only capability it holds is the upload token in the
// URL fragment, which can only attach files to one task for a short window.

type UploadItem = {
  id: string;
  name: string;
  status: 'uploading' | 'done' | 'error';
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

export const PublicUploadView = () => {
  const token = useMemo(
    () => parseUploadTokenFromHash(window.location.hash),
    [],
  );
  const [items, setItems] = useState<UploadItem[]>([]);
  const [taskLabel, setTaskLabel] = useState<string | null>(null);
  const [tokenRejected, setTokenRejected] = useState(false);

  const onPick = async (fileList: FileList | null) => {
    if (fileList === null || token === null) return;
    const files = Array.from(fileList);

    for (const file of files) {
      const id = `f${itemSeq++}`;
      setItems((prev) => [
        ...prev,
        { id, name: file.name, status: 'uploading' },
      ]);
      try {
        const { taskLabel: label } = await uploadViaPublicToken(file, token);
        if (label) setTaskLabel(label);
        setItems((prev) =>
          prev.map((it) =>
            it.id === id ? { ...it, status: 'done' } : it,
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((it) => (
              <div
                key={it.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 14,
                }}
              >
                {it.status === 'uploading' && (
                  <span className="muted">در حال آپلود…</span>
                )}
                {it.status === 'done' && (
                  <span style={{ color: 'var(--ok, #1e8e4e)' }}>
                    <IconCheck size={16} />
                  </span>
                )}
                {it.status === 'error' && (
                  <span style={{ color: 'var(--danger, #c0392b)' }}>
                    <IconX size={16} />
                  </span>
                )}
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {it.name}
                </span>
                {it.status === 'error' && it.error && (
                  <span className="muted" style={{ fontSize: 12 }}>
                    — {it.error}
                  </span>
                )}
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
