import {
  type AnswerValue,
  type FormDefinition,
  type MultiChoiceAnswer,
  type Question,
  type QuestionType,
  type SingleChoiceAnswer,
  OTHER_CHOICE_ID,
  answerToText,
  isAnswerPresent,
  isItemAvailableTo,
  listFormQuestions,
  pickLocalizedText,
} from '@shared/surveys';

import {
  type SurveyResponse,
  type SurveySource,
  type VisitOutcome,
} from '../../api/surveys';
import { AFGHAN_MONTHS, gregorianToJalali, toPersianDigits } from '../jalali';

// Pure aggregation for survey insights (form Insights tab + campaign
// progress). Rules that every number here follows:
//   * SPAM responses are removed before anything is counted.
//   * Every rate carries its denominator so the UI can say "12 of 40".
//   * Answers are keyed by stable question/choice ids, so one question is one
//     row across versions; labels come from the newest version that has it.
//   * Nothing is estimated or extrapolated: only what the records say.

export type InsightResponse = Pick<
  SurveyResponse,
  | 'id'
  | 'formVersionId'
  | 'versionNumber'
  | 'answers'
  | 'skippedByLogic'
  | 'completionStatus'
  | 'reviewStatus'
  | 'source'
  | 'collectedAt'
  | 'submittedAt'
  | 'createdAt'
  | 'city'
  | 'area'
  | 'collector'
  | 'campaign'
  | 'opportunity'
  | 'visit'
>;

export type VersionInfo = { versionNumber: number; definition: FormDefinition };

export const SURVEY_SOURCES: SurveySource[] = [
  'PUBLIC_LINK',
  'INVITATION',
  'STAFF_VISIT',
  'PAPER',
];

const PUBLIC_SOURCES: ReadonlySet<SurveySource> = new Set(['PUBLIC_LINK', 'INVITATION']);

export const isSpam = (response: Pick<InsightResponse, 'reviewStatus'>): boolean =>
  response.reviewStatus === 'SPAM';

export const isCompleted = (
  response: Pick<InsightResponse, 'completionStatus'>,
): boolean => response.completionStatus === 'COMPLETED';

// When the respondent answered; transcription/submission time only as a
// fallback, so a paper sheet from last month lands in last month's week.
export const responseDate = (
  response: Pick<InsightResponse, 'collectedAt' | 'submittedAt' | 'createdAt'>,
): string => response.collectedAt ?? response.submittedAt ?? response.createdAt;

const pad = (value: number) => String(value).padStart(2, '0');

// Local calendar date (yyyy-mm-dd), the same day the Jalali formatters show.
export const localDateKey = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// Date-only pickers speak local yyyy-mm-dd; campaign dates are stored as the
// instant local midnight of that day starts.
export const localDateToIso = (value: string): string | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (match === null) return null;

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toISOString();
};

export const isoToLocalDate = (iso: string | null): string =>
  iso === null || iso === '' ? '' : localDateKey(new Date(iso));

export const withoutSpam = <TResponse extends Pick<InsightResponse, 'reviewStatus'>>(
  responses: TResponse[],
): { kept: TResponse[]; spamExcluded: number } => {
  const kept = responses.filter((response) => !isSpam(response));

  return { kept, spamExcluded: responses.length - kept.length };
};

// ---- filters ------------------------------------------------------------

export const NO_CAMPAIGN = '__none';

export type InsightFilter = {
  versionId: string | null;
  // null = every campaign; NO_CAMPAIGN = responses outside any campaign.
  campaignId: string | null;
  // Inclusive local dates (yyyy-mm-dd), as the date picker produces them.
  from: string | null;
  to: string | null;
};

export const EMPTY_FILTER: InsightFilter = {
  versionId: null,
  campaignId: null,
  from: null,
  to: null,
};

