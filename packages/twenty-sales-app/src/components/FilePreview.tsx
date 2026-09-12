import { useEffect, useRef, useState } from 'react';

import { TFILES } from '../lib/fileStrings';
import {
  isUnplayableOnThisBrowser,
  type PreviewKind,
} from '../lib/fileType';

type FilePreviewProps = {
  // Signed URL from the query that rendered this preview. It expires, so the
  // caller passes a fresh one on every render and never stores it.
  url: string | null;
  kind: PreviewKind;
  label: string;
  extension: string | null;
  autoPlay?: boolean;
  onEnded?: () => void;
  // Fired once when the media element fails to load, so the owner can refetch
  // the record (and with it a new signed URL) and try again.
  onError?: () => void;
  compact?: boolean;
};

// One media element for whatever the browser can show: the same component
// sits behind the chip viewer, the list's inline player and the detail page.
export const FilePreview = ({
  url,
  kind,
  label,
  extension,
  autoPlay = false,
  onEnded,
  onError,
  compact = false,
}: FilePreviewProps) => {
  const [failed, setFailed] = useState(false);
  const mediaRef = useRef<HTMLMediaElement | null>(null);

  // A new URL (after a refetch) gets a clean slate.
  useEffect(() => {
    setFailed(false);
  }, [url]);

  // Autoplay after a user gesture on the play button is allowed; call it from
  // an effect so it also fires when the same element is reused for the next
  // row rather than remounted.
  useEffect(() => {
    if (!autoPlay || url === null) return;
    const media = mediaRef.current;
    if (media === null) return;
    media.play().catch(() => {
      // The browser refused (no gesture yet); the controls are still there.
    });
  }, [autoPlay, url]);

  const unplayable = isUnplayableOnThisBrowser(kind, extension);
  const downloadLink =
    url !== null ? (
      <a className="btn line sm" href={url} download={label} rel="noreferrer noopener">
        ⬇ {TFILES.download}
      </a>
    ) : null;

  if (url === null) {
    return (
      <div className={`file-preview none${compact ? ' compact' : ''}`}>
        <span className="muted">{TFILES.fileUnavailable}</span>
      </div>
    );
  }

  if (failed) {
    return (
      <div className={`file-preview none${compact ? ' compact' : ''}`}>
        <span className="muted">{TFILES.fileUnavailable}</span>
        {downloadLink}
      </div>
    );
  }

  const fail = () => {
    setFailed(true);
    onError?.();
  };

  if (kind === 'audio' || kind === 'video') {
    const shared = {
      ref: (node: HTMLMediaElement | null) => {
        mediaRef.current = node;
      },
      src: url,
      controls: true,
      preload: 'metadata' as const,
      onEnded,
      onError: fail,
    };
    return (
      <div className={`file-preview ${kind}${compact ? ' compact' : ''}`}>
        {kind === 'audio' ? (
          <audio {...shared} />
        ) : (
          <video {...shared} playsInline />
        )}
        {unplayable && (
          <div className="file-preview-hint">
            <span>{TFILES.unplayableHere}</span>
            {downloadLink}
          </div>
        )}
      </div>
    );
  }

  if (kind === 'image') {
    return (
      <div className={`file-preview image${compact ? ' compact' : ''}`}>
        <img src={url} alt={label} onError={fail} loading="lazy" />
      </div>
    );
  }

  if (kind === 'pdf') {
    return (
      <div className={`file-preview pdf${compact ? ' compact' : ''}`}>
        <iframe src={url} title={label} />
      </div>
    );
  }

  return (
    <div className={`file-preview none${compact ? ' compact' : ''}`}>
      <span className="muted">{TFILES.noPreview}</span>
      {downloadLink}
    </div>
  );
};
