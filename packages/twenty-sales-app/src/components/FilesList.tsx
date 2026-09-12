import { type ReactNode } from 'react';

import { type FileRecord } from '../api/files';
import { attachmentLabel } from '../lib/attachmentFile';
import { TFILES } from '../lib/fileStrings';
import { fileTypeLabel, previewKindOf, type PreviewKind } from '../lib/fileType';
import { isPlayable } from '../lib/filesPage';
import { formatJalaliDateTime } from '../lib/jalali';
import { navigate } from '../lib/router';

const KIND_ICONS: Record<PreviewKind, string> = {
  audio: '🎙',
  video: '🎬',
  image: '🖼',
  pdf: '📄',
  none: '📎',
};

export const fileKindOf = (file: FileRecord): PreviewKind =>
  previewKindOf(file.file?.[0]?.extension, file.file?.[0]?.label);

type FilesListProps = {
  rows: FileRecord[];
  activeIndex: number | null;
  // The player for the active row; the list only decides where it goes.
  player: ReactNode;
  onToggle: (index: number) => void;
  onOpen: (file: FileRecord) => void;
};

const PlayButton = ({
  file,
  active,
  onToggle,
  onOpen,
}: {
  file: FileRecord;
  active: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) => {
  const playable = isPlayable(file);
  const label = playable ? (active ? TFILES.stop : TFILES.play) : TFILES.open;
  return (
    <button
      type="button"
      className={`file-play${active ? ' on' : ''}`}
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        if (playable) onToggle();
        else onOpen();
      }}
    >
      {playable ? (active ? '■' : '▶') : '👁'}
    </button>
  );
};

const LinkChip = ({ label, to }: { label: string; to: string }) => (
  <button
    type="button"
    className="lead-chip"
    style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 12 }}
    onClick={(event) => {
      event.stopPropagation();
      navigate(to);
    }}
  >
    {label}
  </button>
);

// Desktop table and mobile card list for the Files manager. Both mount the
// same single player under/inside whichever row is active.
export const FilesList = ({
  rows,
  activeIndex,
  player,
  onToggle,
  onOpen,
}: FilesListProps) => (
  <>
    <div className="card anim d2 only-desktop" style={{ overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="leads">
          <thead>
            <tr>
              <th style={{ width: 44 }} />
              <th>{TFILES.colName}</th>
              <th>{TFILES.colType}</th>
              <th>{TFILES.colTask}</th>
              <th>{TFILES.colLead}</th>
              <th>{TFILES.colUploader}</th>
              <th>{TFILES.colDate}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((file, index) => {
              const active = activeIndex === index;
              return (
                // Two <tr>s per file when active; a fragment keyed per file
                // keeps React from remounting the player on every re-render.
                <FileRowGroup key={file.id} active={active} player={player}>
                  <tr onClick={() => navigate(`/files/${file.id}`)}>
                    <td>
                      <PlayButton
                        file={file}
                        active={active}
                        onToggle={() => onToggle(index)}
                        onOpen={() => onOpen(file)}
                      />
                    </td>
                    <td>
                      <div className="lead-cell">
                        <span>{KIND_ICONS[fileKindOf(file)]}</span>
                        <span className="lead-name">{attachmentLabel(file)}</span>
                      </div>
                    </td>
                    <td>
                      {file.fileType ? (
                        <span className="pill stage">{fileTypeLabel(file.fileType)}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {file.targetTask ? (
                        <LinkChip
                          label={file.targetTask.title || '—'}
                          to={`/task/${file.targetTask.id}`}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {file.targetOpportunity ? (
                        <LinkChip
                          label={file.targetOpportunity.name || '—'}
                          to={`/lead/${file.targetOpportunity.id}`}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{file.createdBy?.name || '—'}</td>
                    <td className="num">{formatJalaliDateTime(file.createdAt)}</td>
                  </tr>
                </FileRowGroup>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>

    <div className="only-mobile" style={{ flexDirection: 'column', gap: 8 }}>
      {rows.map((file, index) => {
        const active = activeIndex === index;
        return (
          <div key={file.id} className="card">
            <div className="file-card">
              <PlayButton
                file={file}
                active={active}
                onToggle={() => onToggle(index)}
                onOpen={() => onOpen(file)}
              />
              <button
                type="button"
                className="grow"
                style={{
                  background: 'none',
                  border: 0,
                  textAlign: 'start',
                  cursor: 'pointer',
                  font: 'inherit',
                  color: 'inherit',
                  flex: 1,
                }}
                onClick={() => navigate(`/files/${file.id}`)}
              >
                <div className="name">
                  {KIND_ICONS[fileKindOf(file)]} {attachmentLabel(file)}
                </div>
                <div className="sub">
                  {file.fileType ? `${fileTypeLabel(file.fileType)} · ` : ''}
                  {file.targetOpportunity?.name || file.targetTask?.title || '—'} ·{' '}
                  {formatJalaliDateTime(file.createdAt)}
                </div>
              </button>
            </div>
            {active && <div style={{ padding: '0 14px 12px' }}>{player}</div>}
          </div>
        );
      })}
    </div>
  </>
);

const FileRowGroup = ({
  active,
  player,
  children,
}: {
  active: boolean;
  player: ReactNode;
  children: ReactNode;
}) => (
  <>
    {children}
    {active && (
      <tr className="file-row-player">
        <td colSpan={7}>{player}</td>
      </tr>
    )}
  </>
);
