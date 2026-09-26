import { type Question, answerToText, buildQuestionIndex } from '@shared/surveys';
import { useMemo } from 'react';

import { type SurveyFormVersion, type SurveyResponse } from '../../../api/surveys';
import { formatJalaliDateTime, toPersianDigits } from '../../../lib/jalali';
import { navigate } from '../../../lib/router';
import { TSR } from '../../../lib/forms/responseStrings';
import { classifyAnswer } from '../../../lib/forms/responses/answerStatus';
import { type QuestionColumn } from '../../../lib/forms/responses/responseExport';
import { TSV } from '../../../lib/forms/surveyStrings';
import { CompletionBadge, ReviewBadge, SourceLabel } from './ResponseBadges';
import { memberLabel } from './useResponseLookups';

type ResponseRowsProps = {
  responses: SurveyResponse[];
  answerColumns: QuestionColumn[];
  versions: SurveyFormVersion[];
  showForm: boolean;
  selected: Set<string>;
  onToggle: (responseId: string) => void;
  onToggleAll: () => void;
};

const MAX_CELL = 60;

const AnswerCell = ({
  response,
  column,
  questions,
  versions,
}: {
  response: SurveyResponse;
  column: QuestionColumn;
  questions: Map<string, Map<string, Question>>;
  versions: Map<string, SurveyFormVersion>;
}) => {
  const version = versions.get(response.formVersionId);
  const question = questions.get(response.formVersionId)?.get(column.questionId);
  const status = classifyAnswer(question, response);

  if (status === 'answered' && question !== undefined && version !== undefined) {
    const text = answerToText(question, response.answers[question.id], version.definition);

    return <span dir="auto" title={text}>{text.length > MAX_CELL ? `${text.slice(0, MAX_CELL)}…` : text}</span>;
  }

  const label =
    status === 'skipped' ? TSV.skippedByLogic : status === 'not_in_version' ? TSV.notInVersion : TSV.unanswered;

  return <span className={`svr-muted svr-status-${status}`}>{status === 'unanswered' ? '—' : label}</span>;
};

const respondentLabel = (response: SurveyResponse) =>
  response.name.trim() !== '' ? response.name : (response.company?.name ?? TSR.noName);

const crmLabel = (response: SurveyResponse) =>
  [response.company?.name, response.person === null ? null : memberLabel(response.person), response.opportunity?.name]
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .join(' · ');

export const ResponseRows = ({
  responses,
  answerColumns,
  versions,
  showForm,
  selected,
  onToggle,
  onToggleAll,
}: ResponseRowsProps) => {
  const versionsById = useMemo(() => new Map(versions.map((version) => [version.id, version])), [versions]);
  const questions = useMemo(
    () => new Map(versions.map((version) => [version.id, buildQuestionIndex(version.definition)])),
    [versions],
  );
  const allSelected = responses.length > 0 && responses.every((response) => selected.has(response.id));
  const open = (responseId: string) => navigate(`/response/${responseId}`);

  return (
    <>
      <div className="card svr-table-card only-desktop">
        <div className="svr-table-scroll">
          <table className="leads svr-table">
            <thead>
              <tr>
                <th className="svr-check-col">
                  <input type="checkbox" aria-label={TSR.selectAll} checked={allSelected} onChange={onToggleAll} />
                </th>
                <th>{TSR.respondent}</th>
                {showForm && <th>{TSR.form}</th>}
                <th>{TSR.collectedAt}</th>
                <th>{TSR.source}</th>
                <th>{TSR.completion}</th>
                <th>{TSR.review}</th>
                <th>{TSR.crm}</th>
                {answerColumns.map((column) => (
                  <th key={column.key} dir="auto" className="svr-answer-col">
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {responses.map((response) => (
                <tr key={response.id} onClick={() => open(response.id)} className={selected.has(response.id) ? 'svr-row-selected' : undefined}>
                  <td className="svr-check-col" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={respondentLabel(response)}
                      checked={selected.has(response.id)}
                      onChange={() => onToggle(response.id)}
                    />
                  </td>
                  <td>
                    <a className="svr-row-link" href={`#/response/${response.id}`} dir="auto" onClick={(event) => event.stopPropagation()}>
                      {respondentLabel(response)}
                    </a>
                    {(response.city !== '' || response.area !== '') && (
                      <div className="svr-sub" dir="auto">
                        {[response.city, response.area].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </td>
                  {showForm && (
                    <td dir="auto">
                      {response.form?.name ?? '—'}
                      <span className="svr-sub"> · {TSR.version} {toPersianDigits(response.versionNumber)}</span>
                    </td>
                  )}
                  <td className="svr-nowrap">{formatJalaliDateTime(response.collectedAt ?? response.createdAt)}</td>
                  <td><SourceLabel source={response.source} /></td>
                  <td><CompletionBadge status={response.completionStatus} /></td>
                  <td><ReviewBadge status={response.reviewStatus} /></td>
                  <td dir="auto" className="svr-crm-cell">{crmLabel(response) || <span className="svr-muted">{TSR.notLinked}</span>}</td>
                  {answerColumns.map((column) => (
                    <td key={column.key} className="svr-answer-col">
                      <AnswerCell response={response} column={column} questions={questions} versions={versionsById} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="only-mobile svr-cards">
        {responses.map((response) => (
          <div key={response.id} className={`svr-card${selected.has(response.id) ? ' selected' : ''}`}>
            <input
              type="checkbox"
              className="svr-card-check"
              aria-label={respondentLabel(response)}
              checked={selected.has(response.id)}
              onChange={() => onToggle(response.id)}
            />
            <button type="button" className="svr-card-main" onClick={() => open(response.id)}>
              <span className="svr-card-title" dir="auto">{respondentLabel(response)}</span>
              <span className="svr-sub">
                {showForm && `${response.form?.name ?? ''} · `}
                {formatJalaliDateTime(response.collectedAt ?? response.createdAt)}
              </span>
              <span className="svr-card-badges">
                <SourceLabel source={response.source} />
                <CompletionBadge status={response.completionStatus} />
                <ReviewBadge status={response.reviewStatus} />
              </span>
              {crmLabel(response) !== '' && <span className="svr-sub" dir="auto">{crmLabel(response)}</span>}
            </button>
          </div>
        ))}
      </div>
    </>
  );
};
