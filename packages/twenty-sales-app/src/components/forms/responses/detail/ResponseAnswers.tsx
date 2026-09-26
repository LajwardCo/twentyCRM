import { type FormDefinition, type FormLanguage, pickLocalizedText } from '@shared/surveys';
import { type ReactNode, useMemo } from 'react';

import { type SurveyResponse } from '../../../../api/surveys';
import { toPersianDigits } from '../../../../lib/jalali';
import { TSR } from '../../../../lib/forms/responseStrings';
import {
  type AnswerStatus,
  buildAnswerLayout,
  countAnswerStatuses,
} from '../../../../lib/forms/responses/answerStatus';
import { TSV } from '../../../../lib/forms/surveyStrings';

type ResponseAnswersProps = {
  response: SurveyResponse;
  definition: FormDefinition | null;
  actions?: ReactNode;
};

const STATUS_TEXT: Record<Exclude<AnswerStatus, 'answered'>, string> = {
  unanswered: TSV.unanswered,
  skipped: TSV.skippedByLogic,
  not_in_version: TSV.notInVersion,
};

// Staff read answers in the form's primary language; the respondent's own
// language is shown in the header.
const staffLanguage = (definition: FormDefinition): FormLanguage =>
  definition.languages.includes('fa') ? 'fa' : (definition.languages[0] ?? 'fa');

export const ResponseAnswers = ({ response, definition, actions }: ResponseAnswersProps) => {
  const layout = useMemo(
    () => (definition === null ? [] : buildAnswerLayout(definition, response, staffLanguage(definition))),
    [definition, response],
  );
  const counts = countAnswerStatuses(layout);

  return (
    <section className="card svr-section" aria-labelledby="svr-answers-title">
      <div className="svr-section-head">
        <div>
          <h3 id="svr-answers-title">{TSR.answers}</h3>
          {definition !== null && (
            <div className="svr-muted">
              {TSR.answerCounts(
                toPersianDigits(counts.answered),
                toPersianDigits(counts.unanswered),
                toPersianDigits(counts.skipped),
              )}
            </div>
          )}
        </div>
        {actions}
      </div>

      {definition === null && (
        <>
          <p className="svr-muted">{TSR.versionMissing}</p>
          <pre className="svr-raw" dir="ltr">{JSON.stringify(response.answers, null, 2)}</pre>
        </>
      )}

      {definition !== null && layout.every((page) => page.sections.length === 0) && <p className="svr-muted">{TSR.noQuestions}</p>}

      {definition !== null &&
        layout.map((page) =>
          page.sections.length === 0 ? null : (
            <div key={page.pageId} className="svr-answer-page">
              {page.title !== '' && layout.length > 1 && <h4 dir="auto">{page.title}</h4>}
              {page.sections.map((section) => (
                <div key={section.sectionId ?? `${page.pageId}-top`} className="svr-answer-section">
                  {section.title !== '' && <h5 dir="auto">{section.title}</h5>}
                  <dl className="svr-answer-list">
                    {section.rows.map((row) => (
                      <div key={row.question.id} className={`svr-answer svr-answer-${row.status}`}>
                        <dt dir="auto">
                          {pickLocalizedText(row.question.label, staffLanguage(definition), definition.languages) || row.question.id}
                          {row.staffOnly && <span className="svr-staff-badge">{TSR.staffOnlyBadge}</span>}
                        </dt>
                        <dd dir="auto">{row.status === 'answered' ? row.text : <span className="svr-muted">{STATUS_TEXT[row.status]}</span>}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          ),
        )}
    </section>
  );
};
