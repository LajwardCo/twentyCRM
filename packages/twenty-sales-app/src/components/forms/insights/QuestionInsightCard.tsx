import { useState } from 'react';

import {
  type DatedText,
  type QuestionInsight,
  formatDecimal,
} from '../../../lib/forms/insights';
import { TINS } from '../../../lib/forms/insightStrings';
import { QUESTION_TYPE_LABELS } from '../../../lib/forms/surveyStrings';
import { formatJalaliDate, toPersianDigits } from '../../../lib/jalali';
import { AnswerStatusBar, DistributionBars, type DistributionRow } from './InsightBars';

const TEXT_PREVIEW = 3;
const NUMERIC_TYPES = new Set(['number', 'rating', 'opinion_scale']);

const DatedTexts = ({ items }: { items: DatedText[] }) => {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, TEXT_PREVIEW);

  return (
    <>
      <ul className="svk-texts">
        {shown.map((item, index) => (
          <li key={`${item.at}-${index}`}>
            <span dir="auto">{item.text}</span>
            <time dateTime={item.at}>{formatJalaliDate(item.at)}</time>
          </li>
        ))}
      </ul>
      {items.length > TEXT_PREVIEW && (
        <button
          type="button"
          className="btn ghost sm"
          aria-expanded={expanded}
          onClick={() => setExpanded((previous) => !previous)}
        >
          {expanded ? TINS.showLess : TINS.showAll(items.length)}
        </button>
      )}
    </>
  );
};

const ChoiceBody = ({ insight }: { insight: QuestionInsight }) => {
  const choices = insight.choices;

  if (choices === null) return null;

  const rows: DistributionRow[] = choices.rows.map((row) => ({
    key: row.choiceId,
    label: row.label,
    count: row.count,
    note: row.inLatest ? undefined : TINS.retiredChoice,
    tone: row.inLatest ? undefined : 'muted',
  }));

  if (choices.other !== null) {
    rows.push({ key: '__other', label: TINS.other, count: choices.other.count, tone: 'accent' });
  }

  return (
    <>
      <p className="svk-note">
        {choices.multi ? TINS.multiBasis(choices.denominator) : TINS.choiceBasis(choices.denominator)}
      </p>
      <DistributionBars rows={rows} denominator={choices.denominator} />
      {choices.other !== null && choices.other.texts.length > 0 && (
        <div className="svk-subblock">
          <h4>{TINS.otherTexts}</h4>
          <DatedTexts items={choices.other.texts} />
        </div>
      )}
    </>
  );
};

const NumericBody = ({ insight }: { insight: QuestionInsight }) => {
  const numeric = insight.numeric;

  return (
    <>
      {numeric === null ? (
        <div className="svk-muted-note">{TINS.noAnswersYet}</div>
      ) : (
        <dl className="svk-numstats">
          {[
            [TINS.count, toPersianDigits(numeric.n)],
            [TINS.min, formatDecimal(numeric.min, 2)],
            [TINS.median, formatDecimal(numeric.median, 2)],
            [TINS.mean, formatDecimal(numeric.mean, 2)],
            [TINS.max, formatDecimal(numeric.max, 2)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className="num">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {insight.scale !== null && numeric !== null && (
        <DistributionBars
          denominator={numeric.n}
          rows={insight.scale.map((point) => ({
            key: String(point.value),
            label: toPersianDigits(point.value),
            count: point.count,
          }))}
        />
      )}
    </>
  );
};

// One question across every counted response: where it stood (answered /
// blank / skipped / not in version) and, for answered ones, what was said.
export const QuestionInsightCard = ({
  insight,
  index,
}: {
  insight: QuestionInsight;
  index: number;
}) => {
  let body = null;

  if (insight.choices !== null) {
    body = <ChoiceBody insight={insight} />;
  } else if (insight.yesNo !== null) {
    body = (
      <>
        <p className="svk-note">{TINS.choiceBasis(insight.buckets.answered)}</p>
        <DistributionBars
          denominator={insight.buckets.answered}
          rows={[
            { key: 'yes', label: TINS.yes, count: insight.yesNo.yes },
            { key: 'no', label: TINS.no, count: insight.yesNo.no },
          ]}
        />
      </>
    );
  } else if (NUMERIC_TYPES.has(insight.type)) {
    body = <NumericBody insight={insight} />;
  } else {
    body = (
      <div className="svk-subblock">
        <h4>{TINS.latestAnswers}</h4>
        {insight.latest.length === 0 ? (
          <div className="svk-muted-note">{TINS.noAnswersYet}</div>
        ) : (
          <DatedTexts items={insight.latest} />
        )}
      </div>
    );
  }

  return (
    <article className="card card-pad svk-question">
      <header>
        <span className="svk-qnum num">{toPersianDigits(index + 1)}</span>
        <div>
          <h3 dir="auto">{insight.label || insight.questionId}</h3>
          <div className="svk-qmeta">
            {QUESTION_TYPE_LABELS[insight.type]} · {TINS.versionsOf(insight.versionNumbers)}
          </div>
        </div>
      </header>
      <AnswerStatusBar buckets={insight.buckets} />
      {body}
    </article>
  );
};
