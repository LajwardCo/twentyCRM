import {
  type FormDefinition,
  type Question,
  OTHER_CHOICE_ID,
  createEmptyFormDefinition,
  createQuestion,
} from '@shared/surveys';
import { describe, expect, it } from 'vitest';

import {
  type InsightResponse,
  type VersionInfo,
  type VisitRecord,
  EMPTY_FILTER,
  NO_CAMPAIGN,
  activityByArea,
  activityByCampaign,
  activityByCity,
  activityByCollector,
  completedByWeek,
  filterResponses,
  followUpSummary,
  formatPercent,
  isoToLocalDate,
  isoWeekStart,
  jalaliWeekLabel,
  localDateToIso,
  leadInsights,
  numericSummary,
  percentOf,
  questionInsights,
  stageDistribution,
  summarizeResponses,
  targetProgress,
  uniqueLeadIds,
  visitInsights,
} from './insights';

// ---- fixtures -------------------------------------------------------------

let sequence = 0;

const response = (overrides: Partial<InsightResponse> = {}): InsightResponse => {
  sequence += 1;

  return {
    id: `r${sequence}`,
    formVersionId: 'v2',
    versionNumber: 2,
    answers: {},
    skippedByLogic: [],
    completionStatus: 'COMPLETED',
    reviewStatus: 'NEW',
    source: 'STAFF_VISIT',
    collectedAt: '2026-09-16T08:00:00.000Z',
    submittedAt: '2026-09-16T08:05:00.000Z',
    createdAt: '2026-09-16T08:05:00.000Z',
    city: '',
    area: '',
    collector: null,
    campaign: null,
    opportunity: null,
    visit: null,
    ...overrides,
  };
};

const question = (id: string, type: Question['type'], label: string, extra: Partial<Question> = {}): Question => ({
  ...createQuestion(type, 'fa', label),
  id,
  ...extra,
});

const definitionWith = (questions: Question[]): FormDefinition => {
  const definition = createEmptyFormDefinition('fa');

  definition.pages[0].items = questions;

  return definition;
};

const choiceQuestion = (
  id: string,
  type: 'single_choice' | 'multi_choice' | 'dropdown',
  label: string,
  choices: [string, string][],
  allowOther = false,
) =>
  question(id, type, label, {
    config: {
      choices: choices.map(([choiceId, choiceLabel]) => ({ id: choiceId, label: { fa: choiceLabel } })),
      allowOther,
    },
  });

// v1: city (single), notes (text), legacy (only in v1), size (number)
// v2: city renamed + a choice renamed + one choice dropped + one added,
//     uses (yes/no), staff note (staff-only), size, rating.
const v1 = definitionWith([
  choiceQuestion('q_city', 'single_choice', 'شهر (قدیم)', [
    ['c_kabul', 'کابل قدیم'],
    ['c_old', 'حذف‌شده'],
  ], true),
  question('q_notes', 'short_text', 'یادداشت'),
  question('q_legacy', 'short_text', 'قدیمی'),
  question('q_size', 'number', 'کارمندان'),
]);

const v2 = definitionWith([
  choiceQuestion('q_city', 'single_choice', 'شهر', [
    ['c_kabul', 'کابل'],
    ['c_herat', 'هرات'],
  ], true),
  question('q_uses', 'yes_no', 'نرم‌افزار دارید؟'),
  question('q_staff', 'long_text', 'یادداشت کارمند', { audience: 'STAFF_ONLY' }),
  question('q_size', 'number', 'کارمندان'),
  question('q_rate', 'rating', 'امتیاز', { config: { scaleMax: 5 } }),
  question('q_notes', 'short_text', 'یادداشت'),
  choiceQuestion('q_modules', 'multi_choice', 'ماژول‌ها', [
    ['c_pos', 'فروش'],
    ['c_stock', 'انبار'],
  ], true),
]);

const versions = new Map<string, VersionInfo>([
  ['v1', { versionNumber: 1, definition: v1 }],
  ['v2', { versionNumber: 2, definition: v2 }],
]);

