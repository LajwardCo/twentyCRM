import { useEffect, useMemo, useState } from 'react';

import { toPersianDigits } from '../../../lib/jalali';
import { TSR } from '../../../lib/forms/responseStrings';
import {
  loadColumnChoice,
  resolveColumnChoice,
  saveColumnChoice,
} from '../../../lib/forms/responses/columnPrefs';
import { buildQuestionColumns } from '../../../lib/forms/responses/responseExport';
import {
  EMPTY_VIEW_FILTER,
  type ResponseViewFilter,
  toApiFilter,
} from '../../../lib/forms/responses/responseQuery';
import { TSV } from '../../../lib/forms/surveyStrings';
import { useSurveyCapabilities } from '../../../lib/forms/useSurveyCapabilities';
import { ResponseColumnPicker } from './ResponseColumnPicker';
import { ResponseFilterBar } from './ResponseFilterBar';
import { ResponseRows } from './ResponseRows';
import { ResponseTableActions } from './ResponseTableActions';
import { useFormVersions, useResponseLookups } from './useResponseLookups';
import { useResponsePages } from './useResponsePages';

type ResponsesTableProps = {
  initialFilter: ResponseViewFilter;
  // Set by the form workspace: the table is scoped to that one form.
  fixedFormId?: string;
  onFilterChange?: (filter: ResponseViewFilter) => void;
};

// Typing in a text filter waits this long before querying.
const TEXT_DEBOUNCE_MS = 350;

export const ResponsesTable = ({ initialFilter, fixedFormId, onFilterChange }: ResponsesTableProps) => {
  const { capabilities } = useSurveyCapabilities();
  const { forms, campaigns, members } = useResponseLookups();
  const [filter, setFilter] = useState<ResponseViewFilter>(() => ({
    ...initialFilter,
    formId: fixedFormId ?? initialFilter.formId,
  }));
  const [queriedFilter, setQueriedFilter] = useState(filter);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [columnChoice, setColumnChoice] = useState<{ formId: string; ids: string[] | null }>({
    formId: filter.formId,
    ids: filter.formId === '' ? null : loadColumnChoice(filter.formId),
  });

  useEffect(() => {
    const textChanged =
      filter.search !== queriedFilter.search || filter.city !== queriedFilter.city || filter.area !== queriedFilter.area;
    const handle = window.setTimeout(() => setQueriedFilter(filter), textChanged ? TEXT_DEBOUNCE_MS : 0);

    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const apiQuery = useMemo(() => toApiFilter(queriedFilter), [queriedFilter]);
  const pages = useResponsePages(apiQuery);
  const formId = filter.formId;
  const versions = useFormVersions(formId);
  const questionColumns = useMemo(() => buildQuestionColumns(versions ?? [], new Map()), [versions]);
  const storedChoice = columnChoice.formId === formId ? columnChoice.ids : loadColumnChoice(formId);
  const chosenIds = resolveColumnChoice(storedChoice, questionColumns.map((column) => column.questionId));
  const answerColumns = questionColumns.filter((column) => chosenIds.includes(column.questionId));

  const update = (patch: Partial<ResponseViewFilter>) => {
    const next = { ...filter, ...patch, ...(fixedFormId === undefined ? {} : { formId: fixedFormId }) };

    setFilter(next);
    setSelected(new Set());
    onFilterChange?.(next);
  };

  const chooseColumns = (questionIds: string[]) => {
    setColumnChoice({ formId, ids: questionIds });
    saveColumnChoice(formId, questionIds);
  };

  const toggle = (responseId: string) =>
    setSelected((previous) => {
      const next = new Set(previous);

      if (next.has(responseId)) next.delete(responseId);
      else next.add(responseId);

      return next;
    });

  const toggleAll = () =>
    setSelected((previous) =>
      pages.responses.every((response) => previous.has(response.id))
        ? new Set()
        : new Set(pages.responses.map((response) => response.id)),
    );

  const shownCount = toPersianDigits(pages.responses.length);
  const totalCount = pages.totalCount === null ? '…' : toPersianDigits(pages.totalCount);

  return (
    <div className="svr-table-wrap">
      <ResponseFilterBar
        filter={filter}
        onChange={update}
        onClear={() => update({ ...EMPTY_VIEW_FILTER })}
        forms={forms}
        versions={versions ?? []}
        campaigns={campaigns}
        members={members}
        formFixed={fixedFormId !== undefined}
      />

      <div className="svr-toolbar">
        <span className="svr-total" role="status">
          {TSR.count(shownCount, totalCount)}
        </span>
        <div className="svr-toolbar-spacer" />
        {formId !== '' && questionColumns.length > 0 && (
          <ResponseColumnPicker columns={questionColumns} chosen={chosenIds} onChange={chooseColumns} />
        )}
        <ResponseTableActions
          selectedIds={[...selected]}
          canEdit={capabilities.canEditResponses}
          canExport={capabilities.canExport}
          query={apiQuery}
          onReviewChanged={(responseId, reviewStatus) => pages.patchRow(responseId, { reviewStatus })}
          onBulkFinished={() => setSelected(new Set())}
        />
      </div>

      {pages.error !== null && (
        <div className="error-banner" role="alert">
          {pages.error}
          <button type="button" className="btn line sm" onClick={pages.reload}>
            {TSV.retry}
          </button>
        </div>
      )}

      {pages.responses.length === 0 && pages.loading && (
        <div className="svr-skeletons" aria-busy="true">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="skeleton" style={{ height: 52 }} />
          ))}
        </div>
      )}

      {pages.responses.length === 0 && !pages.loading && pages.error === null && (
        <div className="empty-state">{fixedFormId !== undefined && pages.totalCount === 0 ? TSR.emptyForm : TSR.empty}</div>
      )}

      {pages.responses.length > 0 && (
        <ResponseRows
          responses={pages.responses}
          answerColumns={answerColumns}
          versions={versions ?? []}
          showForm={formId === ''}
          selected={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
        />
      )}

      {pages.hasNextPage && (
        <div className="svr-more">
          <button type="button" className="btn line" disabled={pages.loading} onClick={pages.loadMore}>
            {pages.loading ? TSR.loading : TSR.loadMore}
          </button>
        </div>
      )}
    </div>
  );
};