export const filterResponses = <TResponse extends InsightResponse>(
  responses: TResponse[],
  filter: InsightFilter,
): TResponse[] =>
  responses.filter((response) => {
    if (filter.versionId !== null && response.formVersionId !== filter.versionId) {
      return false;
    }

    if (filter.campaignId === NO_CAMPAIGN && response.campaign !== null) return false;

    if (
      filter.campaignId !== null &&
      filter.campaignId !== NO_CAMPAIGN &&
      response.campaign?.id !== filter.campaignId
    ) {
      return false;
    }

    if (filter.from === null && filter.to === null) return true;

    const day = localDateKey(new Date(responseDate(response)));

    if (filter.from !== null && day < filter.from) return false;
    if (filter.to !== null && day > filter.to) return false;

    return true;
  });

// ---- rates --------------------------------------------------------------

export const percentOf = (count: number, denominator: number): number | null =>
  denominator <= 0 ? null : (count / denominator) * 100;

export const formatPercent = (value: number | null): string => {
  if (value === null) return '—';

  const rounded = value > 0 && value < 1 ? Math.round(value * 10) / 10 : Math.round(value);

  return `${toPersianDigits(String(rounded).replace('.', '٫'))}٪`;
};

export const formatDecimal = (value: number, digits = 1): string => {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;

  return toPersianDigits(String(rounded).replace('.', '٫'));
};

// ---- totals -------------------------------------------------------------

export type SourceCounts = { source: SurveySource; completed: number; partial: number };

export type ResponseTotals = {
  spamExcluded: number;
  total: number;
  completed: number;
  partial: number;
  // Always all four channels, in a fixed order, so tiles never jump around.
  bySource: SourceCounts[];
};

export const summarizeResponses = (responses: InsightResponse[]): ResponseTotals => {
  const { kept, spamExcluded } = withoutSpam(responses);
  const bySource = SURVEY_SOURCES.map((source) => ({ source, completed: 0, partial: 0 }));

  for (const response of kept) {
    const row = bySource.find((entry) => entry.source === response.source);

    if (row === undefined) continue;
    if (isCompleted(response)) row.completed += 1;
    else row.partial += 1;
  }

  const completed = kept.filter(isCompleted).length;

  return {
    spamExcluded,
    total: kept.length,
    completed,
    partial: kept.length - completed,
    bySource,
  };
};

// ---- responses over time --------------------------------------------------

export type WeekBucket = {
  weekStart: string;
  // Short Jalali day + month of the Monday that starts the ISO week.
  label: string;
  fullLabel: string;
  count: number;
};

const parseDateKey = (key: string): Date => {
  const [year, month, day] = key.split('-').map(Number);

  return new Date(year, month - 1, day);
};

// ISO weeks start on Monday.
export const isoWeekStart = (date: Date): string => {
  const mondayOffset = (date.getDay() + 6) % 7;

  return localDateKey(
    new Date(date.getFullYear(), date.getMonth(), date.getDate() - mondayOffset),
  );
};

export const jalaliWeekLabel = (weekStart: string): { label: string; fullLabel: string } => {
  const [year, month, day] = weekStart.split('-').map(Number);
  const { jy, jm, jd } = gregorianToJalali(year, month, day);
  const label = `${toPersianDigits(jd)} ${AFGHAN_MONTHS[jm - 1]}`;

  return { label, fullLabel: `${label} ${toPersianDigits(jy)}` };
};

// Completed responses per ISO week, with empty weeks between the first and
// last filled in so the chart's spacing reflects real time.
export const completedByWeek = (responses: InsightResponse[]): WeekBucket[] => {
  const counts = new Map<string, number>();

  for (const response of withoutSpam(responses).kept) {
    if (!isCompleted(response)) continue;

    const week = isoWeekStart(new Date(responseDate(response)));

    counts.set(week, (counts.get(week) ?? 0) + 1);
  }

  if (counts.size === 0) return [];

  const weeks = [...counts.keys()].sort();
  const last = weeks[weeks.length - 1];
  const buckets: WeekBucket[] = [];

  for (let cursor = parseDateKey(weeks[0]); ; ) {
    const key = localDateKey(cursor);

    buckets.push({ weekStart: key, ...jalaliWeekLabel(key), count: counts.get(key) ?? 0 });

    if (key >= last) break;

    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7);
  }

  return buckets;
};