const byId = (result: ReturnType<typeof questionInsights>, questionId: string) => {
  const found = result.questions.find((entry) => entry.questionId === questionId);

  if (found === undefined) throw new Error(`missing ${questionId}`);

  return found;
};

// ---- totals ---------------------------------------------------------------

describe('summarizeResponses', () => {
  it('should split completed and partial by channel and exclude spam everywhere', () => {
    const totals = summarizeResponses([
      response({ source: 'PUBLIC_LINK' }),
      response({ source: 'PUBLIC_LINK', completionStatus: 'PARTIAL' }),
      response({ source: 'PAPER' }),
      response({ source: 'PUBLIC_LINK', reviewStatus: 'SPAM' }),
      response({ source: 'STAFF_VISIT', reviewStatus: 'SPAM', completionStatus: 'PARTIAL' }),
    ]);

    expect(totals).toMatchObject({ spamExcluded: 2, total: 3, completed: 2, partial: 1 });
    expect(totals.bySource).toEqual([
      { source: 'PUBLIC_LINK', completed: 1, partial: 1 },
      { source: 'INVITATION', completed: 0, partial: 0 },
      { source: 'STAFF_VISIT', completed: 0, partial: 0 },
      { source: 'PAPER', completed: 1, partial: 0 },
    ]);
  });
});

// ---- time -----------------------------------------------------------------

describe('week bucketing', () => {
  it('should start ISO weeks on Monday', () => {
    // 2026-09-16 is a Wednesday; 2026-09-20 a Sunday; 2026-09-21 a Monday.
    expect(isoWeekStart(new Date(2026, 8, 16, 12))).toBe('2026-09-14');
    expect(isoWeekStart(new Date(2026, 8, 20, 12))).toBe('2026-09-14');
    expect(isoWeekStart(new Date(2026, 8, 21, 12))).toBe('2026-09-21');
    // Crossing a year boundary.
    expect(isoWeekStart(new Date(2027, 0, 1, 12))).toBe('2026-12-28');
  });

  it('should label a week with the Jalali date of its Monday', () => {
    // 14 Sep 2026 = 23 Sonbola 1405.
    expect(jalaliWeekLabel('2026-09-14')).toEqual({
      label: '۲۳ سنبله',
      fullLabel: '۲۳ سنبله ۱۴۰۵',
    });
  });

  it('should count completed non-spam responses per week, filling empty weeks', () => {
    const at = (day: number) => new Date(2026, 8, day, 12).toISOString();
    const buckets = completedByWeek([
      response({ collectedAt: at(15) }),
      response({ collectedAt: at(17) }),
      response({ collectedAt: at(17), completionStatus: 'PARTIAL' }),
      response({ collectedAt: at(16), reviewStatus: 'SPAM' }),
      // Two weeks later; the week in between must appear with 0.
      response({ collectedAt: at(29) }),
    ]);

    expect(buckets.map((bucket) => [bucket.weekStart, bucket.count])).toEqual([
      ['2026-09-14', 2],
      ['2026-09-21', 0],
      ['2026-09-28', 1],
    ]);
  });

  it('should fall back to submission time when there is no collection date', () => {
    const buckets = completedByWeek([
      response({ collectedAt: null, submittedAt: new Date(2026, 8, 22, 12).toISOString() }),
    ]);

    expect(buckets.map((bucket) => bucket.weekStart)).toEqual(['2026-09-21']);
  });

  it('should return no buckets when nothing is completed', () => {
    expect(completedByWeek([response({ completionStatus: 'PARTIAL' })])).toEqual([]);
  });
});

// ---- filters --------------------------------------------------------------

describe('filterResponses', () => {
  const inCampaign = response({ campaign: { id: 'k1', name: 'Kabul' }, formVersionId: 'v1' });
  const noCampaign = response({ collectedAt: new Date(2026, 8, 20, 12).toISOString() });

  it('should filter by version, campaign, no-campaign and inclusive dates', () => {
    const all = [inCampaign, noCampaign];

    expect(filterResponses(all, EMPTY_FILTER)).toHaveLength(2);
    expect(filterResponses(all, { ...EMPTY_FILTER, versionId: 'v1' })).toEqual([inCampaign]);
    expect(filterResponses(all, { ...EMPTY_FILTER, campaignId: 'k1' })).toEqual([inCampaign]);
    expect(filterResponses(all, { ...EMPTY_FILTER, campaignId: NO_CAMPAIGN })).toEqual([noCampaign]);
    expect(filterResponses(all, { ...EMPTY_FILTER, from: '2026-09-20', to: '2026-09-20' })).toEqual([
      noCampaign,
    ]);
  });
});

