import { useEffect, useState } from 'react';

import { getAttachmentMetadata } from '../api/attachments';
import { deleteFile, fetchFile, updateFile, type FileRecord } from '../api/files';
import { FilePreview } from '../components/FilePreview';
import { FileTypeSelect } from '../components/FileTypeSelect';
import { IconTrash } from '../components/icons';
import { attachmentDownloadUrl, attachmentLabel } from '../lib/attachmentFile';
import { recordScreenView } from '../lib/audit';
import { invalidateCache, useCached } from '../lib/cache';
import { TFILES } from '../lib/fileStrings';
import { fileTypeLabel, previewKindOf } from '../lib/fileType';
import { formatJalaliDateTime } from '../lib/jalali';
import { navigate } from '../lib/router';

type FileDetailViewProps = {
  fileId: string;
};

// One file, full width: play/view it, rename it, say what it is, jump to the
// task or lead it belongs to, download, or soft-delete it.
export const FileDetailView = ({ fileId }: FileDetailViewProps) => {
  const { data: schema } = useCached('attachment-metadata', () =>
    getAttachmentMetadata(),
  );
  // Wrapped so "still loading" (null) and "not found" ({ file: null }) differ.
  const { data, error, refresh } = useCached(`file:${fileId}`, async () => ({
    file: await fetchFile(fileId),
  }));
  const file: FileRecord | null = data?.file ?? null;

  const [name, setName] = useState('');
  const [fileType, setFileType] = useState('OTHER');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // One refetch for a possibly expired signed URL; a file that is really gone
  // must not turn into an endless refresh loop.
  const [urlRetried, setUrlRetried] = useState(false);

  // The form mirrors the record once it arrives (and after each refresh).
  useEffect(() => {
    if (file === null) return;
    setName(attachmentLabel(file));
    setFileType(file.fileType ?? 'OTHER');
  }, [file]);

  useEffect(() => {
    if (file !== null) recordScreenView('attachment', file.id, attachmentLabel(file));
  }, [file]);

  useEffect(() => {
    if (toast === null) return;
    const id = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const save = async (changes: { name?: string; fileType?: string }) => {
    if (file === null) return;
    setSaving(true);
    try {
      await updateFile(file.id, changes);
      invalidateCache('files:');
      await refresh();
      setToast(TFILES.saved);
    } catch (err) {
      setToast(err instanceof Error ? err.message : TFILES.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (file === null || !window.confirm(TFILES.deleteConfirm)) return;
    setSaving(true);
    try {
      await deleteFile(file.id);
      invalidateCache('files:');
      invalidateCache(`file:${file.id}`);
      navigate('/files');
    } catch (err) {
      setToast(err instanceof Error ? err.message : TFILES.deleteFailed);
      setSaving(false);
    }
  };

  if (error !== null) {
    return (
      <main className="page">
        <div className="error-banner">{error}</div>
      </main>
    );
  }

  if (data === null) {
    return (
      <main className="page">
        <div className="skeleton" style={{ height: 44, maxWidth: 420, marginBottom: 14 }} />
        <div className="skeleton" style={{ height: 220 }} />
      </main>
    );
  }

  if (file === null) {
    return (
      <main className="page">
        <div className="empty-state">{TFILES.notFound}</div>
      </main>
    );
  }

  const media = file.file?.[0] ?? null;
  const url = attachmentDownloadUrl(file);
  const label = attachmentLabel(file);
  const kind = previewKindOf(media?.extension, media?.label);
  const canEditType = schema?.hasFileType ?? false;

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1 style={{ wordBreak: 'break-all' }}>{label}</h1>
          <div className="sub">
            {file.fileType ? `${fileTypeLabel(file.fileType)} · ` : ''}
            {formatJalaliDateTime(file.createdAt)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {url !== null && (
            <a className="btn line sm" href={url} download={label} rel="noreferrer noopener">
              ⬇ {TFILES.download}
            </a>
          )}
          <button className="btn line sm" disabled={saving} onClick={() => void remove()}>
            <IconTrash size={13} />
            {TFILES.delete}
          </button>
        </div>
      </div>

      <div className="card card-pad anim d1" style={{ marginBottom: 14 }}>
        <FilePreview
          key={url ?? 'none'}
          url={url}
          kind={kind}
          label={label}
          extension={media?.extension ?? null}
          onError={() => {
            if (urlRetried) return;
            setUrlRetried(true);
            void refresh();
          }}
        />
      </div>

      <div className="card card-pad anim d2" style={{ marginBottom: 14 }}>
        <div className="f2">
          <div className="fld">
            <label htmlFor="file-name">{TFILES.name}</label>
            <input
              id="file-name"
              value={name}
              disabled={saving}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => {
                const trimmed = name.trim();
                if (trimmed !== '' && trimmed !== label) void save({ name: trimmed });
              }}
            />
          </div>
          {canEditType && (
            <div className="fld">
              <label htmlFor="file-type">{TFILES.type}</label>
              <FileTypeSelect
                id="file-type"
                value={fileType}
                disabled={saving}
                onChange={(value) => {
                  setFileType(value);
                  void save({ fileType: value });
                }}
              />
            </div>
          )}
        </div>

        <div className="file-meta">
          <div>
            <div className="k">{TFILES.format}</div>
            <div dir="ltr">{media?.extension || '—'}</div>
          </div>
          <div>
            <div className="k">{TFILES.uploadedBy}</div>
            <div>{file.createdBy?.name || '—'}</div>
          </div>
          <div>
            <div className="k">{TFILES.uploadedAt}</div>
            <div>{formatJalaliDateTime(file.createdAt)}</div>
          </div>
        </div>
      </div>

      {(file.targetTask || file.targetOpportunity) && (
        <div className="card card-pad anim d3" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {file.targetTask && (
            <button className="btn line sm" onClick={() => navigate(`/task/${file.targetTask?.id}`)}>
              {TFILES.openTask}: {file.targetTask.title || '—'}
            </button>
          )}
          {file.targetOpportunity && (
            <button
              className="btn line sm"
              onClick={() => navigate(`/lead/${file.targetOpportunity?.id}`)}
            >
              {TFILES.openLead}: {file.targetOpportunity.name || '—'}
            </button>
          )}
        </div>
      )}

      {toast !== null && <div className="toast">{toast}</div>}
    </main>
  );
};