// ---- per question -----------------------------------------------------------

// Where a question stands in one response. Exactly one applies.
export type AnswerBuckets = {
  answered: number;
  // Shown to the respondent (or collector) and left blank.
  unanswered: number;
  // Hidden by the form's logic when the response was saved.
  skippedByLogic: number;
  // The response's version did not contain the question.
  notInVersion: number;
  // Staff-only question on a public/invitation response: the respondent
  // never saw it, so it is neither blank nor skipped by logic.
  notShownToChannel: number;
  total: number;
};

export type ChoiceCount = {
  choiceId: string;
  label: string;
  count: number;
  // False when the newest version with this question no longer offers it.
  inLatest: boolean;
};

export type DatedText = { text: string; at: string };

export type ChoiceDistribution = {
  multi: boolean;
  rows: ChoiceCount[];
  other: { count: number; texts: DatedText[] } | null;
  // Responses that answered the question. For multi-choice the row counts
  // can add up to more than this, since one response picks several.
  denominator: number;
};

export type NumericSummary = {
  n: number;
  min: number;
  median: number;
  mean: number;
  max: number;
};

export type QuestionInsight = {
  questionId: string;
  type: QuestionType;
  label: string;
  versionNumbers: number[];
  buckets: AnswerBuckets;
  choices: ChoiceDistribution | null;
  yesNo: { yes: number; no: number } | null;
  numeric: NumericSummary | null;
  // Rating / opinion scale: responses per scale point (every point shown).
  scale: { value: number; count: number }[] | null;
  // Free text and other non-aggregatable answers: newest first.
  latest: DatedText[];
};

export type QuestionInsightsResult = {
  questions: QuestionInsight[];
  // Responses included (completed, not spam, with a known version).
  responseCount: number;
  // Responses whose version was not supplied, left out rather than guessed.
  unknownVersion: number;
};

const CHOICE_TYPES: ReadonlySet<QuestionType> = new Set([
  'single_choice',
  'multi_choice',
  'dropdown',
]);
const NUMERIC_TYPES: ReadonlySet<QuestionType> = new Set(['number', 'rating', 'opinion_scale']);
const SCALE_TYPES: ReadonlySet<QuestionType> = new Set(['rating', 'opinion_scale']);

export const numericSummary = (values: number[]): NumericSummary | null => {
  if (values.length === 0) return null;

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;

  return {
    n: sorted.length,
    min: sorted[0],
    median,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    max: sorted[sorted.length - 1],
  };
};

const labelOf = (text: Question['label'], definition: FormDefinition): string =>
  pickLocalizedText(text, definition.languages[0] ?? 'fa', definition.languages);

type QuestionMeta = {
  question: Question;
  definition: FormDefinition;
  versionNumbers: number[];
  choiceLabels: Map<string, { label: string; inLatest: boolean }>;
  allowsOther: boolean;
};

// Question catalogue across versions: newest version's order first, then
// questions that only older versions had, in their own newest order.
const catalogue = (versions: VersionInfo[]): Map<string, QuestionMeta> => {
  const newestFirst = [...versions].sort(
    (left, right) => right.versionNumber - left.versionNumber,
  );
  const metas = new Map<string, QuestionMeta>();

  for (const version of newestFirst) {
    for (const { question } of listFormQuestions(version.definition)) {
      let meta = metas.get(question.id);
      const isNewest = meta === undefined;

      if (meta === undefined) {
        meta = {
          question,
          definition: version.definition,
          versionNumbers: [],
          choiceLabels: new Map(),
          allowsOther: false,
        };
        metas.set(question.id, meta);
      }

      meta.versionNumbers.push(version.versionNumber);
      meta.allowsOther ||= question.config.allowOther === true;

      for (const choice of question.config.choices ?? []) {
        if (!meta.choiceLabels.has(choice.id)) {
          meta.choiceLabels.set(choice.id, {
            label: labelOf(choice.label, version.definition),
            inLatest: isNewest,
          });
        }
      }
    }
  }

  for (const meta of metas.values()) meta.versionNumbers.sort((a, b) => a - b);

  return metas;
};