// ---- per question ------------------------------------------------------------

describe('questionInsights', () => {
  it('should put every question of every version in exactly one of the answer buckets', () => {
    const result = questionInsights(
      [
        // v2, public: staff-only question not shown; rate skipped by logic.
        response({
          source: 'PUBLIC_LINK',
          answers: { q_city: { choiceId: 'c_kabul' }, q_uses: true },
          skippedByLogic: ['q_rate'],
        }),
        // v2, staff: staff note answered, uses left blank.
        response({ answers: { q_staff: 'خوش‌برخورد', q_size: 4 } }),
        // v1: answers legacy, v2-only questions are "not in version".
        response({
          formVersionId: 'v1',
          versionNumber: 1,
          answers: { q_legacy: 'x', q_city: { choiceId: 'c_old' } },
        }),
      ],
      versions,
    );

    expect(result.responseCount).toBe(3);

    for (const entry of result.questions) {
      const { answered, unanswered, skippedByLogic, notInVersion, notShownToChannel, total } =
        entry.buckets;

      expect(answered + unanswered + skippedByLogic + notInVersion + notShownToChannel).toBe(total);
      expect(total).toBe(3);
    }

    expect(byId(result, 'q_rate').buckets).toMatchObject({
      answered: 0,
      skippedByLogic: 1,
      unanswered: 1,
      notInVersion: 1,
    });
    expect(byId(result, 'q_staff').buckets).toMatchObject({
      answered: 1,
      notShownToChannel: 1,
      unanswered: 0,
      notInVersion: 1,
    });
    expect(byId(result, 'q_uses').buckets).toMatchObject({ answered: 1, unanswered: 1, notInVersion: 1 });
    expect(byId(result, 'q_legacy').buckets).toMatchObject({ answered: 1, notInVersion: 2 });
  });

  it('should never count an answer to a question skipped by logic', () => {
    const result = questionInsights(
      [response({ answers: { q_uses: true }, skippedByLogic: ['q_uses'] })],
      versions,
    );

    expect(byId(result, 'q_uses').buckets).toMatchObject({ answered: 0, skippedByLogic: 1 });
    expect(byId(result, 'q_uses').yesNo).toEqual({ yes: 0, no: 0 });
  });

  it('should label questions and choices from the newest version that has them', () => {
    const result = questionInsights(
      [
        response({ formVersionId: 'v1', answers: { q_city: { choiceId: 'c_old' } } }),
        response({ formVersionId: 'v1', answers: { q_city: { choiceId: 'c_kabul' } } }),
        response({ answers: { q_city: { choiceId: 'c_kabul' } } }),
        response({ answers: { q_city: { choiceId: 'c_herat' } } }),
      ],
      versions,
    );
    const city = byId(result, 'q_city');

    expect(city.label).toBe('شهر');
    expect(city.versionNumbers).toEqual([1, 2]);
    expect(city.choices?.rows).toEqual([
      { choiceId: 'c_kabul', label: 'کابل', count: 2, inLatest: true },
      { choiceId: 'c_herat', label: 'هرات', count: 1, inLatest: true },
      { choiceId: 'c_old', label: 'حذف‌شده', count: 1, inLatest: false },
    ]);
    expect(city.choices?.denominator).toBe(4);
    // A question only v1 had keeps its v1 label.
    expect(byId(result, 'q_legacy').label).toBe('قدیمی');
  });

  it('should order questions by the newest version, then older-only questions', () => {
    const result = questionInsights([], versions);

    expect(result.questions.map((entry) => entry.questionId)).toEqual([
      'q_city',
      'q_uses',
      'q_staff',
      'q_size',
      'q_rate',
      'q_notes',
      'q_modules',
      'q_legacy',
    ]);
  });

  it('should count "Other" separately and list its texts newest first', () => {
    const result = questionInsights(
      [
        response({
          collectedAt: '2026-09-10T08:00:00.000Z',
          answers: { q_city: { choiceId: OTHER_CHOICE_ID, otherText: 'مزار' } },
        }),
        response({
          collectedAt: '2026-09-12T08:00:00.000Z',
          answers: { q_city: { choiceId: OTHER_CHOICE_ID, otherText: '  قندهار ' } },
        }),
        response({ answers: { q_city: { choiceId: 'c_kabul' } } }),
      ],
      versions,
    );
    const city = byId(result, 'q_city');

    expect(city.choices?.other?.count).toBe(2);
    expect(city.choices?.other?.texts.map((entry) => entry.text)).toEqual(['قندهار', 'مزار']);
    expect(city.choices?.rows.find((row) => row.choiceId === OTHER_CHOICE_ID)).toBeUndefined();
    expect(city.choices?.denominator).toBe(3);
  });

  it('should count multi-choice per response, with answered responses as the denominator', () => {
    const result = questionInsights(
      [
        response({ answers: { q_modules: { choiceIds: ['c_pos', 'c_stock'] } } }),
        response({ answers: { q_modules: { choiceIds: ['c_pos', 'c_pos'] } } }),
        response({ answers: { q_modules: { choiceIds: [OTHER_CHOICE_ID], otherText: 'حسابداری' } } }),
        response({ answers: {} }),
      ],
      versions,
    );
    const modules = byId(result, 'q_modules');

    expect(modules.choices?.multi).toBe(true);
    expect(modules.choices?.denominator).toBe(3);
    expect(modules.choices?.rows.map((row) => [row.choiceId, row.count])).toEqual([
      ['c_pos', 2],
      ['c_stock', 1],
    ]);
    expect(modules.choices?.other?.count).toBe(1);
    expect(modules.buckets.unanswered).toBe(1);
  });

  it('should count yes and no', () => {
    const result = questionInsights(
      [
        response({ answers: { q_uses: true } }),
        response({ answers: { q_uses: true } }),
        response({ answers: { q_uses: false } }),
      ],
      versions,
    );

    expect(byId(result, 'q_uses').yesNo).toEqual({ yes: 2, no: 1 });
  });

  it('should summarise numbers with min, median, mean and max', () => {
    const result = questionInsights(
      [4, 1, 10, 3].map((size) => response({ answers: { q_size: size } })),
      versions,
    );

    expect(byId(result, 'q_size').numeric).toEqual({ n: 4, min: 1, median: 3.5, mean: 4.5, max: 10 });
  });

  it('should show every rating point, including those nobody picked', () => {
    const result = questionInsights(
      [5, 5, 3].map((rate) => response({ answers: { q_rate: rate } })),
      versions,
    );
    const rate = byId(result, 'q_rate');

    expect(rate.scale).toEqual([
      { value: 1, count: 0 },
      { value: 2, count: 0 },
      { value: 3, count: 1 },
      { value: 4, count: 0 },
      { value: 5, count: 2 },
    ]);
    expect(rate.numeric?.median).toBe(5);
  });

  it('should list the latest text answers newest first, limited', () => {
    const result = questionInsights(
      ['2026-09-01', '2026-09-03', '2026-09-02'].map((day, index) =>
        response({ collectedAt: `${day}T08:00:00.000Z`, answers: { q_notes: `note ${index}` } }),
      ),
      versions,
      { latestLimit: 2 },
    );

    expect(byId(result, 'q_notes').latest.map((entry) => entry.text)).toEqual(['note 1', 'note 2']);
    expect(byId(result, 'q_notes').buckets.answered).toBe(3);
  });

  it('should use completed non-spam responses only and report unknown versions', () => {
    const result = questionInsights(
      [
        response({ answers: { q_uses: true } }),
        response({ answers: { q_uses: true }, completionStatus: 'PARTIAL' }),
        response({ answers: { q_uses: true }, reviewStatus: 'SPAM' }),
        response({ answers: { q_uses: true }, formVersionId: 'v9' }),
      ],
      versions,
    );

    expect(result.responseCount).toBe(1);
    expect(result.unknownVersion).toBe(1);
    expect(byId(result, 'q_uses').yesNo).toEqual({ yes: 1, no: 0 });
  });
});

