import { useEffect, useMemo, useState } from 'react';

import { getAttachmentMetadata } from '../api/attachments';
import { fetchFilesPage, type FileRecord } from '../api/files';
import { FilePreview } from '../components/FilePreview';
import { FilesList, fileKindOf } from '../components/FilesList';
import { FileViewerModal } from '../components/FileViewerModal';
import { FilterBar } from '../components/FilterBar';
import { attachmentDownloadUrl, attachmentLabel } from '../lib/attachmentFile';
import { useCached } from '../lib/cache';
import { TFILES } from '../lib/fileStrings';
import { mergePages, nextPlayableIndex } from '../lib/filesPage';
import { buildGraphQLFilter } from '../lib/filters';
import { toPersianDigits } from '../lib/jalali';
import { useRoute } from '../lib/router';
import { fileFilterFields } from '../lib/screenFilters';
import { useFilters } from '../lib/useFilters';

// Every file in the workspace, newest first, with a player that opens under
// the row so a manager can listen through the day's calls without leaving the
// list. Only one row plays at a time; when a recording ends the next playable
// row starts (auto-advance), stopping at the end of the loaded rows.
export const FilesView = () => {
  const route = useRoute();

  const { data: schema } = useCached('attachment-metadata', () =>
    getAttachmentMetadata(),
  );
  const fields = useMemo(
    () => fileFilterFields({ hasFileType: schema?.hasFileType ?? false }),
    [schema?.hasFileType],
  );
  const filters = useFilters('files', fields, route.query);
  const serverFilter = useMemo(
    () => buildGraphQLFilter(fields, filters.state),
    [fields, filters.state],
  );
  const filterKey = JSON.stringify(serverFilter ?? null);

  const { data: firstPage, error, refreshing } = useCached(
    `files:${filterKey}`,
    () => fetchFilesPage({ filter: serverFilter }),
  );

  // Pages after the first live here; a filter change starts over.
  const [extra, setExtra] = useState<{
    key: string;
    items: FileRecord[];
    endCursor: string | null;
    hasMore: boolean | null;
  }>({ key: filterKey, items: [], endCursor: null, hasMore: null });
  const [loadingMore, setLoadingMore] = useState(false);

  const rows = useMemo(() => {
    const base = firstPage?.items ?? [];
    return extra.key === filterKey ? mergePages(base, extra.items) : base;
  }, [firstPage, extra, filterKey]);
  const hasMore =
    extra.key === filterKey && extra.hasMore !== null
      ? extra.hasMore
      : (firstPage?.hasMore ?? false);
  const endCursor =
    extra.key === filterKey && extra.endCursor !== null
      ? extra.endCursor
      : (firstPage?.endCursor ?? null);

  const loadMore = async () => {
    if (loadingMore || endCursor === null) return;
    setLoadingMore(true);
    try {
      const page = await fetchFilesPage({ filter: serverFilter, after: endCursor });
      setExtra((previous) => ({
        key: filterKey,
        items:
          previous.key === filterKey
            ? mergePages(previous.items, page.items)
            : page.items,
        endCursor: page.endCursor,
        hasMore: page.hasMore,
      }));
    } finally {
      setLoadingMore(false);
    }
  };

  // --- playback ---
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [viewing, setViewing] = useState<FileRecord | null>(null);

  // A filter change re-orders the rows under the player; stop it.
  useEffect(() => {
    setActiveIndex(null);
  }, [filterKey]);

  const onEnded = () => {
    if (activeIndex === null) return;
    const next = autoAdvance ? nextPlayableIndex(rows, activeIndex) : null;
    setActiveIndex(next);
  };

  const toggleRow = (index: number) => {
    setActiveIndex((current) => (current === index ? null : index));
  };

  const renderPlayer = (file: FileRecord) => (
    <FilePreview
      key={file.id}
      url={attachmentDownloadUrl(file)}
      kind={fileKindOf(file)}
      label={attachmentLabel(file)}
      extension={file.file?.[0]?.extension ?? null}
      autoPlay
      onEnded={onEnded}
      compact
    />
  );

  const loaded = firstPage !== null;

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>{TFILES.title}</h1>
          <div className="sub">
            {loaded && `${toPersianDigits(rows.length)}${hasMore ? '+' : ''} ${TFILES.count}`}
            {refreshing && !loaded && TFILES.loading}
          </div>
        </div>
      </div>

      <div className="toolbar anim d1">
        <FilterBar fields={fields} filters={filters} resultCount={loaded ? rows.length : null} />
        <div className="grow" />
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={autoAdvance}
            onChange={(event) => setAutoAdvance(event.target.checked)}
          />
          {TFILES.autoAdvance}
        </label>
      </div>

      {error !== null && <div className="error-banner">{error}</div>}

      {!loaded && error === null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 52 }} />
          ))}
        </div>
      )}

      {loaded && rows.length === 0 && (
        <div className="empty-state">
          {filters.count > 0 ? (
            <>
              {TFILES.noMatches}
              <div style={{ marginTop: 10 }}>
                <button className="btn line sm" onClick={filters.clearAll}>
                  {TFILES.clearAll}
                </button>
              </div>
            </>
          ) : (
            TFILES.noFiles
          )}
        </div>
      )}

      {loaded && rows.length > 0 && (
        <FilesList
          rows={rows}
          activeIndex={activeIndex}
          player={activeIndex !== null && rows[activeIndex] ? renderPlayer(rows[activeIndex]) : null}
          onToggle={toggleRow}
          onOpen={setViewing}
        />
      )}

      {loaded && hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <button className="btn line" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? TFILES.loading : TFILES.loadMore}
          </button>
        </div>
      )}

      {viewing !== null && (
        <FileViewerModal
          attachment={viewing}
          onClose={() => setViewing(null)}
          taskId={viewing.targetTask?.id ?? null}
          leadId={viewing.targetOpportunity?.id ?? null}
        />
      )}
    </main>
  );
};