type Accumulator = {
  meta: QuestionMeta;
  buckets: AnswerBuckets;
  choiceCounts: Map<string, number>;
  otherTexts: DatedText[];
  otherCount: number;
  yes: number;
  no: number;
  numbers: number[];
  latest: DatedText[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const tally = (
  accumulator: Accumulator,
  versionQuestion: Question,
  versionDefinition: FormDefinition,
  value: AnswerValue,
  at: string,
) => {
  const { meta } = accumulator;
  const type = meta.question.type;

  if (CHOICE_TYPES.has(type)) {
    const picked: string[] = [];
    let otherText: string | undefined;

    if (isRecord(value) && Array.isArray((value as MultiChoiceAnswer).choiceIds)) {
      picked.push(...new Set((value as MultiChoiceAnswer).choiceIds));
      otherText = (value as MultiChoiceAnswer).otherText;
    } else if (isRecord(value) && typeof (value as SingleChoiceAnswer).choiceId === 'string') {
      picked.push((value as SingleChoiceAnswer).choiceId as string);
      otherText = (value as SingleChoiceAnswer).otherText;
    }

    for (const choiceId of picked) {
      if (choiceId === OTHER_CHOICE_ID) {
        accumulator.otherCount += 1;

        if (typeof otherText === 'string' && otherText.trim() !== '') {
          accumulator.otherTexts.push({ text: otherText.trim(), at });
        }

        continue;
      }

      accumulator.choiceCounts.set(choiceId, (accumulator.choiceCounts.get(choiceId) ?? 0) + 1);
    }

    return;
  }

  if (type === 'yes_no') {
    if (value === true) accumulator.yes += 1;
    if (value === false) accumulator.no += 1;

    return;
  }

  if (NUMERIC_TYPES.has(type)) {
    if (typeof value === 'number' && Number.isFinite(value)) accumulator.numbers.push(value);

    return;
  }

  const text = answerToText(versionQuestion, value, versionDefinition).trim();

  if (text !== '') accumulator.latest.push({ text, at });
};

const newestFirstByDate = (left: DatedText, right: DatedText) =>
  right.at.localeCompare(left.at);

const finish = (accumulator: Accumulator, latestLimit: number): QuestionInsight => {
  const { meta, buckets } = accumulator;
  const type = meta.question.type;
  let choices: ChoiceDistribution | null = null;

  if (CHOICE_TYPES.has(type)) {
    const rows: ChoiceCount[] = [...meta.choiceLabels.entries()].map(([choiceId, info]) => ({
      choiceId,
      label: info.label,
      inLatest: info.inLatest,
      count: accumulator.choiceCounts.get(choiceId) ?? 0,
    }));

    // A choice id no version defines (should not happen) is still counted,
    // under its raw id, rather than silently dropped.
    for (const [choiceId, count] of accumulator.choiceCounts) {
      if (!meta.choiceLabels.has(choiceId)) {
        rows.push({ choiceId, label: choiceId, inLatest: false, count });
      }
    }

    choices = {
      multi: type === 'multi_choice',
      rows,
      other:
        meta.allowsOther || accumulator.otherCount > 0
          ? {
              count: accumulator.otherCount,
              texts: [...accumulator.otherTexts].sort(newestFirstByDate),
            }
          : null,
      denominator: buckets.answered,
    };
  }

  let scale: QuestionInsight['scale'] = null;

  if (SCALE_TYPES.has(type)) {
    const low = type === 'rating' ? 1 : (meta.question.config.scaleMin ?? 0);
    const high = meta.question.config.scaleMax ?? (type === 'rating' ? 5 : 10);
    const points = new Map<number, number>();

    for (let point = low; point <= high; point += 1) points.set(point, 0);
    for (const value of accumulator.numbers) points.set(value, (points.get(value) ?? 0) + 1);

    scale = [...points.entries()]
      .sort(([left], [right]) => left - right)
      .map(([value, count]) => ({ value, count }));
  }

  return {
    questionId: meta.question.id,
    type,
    label: labelOf(meta.question.label, meta.definition),
    versionNumbers: meta.versionNumbers,
    buckets,
    choices,
    yesNo: type === 'yes_no' ? { yes: accumulator.yes, no: accumulator.no } : null,
    numeric: NUMERIC_TYPES.has(type) ? numericSummary(accumulator.numbers) : null,
    scale,
    latest: [...accumulator.latest].sort(newestFirstByDate).slice(0, latestLimit),
  };
};

// Per-question statistics over COMPLETED, non-spam responses of one form.
// Partial responses are left out on purpose: a blank in an unfinished
// response says nothing about the question.
export const questionInsights = (
  responses: InsightResponse[],
  versions: ReadonlyMap<string, VersionInfo>,
  { latestLimit = 5 }: { latestLimit?: number } = {},
): QuestionInsightsResult => {
  const metas = catalogue([...versions.values()]);
  const accumulators = new Map<string, Accumulator>();

  for (const [questionId, meta] of metas) {
    accumulators.set(questionId, {
      meta,
      buckets: {
        answered: 0,
        unanswered: 0,
        skippedByLogic: 0,
        notInVersion: 0,
        notShownToChannel: 0,
        total: 0,
      },
      choiceCounts: new Map(),
      otherTexts: [],
      otherCount: 0,
      yes: 0,
      no: 0,
      numbers: [],
      latest: [],
    });
  }

  const versionIndexes = new Map(
    [...versions.entries()].map(([versionId, version]) => [
      versionId,
      { definition: version.definition, questions: new Map(listFormQuestions(version.definition).map((entry) => [entry.question.id, entry.question])) },
    ]),
  );
  let responseCount = 0;
  let unknownVersion = 0;

  for (const response of withoutSpam(responses).kept) {
    if (!isCompleted(response)) continue;

    const version = versionIndexes.get(response.formVersionId);

    if (version === undefined) {
      unknownVersion += 1;
      continue;
    }

    responseCount += 1;

    const skipped = new Set(response.skippedByLogic);
    const at = responseDate(response);

    for (const [questionId, accumulator] of accumulators) {
      const { buckets } = accumulator;
      const versionQuestion = version.questions.get(questionId);

      buckets.total += 1;

      if (versionQuestion === undefined) {
        buckets.notInVersion += 1;
        continue;
      }

      // Stripped answers never count (hidden-answer rule), so logic wins
      // over a value that may still be stored.
      if (skipped.has(questionId)) {
        buckets.skippedByLogic += 1;
        continue;
      }

      const value = response.answers[questionId];

      if (isAnswerPresent(versionQuestion, value)) {
        buckets.answered += 1;
        tally(accumulator, versionQuestion, version.definition, value, at);
        continue;
      }

      if (PUBLIC_SOURCES.has(response.source) && !isItemAvailableTo(versionQuestion, 'PUBLIC')) {
        buckets.notShownToChannel += 1;
        continue;
      }

      buckets.unanswered += 1;
    }
  }

  return {
    questions: [...accumulators.values()].map((accumulator) => finish(accumulator, latestLimit)),
    responseCount,
    unknownVersion,
  };
};

// ---- activity -----------------------------------------------------------

export type ActivityRow = {
  // null groups responses without that attribute (no campaign, no collector…).
  key: string | null;
  label: string | null;
  completed: number;
  partial: number;
  total: number;
};

export const activityBy = (
  responses: InsightResponse[],
  pick: (response: InsightResponse) => { key: string; label: string } | null,
): ActivityRow[] => {
  const rows = new Map<string | null, ActivityRow>();

  for (const response of withoutSpam(responses).kept) {
    const picked = pick(response);
    const key = picked?.key ?? null;
    let row = rows.get(key);

    if (row === undefined) {
      row = { key, label: picked?.label ?? null, completed: 0, partial: 0, total: 0 };
      rows.set(key, row);
    }

    row.total += 1;
    if (isCompleted(response)) row.completed += 1;
    else row.partial += 1;
  }

  return [...rows.values()].sort((left, right) => {
    if (left.key === null) return 1;
    if (right.key === null) return -1;

    return right.total - left.total || (left.label ?? '').localeCompare(right.label ?? '');
  });
};

const memberName = (member: { name: { firstName: string; lastName: string } }) =>
  `${member.name.firstName} ${member.name.lastName}`.trim();

// Free-typed place names: group ignoring case and repeated spaces, label
// with the first spelling seen.
const placeKey = (value: string): { key: string; label: string } | null => {
  const label = value.trim().replace(/\s+/g, ' ');

  return label === '' ? null : { key: label.toLowerCase(), label };
};

export const activityByCampaign = (responses: InsightResponse[]) =>
  activityBy(responses, (response) =>
    response.campaign === null ? null : { key: response.campaign.id, label: response.campaign.name },
  );

export const activityByCollector = (responses: InsightResponse[]) =>
  activityBy(responses, (response) =>
    response.collector === null
      ? null
      : { key: response.collector.id, label: memberName(response.collector) },
  );

export const activityByCity = (responses: InsightResponse[]) =>
  activityBy(responses, (response) => placeKey(response.city));

export const activityByArea = (responses: InsightResponse[]) =>
  activityBy(responses, (response) => placeKey(response.area));

// ---- leads --------------------------------------------------------------

export type StageCount = { stage: string | null; count: number };

export type LeadInsights = {
  // Distinct linked leads: one lead linked from several responses counts once.
  uniqueLeads: number;
  // Completed, non-spam responses — the conversion denominator.
  denominator: number;
  rate: number | null;
  responsesWithLead: number;
  stages: StageCount[];
};

export const stageDistribution = (
  stages: (string | null)[],
  stageOrder: string[] = [],
): StageCount[] => {
  const counts = new Map<string | null, number>();

  for (const stage of stages) counts.set(stage, (counts.get(stage) ?? 0) + 1);

  const rank = (stage: string | null) => {
    const index = stage === null ? -1 : stageOrder.indexOf(stage);

    return index === -1 ? stageOrder.length + (stage === null ? 1 : 0) : index;
  };

  return [...counts.entries()]
    .map(([stage, count]) => ({ stage, count }))
    .sort((left, right) => rank(left.stage) - rank(right.stage) || right.count - left.count);
};

export const leadInsights = (
  responses: InsightResponse[],
  {
    stageById,
    stageOrder = [],
  }: { stageById?: ReadonlyMap<string, string | null>; stageOrder?: string[] } = {},
): LeadInsights => {
  const completed = withoutSpam(responses).kept.filter(isCompleted);
  const leads = new Map<string, string | null>();
  let responsesWithLead = 0;

  for (const response of completed) {
    if (response.opportunity === null) continue;

    responsesWithLead += 1;
    leads.set(
      response.opportunity.id,
      stageById?.get(response.opportunity.id) ?? response.opportunity.stage ?? null,
    );
  }

  return {
    uniqueLeads: leads.size,
    denominator: completed.length,
    rate: percentOf(leads.size, completed.length),
    responsesWithLead,
    stages: stageDistribution([...leads.values()], stageOrder),
  };
};

export const uniqueLeadIds = (responses: InsightResponse[]): string[] => [
  ...new Set(
    withoutSpam(responses)
      .kept.filter(isCompleted)
      .flatMap((response) => (response.opportunity === null ? [] : [response.opportunity.id])),
  ),
];

// ---- campaigns: target, visits, follow-ups ------------------------------------

export type TargetProgress = {
  completed: number;
  target: number | null;
  percent: number | null;
  // 0..1 for the progress bar; the percent itself may exceed 100.
  barRatio: number;
};

export const targetProgress = (completed: number, target: number | null): TargetProgress => {
  const percent = target === null || target <= 0 ? null : percentOf(completed, target);

  return {
    completed,
    target: target === null || target <= 0 ? null : target,
    percent,
    barRatio: percent === null ? 0 : Math.min(1, percent / 100),
  };
};

export type VisitRecord = {
  id: string;
  status: string | null;
  visitOutcome: VisitOutcome | null;
  assignee: { id: string; name: { firstName: string; lastName: string } } | null;
  opportunityIds: string[];
};

export type VisitInsights = {
  total: number;
  byOutcome: { outcome: VisitOutcome | null; count: number }[];
  // Visits a non-spam survey response is linked to.
  withSurvey: number;
  withoutSurvey: number;
  // Completed, non-spam responses collected in person.
  staffVisitResponses: number;
  uniqueLeadsVisited: number;
  byAssignee: { key: string | null; label: string | null; count: number }[];
};

const OUTCOME_ORDER: VisitOutcome[] = [
  'COMPLETED',
  'REVISIT_NEEDED',
  'MANAGER_UNAVAILABLE',
  'BUSINESS_CLOSED',
  'DECLINED',
];

export const visitInsights = (
  visits: VisitRecord[],
  responses: InsightResponse[],
): VisitInsights => {
  const kept = withoutSpam(responses).kept;
  const surveyedVisitIds = new Set(
    kept.flatMap((response) => (response.visit === null ? [] : [response.visit.id])),
  );
  const outcomes = new Map<VisitOutcome | null, number>();
  const assignees = new Map<string | null, { label: string | null; count: number }>();

  for (const visit of visits) {
    outcomes.set(visit.visitOutcome, (outcomes.get(visit.visitOutcome) ?? 0) + 1);

    const key = visit.assignee?.id ?? null;
    const row = assignees.get(key) ?? {
      label: visit.assignee === null ? null : memberName(visit.assignee),
      count: 0,
    };

    row.count += 1;
    assignees.set(key, row);
  }

  const outcomeRank = (outcome: VisitOutcome | null) =>
    outcome === null ? OUTCOME_ORDER.length : OUTCOME_ORDER.indexOf(outcome);
  const withSurvey = visits.filter((visit) => surveyedVisitIds.has(visit.id)).length;

  return {
    total: visits.length,
    byOutcome: [...outcomes.entries()]
      .map(([outcome, count]) => ({ outcome, count }))
      .sort((left, right) => outcomeRank(left.outcome) - outcomeRank(right.outcome)),
    withSurvey,
    withoutSurvey: visits.length - withSurvey,
    staffVisitResponses: kept.filter(
      (response) => isCompleted(response) && response.source === 'STAFF_VISIT',
    ).length,
    uniqueLeadsVisited: new Set(visits.flatMap((visit) => visit.opportunityIds)).size,
    byAssignee: [...assignees.entries()]
      .map(([key, row]) => ({ key, ...row }))
      .sort((left, right) => {
        if (left.key === null) return 1;
        if (right.key === null) return -1;

        return right.count - left.count;
      }),
  };
};

export type FollowUpTask = { id: string; status: string | null; taskType: string | null };

// Tasks on the campaign's leads other than the visits themselves. Done =
// status DONE; everything else (TODO, IN_PROGRESS, unset) is still open.
export const followUpSummary = (
  tasks: FollowUpTask[],
): { total: number; done: number; open: number } => {
  const unique = new Map(
    tasks.filter((task) => task.taskType !== 'VISIT').map((task) => [task.id, task]),
  );
  const done = [...unique.values()].filter((task) => task.status === 'DONE').length;

  return { total: unique.size, done, open: unique.size - done };
};