describe('numericSummary', () => {
  it('should take the middle value for an odd count and handle one value', () => {
    expect(numericSummary([7, 1, 3])?.median).toBe(3);
    expect(numericSummary([2])).toEqual({ n: 1, min: 2, median: 2, mean: 2, max: 2 });
    expect(numericSummary([])).toBeNull();
  });
});

// ---- activity ---------------------------------------------------------------

describe('activity', () => {
  const ali = { id: 'm1', name: { firstName: 'Ali', lastName: 'Ahmadi' } };
  const sara = { id: 'm2', name: { firstName: 'Sara', lastName: '' } };

  it('should count by collector with no-collector last and spam excluded', () => {
    const rows = activityByCollector([
      response({ collector: sara }),
      response({ collector: ali }),
      response({ collector: ali, completionStatus: 'PARTIAL' }),
      response({ collector: null, source: 'PUBLIC_LINK' }),
      response({ collector: sara, reviewStatus: 'SPAM' }),
    ]);

    expect(rows).toEqual([
      { key: 'm1', label: 'Ali Ahmadi', completed: 1, partial: 1, total: 2 },
      { key: 'm2', label: 'Sara', completed: 1, partial: 0, total: 1 },
      { key: null, label: null, completed: 1, partial: 0, total: 1 },
    ]);
  });

  it('should group places ignoring case and extra spaces', () => {
    const rows = activityByCity([
      response({ city: 'Kabul' }),
      response({ city: ' kabul  ' }),
      response({ city: 'Herat' }),
      response({ city: '' }),
    ]);

    expect(rows.map((row) => [row.label, row.total])).toEqual([
      ['Kabul', 2],
      ['Herat', 1],
      [null, 1],
    ]);
    expect(activityByArea([response({ area: 'Karte  3' }), response({ area: 'karte 3' })])).toEqual([
      { key: 'karte 3', label: 'Karte 3', completed: 2, partial: 0, total: 2 },
    ]);
  });

  it('should count by campaign', () => {
    const rows = activityByCampaign([
      response({ campaign: { id: 'k1', name: 'Kabul' } }),
      response({ campaign: null }),
    ]);

    expect(rows.map((row) => row.key)).toEqual(['k1', null]);
  });
});

