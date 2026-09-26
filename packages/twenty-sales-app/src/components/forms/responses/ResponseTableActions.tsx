import { useState } from 'react';

import { type ReviewStatus, updateResponse } from '../../../api/surveys';
import { toPersianDigits } from '../../../lib/jalali';
import { TSR } from '../../../lib/forms/responseStrings';
import { type ApiResponseQuery } from '../../../lib/forms/responses/responseQuery';
import { REVIEW_LABELS } from '../../../lib/forms/surveyStrings';
import { buildResponseExport, downloadCsv, downloadXlsx } from './runResponseExport';

type ResponseTableActionsProps = {
  selectedIds: string[];
  canEdit: boolean;
  canExport: boolean;
  query: ApiResponseQuery;
  onReviewChanged: (responseId: string, status: ReviewStatus) => void;
  onBulkFinished: () => void;
};

export const ResponseTableActions = ({
  selectedIds,
  canEdit,
  canExport,
  query,
  onReviewChanged,
  onBulkFinished,
}: ResponseTableActionsProps) => {
  const [bulkStatus, setBulkStatus] = useState<ReviewStatus>('REVIEWED');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Sequential on purpose: one failing row (permission, deleted meanwhile)
  // must not abort the rest, and the server is not flooded by a big batch.
  const applyBulk = async () => {
    if (progress !== null || selectedIds.length === 0) return;

    const total = selectedIds.length;
    let done = 0;
    let failed = 0;

    setMessage(null);
    setProgress({ done: 0, total });

    for (const responseId of selectedIds) {
      try {
        await updateResponse(responseId, { reviewStatus: bulkStatus });
        onReviewChanged(responseId, bulkStatus);
        done += 1;
      } catch {
        failed += 1;
      }

      setProgress({ done: done + failed, total });
    }

    setProgress(null);
    setMessage(TSR.bulkDone(toPersianDigits(done), toPersianDigits(failed)));
    onBulkFinished();
  };

  const runExport = async (format: 'csv' | 'xlsx') => {
    if (exporting) return;

    setExporting(true);
    setMessage(TSR.exporting);

    try {
      const { table, count, baseName, truncated } = await buildResponseExport(query.filter, query.excludeSpam);

      if (format === 'csv') downloadCsv(table, baseName);
      else await downloadXlsx(table, baseName);

      setMessage(truncated ? TSR.exportTruncated(toPersianDigits(count)) : TSR.exportDone(toPersianDigits(count)));
    } catch (error) {
      setMessage(`${TSR.exportFailed}: ${error instanceof Error ? error.message : ''}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="svr-actions">
      {canEdit && selectedIds.length > 0 && (
        <div className="svr-bulk" role="group" aria-label={TSR.bulkReview}>
          <span className="svr-bulk-count">{TSR.selected(toPersianDigits(selectedIds.length))}</span>
          <select aria-label={TSR.bulkReview} value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as ReviewStatus)}>
            {(Object.keys(REVIEW_LABELS) as ReviewStatus[]).map((status) => (
              <option key={status} value={status}>
                {REVIEW_LABELS[status]}
              </option>
            ))}
          </select>
          <button type="button" className="btn gold sm" disabled={progress !== null} onClick={() => void applyBulk()}>
            {progress === null
              ? TSR.bulkApply
              : TSR.bulkProgress(toPersianDigits(progress.done), toPersianDigits(progress.total))}
          </button>
        </div>
      )}
      {canExport && (
        <div className="svr-export" title={TSR.exportHint}>
          <button type="button" className="btn line sm" disabled={exporting} onClick={() => void runExport('csv')}>
            {TSR.exportCsv}
          </button>
          <button type="button" className="btn line sm" disabled={exporting} onClick={() => void runExport('xlsx')}>
            {TSR.exportXlsx}
          </button>
        </div>
      )}
      {message !== null && (
        <span className="svr-action-message" role="status">
          {message}
        </span>
      )}
    </div>
  );
};
