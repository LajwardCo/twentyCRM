import { queryAllResponses } from '../../../api/surveyResponseExtras';
import { type ResponseFilter, type SurveyFormVersion, fetchVersions } from '../../../api/surveys';
import {
  type ExportTable,
  buildExportTable,
  exportFileName,
  toCsv,
} from '../../../lib/forms/responses/responseExport';

const download = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// The export always covers the whole current filter (every page, following
// cursors), not just the rows loaded into the table.
export const buildResponseExport = async (
  filter: ResponseFilter,
  excludeSpam: boolean,
): Promise<{ table: ExportTable; count: number; baseName: string; truncated: boolean }> => {
  const { responses, truncated } = await queryAllResponses(filter, excludeSpam);
  const formIds = [...new Set(responses.map((response) => response.formId))];
  const versions: SurveyFormVersion[] = (
    await Promise.all(formIds.map((formId) => fetchVersions(formId)))
  ).flat();
  const formNames = new Map(
    responses.map((response) => [response.formId, response.form?.name ?? response.formId]),
  );
  const baseName = formIds.length === 1 ? (formNames.get(formIds[0]) ?? 'responses') : 'survey-responses';

  return {
    table: buildExportTable(responses, versions, formNames),
    count: responses.length,
    baseName,
    truncated,
  };
};

export const downloadCsv = (table: ExportTable, baseName: string) =>
  download(new Blob([toCsv(table)], { type: 'text/csv;charset=utf-8' }), exportFileName(baseName, 'csv'));

// Lazy: the spreadsheet writer only loads when someone actually exports.
export const downloadXlsx = async (table: ExportTable, baseName: string) => {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const header = table.headers.map((value) => ({ value, fontWeight: 'bold' as const }));
  const rows = table.rows.map((row) => row.map((value) => ({ value, type: String })));
  const blob = await writeXlsxFile([header, ...rows], {
    rightToLeft: true,
    stickyRowsCount: 1,
    columns: table.headers.map((_, index) => ({ width: index === 0 ? 38 : 22 })),
  }).toBlob();

  download(blob, exportFileName(baseName, 'xlsx'));
};