// ---- leads ------------------------------------------------------------------

describe('leadInsights', () => {
  const lead = (id: string, stage: string | null) => ({ id, name: id, stage });

  it('should count each lead once however many responses link to it', () => {
    const responses = [
      response({ opportunity: lead('o1', 'NEW_LEAD') }),
      response({ opportunity: lead('o1', 'NEW_LEAD') }),
      response({ opportunity: lead('o2', 'ACTIVE_CUSTOMER') }),
      response({ opportunity: null }),
      // Partial and spam responses are outside the denominator and numerator.
      response({ opportunity: lead('o3', 'NEW_LEAD'), completionStatus: 'PARTIAL' }),
      response({ opportunity: lead('o4', 'NEW_LEAD'), reviewStatus: 'SPAM' }),
    ];
    const result = leadInsights(responses, { stageOrder: ['NEW_LEAD', 'ACTIVE_CUSTOMER'] });

    expect(result).toMatchObject({ uniqueLeads: 2, denominator: 4, responsesWithLead: 3 });
    expect(result.rate).toBe(50);
    expect(result.stages).toEqual([
      { stage: 'NEW_LEAD', count: 1 },
      { stage: 'ACTIVE_CUSTOMER', count: 1 },
    ]);
    expect(uniqueLeadIds(responses)).toEqual(['o1', 'o2']);
  });

  it('should prefer freshly fetched stages over the response snapshot', () => {
    const result = leadInsights([response({ opportunity: lead('o1', 'NEW_LEAD') })], {
      stageById: new Map([['o1', 'LOST_MISSED']]),
    });

    expect(result.stages).toEqual([{ stage: 'LOST_MISSED', count: 1 }]);
  });

  it('should have no rate without completed responses', () => {
    expect(leadInsights([]).rate).toBeNull();
  });
});

