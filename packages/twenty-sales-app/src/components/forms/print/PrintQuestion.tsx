import {
  type AnswerValue,
  type FormDefinition,
  type FormLanguage,
  type Question,
  answerToText,
  formatSurveyNumber,
} from '@shared/surveys';

import {
  type AnswerArea,
  type FilledStatus,
  answerAreaFor,
  otherTextOf,
  selectedChoiceIds,
} from '../../../lib/forms/print/printLayout';
import { type PrintChrome } from '../../../lib/forms/collectStrings';

type Filled = { value: unknown; status: FilledStatus };

type PrintQuestionProps = {
  question: Question;
  number: number;
  label: string;
  description: string;
  instruction: string | null;
  alternative: string | null;
  definition: FormDefinition;
  language: FormLanguage;
  chrome: PrintChrome;
  // Present when printing a completed response.
  filled?: Filled;
};

const Box = ({ checked }: { checked: boolean }) => (
  <span className={`svc-box${checked ? ' on' : ''}`} aria-hidden="true">
    {checked ? '✓' : ''}
  </span>
);

const Lines = ({ count, text }: { count: number; text?: string }) => (
  <div className="svc-lines">
    {text !== undefined && text !== '' ? (
      <div className="svc-written" dir="auto">{text}</div>
    ) : (
      Array.from({ length: count }, (_, index) => <div key={index} className="svc-line" />)
    )}
  </div>
);

const AnswerAreaView = ({
  area,
  question,
  language,
  chrome,
  filled,
  filledText,
}: {
  area: AnswerArea;
  question: Question;
  language: FormLanguage;
  chrome: PrintChrome;
  filled?: Filled;
  filledText: string;
}) => {
  const selected = filled === undefined ? [] : selectedChoiceIds(question, filled.value);
  const number = (value: number) => formatSurveyNumber(value, language);

  switch (area.kind) {
    case 'choices': {
      const other = filled === undefined ? '' : otherTextOf(filled.value);

      return (
        <div className="svc-choices">
          <div className="svc-choice-note">{area.multiple ? chrome.oneOrMore : chrome.oneOption}</div>
          {area.options.map((option) => (
            <div key={option.id} className="svc-choice">
              <Box checked={selected.includes(option.id)} />
              <span dir="auto">{option.label}</span>
            </div>
          ))}
          {area.other !== null && (
            <div className="svc-choice svc-choice-other">
              <Box checked={other !== ''} />
              <span>{area.other !== '' ? area.other : chrome.other}</span>
              <span className="svc-fill" dir="auto">{other}</span>
            </div>
          )}
        </div>
      );
    }
    case 'yesno':
      return (
        <div className="svc-choices svc-inline">
          <div className="svc-choice"><Box checked={selected.includes('yes')} />{language === 'en' ? 'Yes' : 'بلی'}</div>
          <div className="svc-choice"><Box checked={selected.includes('no')} />{language === 'en' ? 'No' : 'نخیر'}</div>
        </div>
      );
    case 'consent':
      return (
        <div className="svc-choice">
          <Box checked={selected.includes('yes')} />
          <span dir="auto">{area.text}</span>
        </div>
      );
    case 'boxes':
      return (
        <div className="svc-scale">
          {area.minLabel !== '' && <span className="svc-scale-label" dir="auto">{area.minLabel}</span>}
          {area.values.map((value) => (
            <span key={value} className={`svc-scale-box${filled?.value === value ? ' on' : ''}`}>
              {number(value)}
            </span>
          ))}
          {area.maxLabel !== '' && <span className="svc-scale-label" dir="auto">{area.maxLabel}</span>}
        </div>
      );
    case 'date':
    case 'time':
    case 'datetime':
      return filledText !== '' ? (
        <div className="svc-written" dir="ltr">{filledText}</div>
      ) : (
        <div className="svc-datetime" dir="ltr">
          {area.kind !== 'time' && <span>__ / __ / ____</span>}
          {area.kind !== 'date' && <span>__ : __</span>}
          <small dir={language === 'en' ? 'ltr' : 'rtl'}>
            {area.kind === 'time' ? chrome.timeHint : chrome.dateHint}
          </small>
        </div>
      );
    case 'address':
      return filledText !== '' ? (
        <Lines count={1} text={filledText} />
      ) : (
        <div className="svc-address">
          {[chrome.street, chrome.district, chrome.city, chrome.province].map((part) => (
            <div key={part} className="svc-address-row">
              <span>{part}:</span>
              <span className="svc-line" />
            </div>
          ))}
        </div>
      );
    default:
      return <Lines count={area.count} text={filledText} />;
  }
};

// One numbered question on the printed sheet — blank boxes and writing lines,
// or the respondent's answers when printing a response.
export const PrintQuestion = ({
  question,
  number,
  label,
  description,
  instruction,
  alternative,
  definition,
  language,
  chrome,
  filled,
}: PrintQuestionProps) => {
  const area = answerAreaFor(question, definition, language);
  const filledText =
    filled === undefined || filled.status !== 'answered'
      ? ''
      : answerToText(question, filled.value as AnswerValue, definition, language);

  return (
    <div className={`svc-q${filled?.status === 'skipped' ? ' skipped' : ''}`}>
      <div className="svc-q-head">
        <span className="svc-q-number">{formatSurveyNumber(number, language)}.</span>
        <span className="svc-q-label" dir="auto">
          {label}
          {question.required && <span className="svc-q-required" title={chrome.required}> *</span>}
        </span>
      </div>
      {instruction !== null && <div className="svc-q-instruction" dir="auto">{instruction}</div>}
      {description !== '' && <div className="svc-q-description" dir="auto">{description}</div>}
      {alternative !== null && <div className="svc-q-alternative" dir="auto">{alternative}</div>}
      {filled?.status === 'skipped' ? (
        <div className="svc-q-status">{chrome.skippedByLogic}</div>
      ) : (
        <>
          <AnswerAreaView
            area={area}
            question={question}
            language={language}
            chrome={chrome}
            filled={filled}
            filledText={filledText}
          />
          {filled?.status === 'unanswered' && <div className="svc-q-status">{chrome.notAnswered}</div>}
        </>
      )}
    </div>
  );
};