describe('stageDistribution', () => {
  it('should follow the pipeline order and put unknown and missing stages last', () => {
    expect(stageDistribution(['B', null, 'A', 'X', 'B'], ['A', 'B'])).toEqual([
      { stage: 'A', count: 1 },
      { stage: 'B', count: 2 },
      { stage: 'X', count: 1 },
      { stage: null, count: 1 },
    ]);
  });
});

// ---- campaigns ----------------------------------------------------------------

describe('campaign measures', () => {
  it('should compute target progress and clamp only the bar', () => {
    expect(targetProgress(30, 40)).toEqual({ completed: 30, target: 40, percent: 75, barRatio: 0.75 });
    expect(targetProgress(50, 40)).toMatchObject({ percent: 125, barRatio: 1 });
    expect(targetProgress(5, null)).toMatchObject({ target: null, percent: null, barRatio: 0 });
    expect(targetProgress(5, 0)).toMatchObject({ target: null, percent: null });
  });

  it('should count visits by outcome and compare with surveys', () => {
    const ali = { id: 'm1', name: { firstName: 'Ali', lastName: 'A' } };
    const visits: VisitRecord[] = [
      { id: 't1', status: 'DONE', visitOutcome: 'COMPLETED', assignee: ali, opportunityIds: ['o1'] },
      { id: 't2', status: 'DONE', visitOutcome: 'BUSINESS_CLOSED', assignee: ali, opportunityIds: [] },
      { id: 't3', status: 'DONE', visitOutcome: 'COMPLETED', assignee: null, opportunityIds: ['o1', 'o2'] },
      { id: 't4', status: 'DONE', visitOutcome: null, assignee: null, opportunityIds: [] },
    ];
    const result = visitInsights(visits, [
      response({ visit: { id: 't1', title: '', visitOutcome: 'COMPLETED' } }),
      response({ visit: { id: 't3', title: '', visitOutcome: 'COMPLETED' }, reviewStatus: 'SPAM' }),
      response({ source: 'PUBLIC_LINK' }),
    ]);

    expect(result).toMatchObject({
      total: 4,
      withSurvey: 1,
      withoutSurvey: 3,
      staffVisitResponses: 1,
      uniqueLeadsVisited: 2,
    });
    expect(result.byOutcome).toEqual([
      { outcome: 'COMPLETED', count: 2 },
      { outcome: 'BUSINESS_CLOSED', count: 1 },
      { outcome: null, count: 1 },
    ]);
    expect(result.byAssignee).toEqual([
      { key: 'm1', label: 'Ali A', count: 2 },
      { key: null, label: null, count: 2 },
    ]);
  });

  it('should count follow-up tasks once, excluding the visits themselves', () => {
    expect(
      followUpSummary([
        { id: 'a', status: 'DONE', taskType: 'CALL' },
        { id: 'a', status: 'DONE', taskType: 'CALL' },
        { id: 'b', status: 'TODO', taskType: 'DEMO' },
        { id: 'c', status: null, taskType: null },
        { id: 'v', status: 'DONE', taskType: 'VISIT' },
      ]),
    ).toEqual({ total: 3, done: 1, open: 2 });
  });
});

describe('date conversion', () => {
  it('should round-trip a picker date through the stored ISO instant', () => {
    const iso = localDateToIso('2026-09-30');

    expect(iso).not.toBeNull();
    expect(isoToLocalDate(iso)).toBe('2026-09-30');
    expect(localDateToIso('')).toBeNull();
    expect(localDateToIso('30/09/2026')).toBeNull();
    expect(isoToLocalDate(null)).toBe('');
  });
});

describe('formatting', () => {
  it('should show percentages with Persian digits and a dash without a denominator', () => {
    expect(percentOf(1, 3)).toBeCloseTo(33.33, 2);
    expect(formatPercent(percentOf(1, 3))).toBe('۳۳٪');
    expect(formatPercent(0.5)).toBe('۰٫۵٪');
    expect(formatPercent(null)).toBe('—');
  });
});
