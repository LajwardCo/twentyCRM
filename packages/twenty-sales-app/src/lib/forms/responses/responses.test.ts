import { type CrmProposal } from '@shared/surveys';
import { describe, expect, it } from 'vitest';

import { buildAnswerLayout, classifyAnswer, countAnswerStatuses } from './answerStatus';
import { appendCrmAction, crmActionKey, pendingSuggestions } from './crmActionLog';
import {
  buildCrmPatches,
  initialDiffSelection,
  selectedChanges,
  splitPersonName,
  visibleDiffRows,
} from './crmDiff';
import { resolveColumnChoice } from './columnPrefs';
import {
  EXPORT_SKIPPED,
  buildExportTable,
  buildQuestionColumns,
  guardCell,
  toCsv,
} from './responseExport';
import {
  EMPTY_VIEW_FILTER,
  countActiveFilters,
  parseViewFilter,
  serializeViewFilter,
  toApiFilter,
} from './responseQuery';
import { definition, question, response } from './__fixtures__/responseFixtures';

const FORM_ID = '11111111-2222-4333-8444-555555555555';

describe('response filter <-> query', () => {
  it('should round-trip every filter through the URL', () => {
    const filter = {
      ...EMPTY_VIEW_FILTER,
      formId: FORM_ID,
      version: '2',
      from: '2026-09-01',
      to: '2026-09-30',
      source: 'PAPER' as const,
      city: 'کابل',
      completion: 'PARTIAL' as const,
      review: 'ALL' as const,
      linkage: 'UNLINKED' as const,
      search: 'نور',
    };

    expect(parseViewFilter(serializeViewFilter(filter))).toEqual(filter);
  });

  it('should omit defaults so an empty filter is an empty query', () => {
    expect(serializeViewFilter(EMPTY_VIEW_FILTER)).toBe('');
  });

  it('should drop invalid values from a hand-edited link', () => {
    const parsed = parseViewFilter('form=abc&v=2&source=HACK&review=nope&from=yesterday&crm=MAYBE');

    expect(parsed).toEqual(EMPTY_VIEW_FILTER);
  });

  it('should ignore a version without a form', () => {
    expect(parseViewFilter('v=3').version).toBe('');
  });

  it('should exclude spam by default and include it for ALL', () => {
    expect(toApiFilter(EMPTY_VIEW_FILTER)).toEqual({ filter: {}, excludeSpam: true });
    expect(toApiFilter({ ...EMPTY_VIEW_FILTER, review: 'ALL' }).excludeSpam).toBe(false);
    expect(toApiFilter({ ...EMPTY_VIEW_FILTER, review: 'SPAM' })).toEqual({
      filter: { reviewStatus: 'SPAM' },
      excludeSpam: false,
    });
  });

  it('should cover whole days in the date range', () => {
    const { filter } = toApiFilter({ ...EMPTY_VIEW_FILTER, from: '2026-09-01', to: '2026-09-01' });

    expect(new Date(filter.from ?? '').getHours()).toBe(0);
    expect(new Date(filter.to ?? '').getHours()).toBe(23);
    expect(new Date(filter.to ?? '').getTime() - new Date(filter.from ?? '').getTime()).toBe(86_399_999);
  });

  it('should count active filters except search and fixed ones', () => {
    const filter = { ...EMPTY_VIEW_FILTER, formId: FORM_ID, source: 'PAPER' as const, search: 'x' };

    expect(countActiveFilters(filter)).toBe(2);
    expect(countActiveFilters(filter, ['formId'])).toBe(1);
  });
});

describe('answer status', () => {
  const choices = { choices: [{ id: 'c_a', label: { fa: 'الف' } }] };
  const questions = [question('q1', 'short_text'), question('q2', 'single_choice', { config: choices }), question('q3', 'number')];

  it('should classify answered, unanswered, skipped and not-in-version', () => {
    const stored = { answers: { q1: 'x', q2: { choiceId: 'c_a' } }, skippedByLogic: ['q3'] };

    expect(classifyAnswer(questions[0], stored)).toBe('answered');
    expect(classifyAnswer(questions[2], stored)).toBe('skipped');
    expect(classifyAnswer(questions[2], { answers: {}, skippedByLogic: [] })).toBe('unanswered');
    expect(classifyAnswer(undefined, stored)).toBe('not_in_version');
  });

  it('should treat a blank text as unanswered', () => {
    expect(classifyAnswer(questions[0], { answers: { q1: '   ' }, skippedByLogic: [] })).toBe('unanswered');
  });

  it('should group rows by page and section in version order', () => {
    const layout = buildAnswerLayout(
      definition([
        questions[0],
        { kind: 'section', id: 's1', title: { fa: 'بخش' } },
        questions[1],
        question('q_staff', 'long_text', { audience: 'STAFF_ONLY' }),
      ]),
      { answers: { q1: 'x', q2: { choiceId: 'c_a' } }, skippedByLogic: [] },
    );

    expect(layout[0].sections.map((section) => section.sectionId)).toEqual([null, 's1']);
    expect(layout[0].sections[1].rows[0].text).toBe('الف');
    expect(layout[0].sections[1].rows[1].staffOnly).toBe(true);
    expect(countAnswerStatuses(layout)).toEqual({ answered: 2, unanswered: 1, skipped: 0, not_in_version: 0 });
  });
});

describe('export', () => {
  it('should guard every formula-like prefix', () => {
    for (const dangerous of ['=SUM(A1)', '+1', '-2', '@cmd', '\tx', '\rx']) {
      expect(guardCell(dangerous)).toBe(`'${dangerous}`);
    }

    expect(guardCell('safe = text')).toBe('safe = text');
    expect(guardCell('')).toBe('');
  });

  const v1 = {
    id: 'v1',
    formId: 'f1',
    versionNumber: 1,
    definition: definition([question('q_old', 'short_text', { label: { fa: 'قدیمی' } }), question('q1', 'short_text', { label: { fa: 'نام قبلی' } })]),
  };
  const v2 = {
    id: 'v2',
    formId: 'f1',
    versionNumber: 2,
    definition: definition([question('q1', 'short_text', { label: { fa: 'نام' } }), question('q2', 'yes_no')]),
  };

  it('should build one column per question across versions with the newest label', () => {
    const columns = buildQuestionColumns([v1, v2], new Map());

    expect(columns.map((column) => [column.questionId, column.header])).toEqual([
      ['q1', 'نام'],
      ['q2', 'سؤال q2'],
      ['q_old', 'قدیمی'],
    ]);
  });

  it('should render each answer with the response version and mark skipped vs unanswered', () => {
    const table = buildExportTable(
      [
        response({ id: 'a', formVersionId: 'v1', answers: { q1: '=HYPERLINK("x")', q_old: 'o' } }),
        response({ id: 'b', formVersionId: 'v2', versionNumber: 2, answers: { q2: true }, skippedByLogic: ['q1'] }),
      ],
      [v1, v2],
      new Map([['f1', 'فرم']]),
    );
    const answerStart = table.headers.length - 3;

    expect(table.rows[0].slice(answerStart)).toEqual([`'=HYPERLINK("x")`, '', 'o']);
    expect(table.rows[1].slice(answerStart)).toEqual([EXPORT_SKIPPED, 'بلی', '']);
    expect(table.rows[0][0]).toBe('a');
  });

  it('should write CSV as UTF-8 with BOM, quoting where needed', () => {
    const csv = toCsv({ headers: ['a', 'b'], rows: [['x,y', 'he said "hi"'], ['line\nbreak', 'ok']] });

    expect(csv.startsWith('﻿a,b\r\n')).toBe(true);
    expect(csv).toContain('"x,y","he said ""hi"""');
    expect(csv).toContain('"line\nbreak",ok');
  });
});

describe('CRM diff selection', () => {
  const proposal = (ruleId: string, field: CrmProposal['field'], action: CrmProposal['action'], proposed: string | null, current: string | null = null): CrmProposal => ({
    ruleId,
    questionId: `q_${ruleId}`,
    target: field.split('.')[0] as CrmProposal['target'],
    field,
    proposed,
    current,
    action,
  });
  const proposals = [
    proposal('fill', 'company.employees', 'FILL', '12'),
    proposal('same', 'company.name', 'SAME', 'Noor', 'Noor'),
    proposal('blank', 'person.email', 'SKIP_BLANK', null, 'a@b.c'),
    proposal('conflict', 'person.jobTitle', 'CONFLICT', 'Manager', 'Owner'),
  ];

  it('should pre-check FILL only and hide SAME', () => {
    expect(initialDiffSelection(proposals)).toEqual({ fill: true, same: false, blank: false, conflict: false });
    expect(visibleDiffRows(proposals).map((row) => row.ruleId)).toEqual(['fill', 'blank', 'conflict']);
  });

  it('should apply a conflict only when explicitly chosen', () => {
    const initial = initialDiffSelection(proposals);

    expect(selectedChanges(proposals, initial).map((row) => row.ruleId)).toEqual(['fill']);
    expect(selectedChanges(proposals, { ...initial, conflict: true }).map((row) => row.ruleId)).toEqual(['fill', 'conflict']);
  });

  it('should never apply SKIP_BLANK or SAME even when selected', () => {
    expect(selectedChanges(proposals, { same: true, blank: true })).toEqual([]);
  });

  it('should build field patches and route interest/follow-up to note and task', () => {
    const patches = buildCrmPatches(
      [
        proposal('a', 'company.employees', 'FILL', '12 نفر'),
        proposal('b', 'company.domainName', 'FILL', 'noor.af'),
        proposal('c', 'person.name', 'FILL', 'Ahmad Shah Noori'),
        proposal('d', 'person.phone', 'FILL', '0700123456'),
        proposal('e', 'opportunity.interest', 'FILL', 'POS'),
        proposal('f', 'opportunity.followUp', 'FILL', 'call next week'),
      ],
      (raw) => ({ primaryPhoneCallingCode: '+93', primaryPhoneNumber: raw.slice(1) }),
    );

    expect(patches.company).toEqual({ employees: 12, domainName: { primaryLinkUrl: 'https://noor.af' } });
    expect(patches.person).toEqual({
      name: { firstName: 'Ahmad', lastName: 'Shah Noori' },
      phones: { primaryPhoneCallingCode: '+93', primaryPhoneNumber: '700123456' },
    });
    expect(patches.interestNotes).toEqual(['POS']);
    expect(patches.followUps).toEqual(['call next week']);
  });

  it('should split a one-word name into a first name', () => {
    expect(splitPersonName('  Ahmad ')).toEqual({ firstName: 'Ahmad', lastName: '' });
  });
});

describe('CRM action log', () => {
  it('should not append a second DONE create for the same key', () => {
    const first = appendCrmAction([], { key: crmActionKey('create', 'opportunity'), type: 'CREATE_LEAD', status: 'DONE', by: 'm1', recordId: 'l1' });
    const second = appendCrmAction(first, { key: 'create:lead', type: 'CREATE_LEAD', status: 'DONE', by: 'm1', recordId: 'l2' });

    expect(first[0].key).toBe('create:lead');
    expect(second).toBe(first);
  });

  it('should log a re-link to a different record but not the same link twice', () => {
    const linked = appendCrmAction([], { key: 'link:company', type: 'LINK', status: 'DONE', by: 'm1', recordId: 'c1' });

    expect(appendCrmAction(linked, { key: 'link:company', type: 'LINK', status: 'DONE', by: 'm1', recordId: 'c1' })).toBe(linked);
    expect(appendCrmAction(linked, { key: 'link:company', type: 'LINK', status: 'DONE', by: 'm1', recordId: 'c2' })).toHaveLength(2);
  });

  it('should list only suggestions not yet linked', () => {
    const actions = [
      { key: 'suggest:company', type: 'SUGGESTED_LINK', status: 'SUGGESTED' as const, at: '', by: null, target: 'company', recordId: 'c1' },
      { key: 'suggest:person', type: 'SUGGESTED_LINK', status: 'SUGGESTED' as const, at: '', by: null, target: 'person', recordId: 'p1' },
    ];

    expect(pendingSuggestions(actions, { companyId: 'c1', personId: null, opportunityId: null }).map((action) => action.key)).toEqual(['suggest:person']);
  });
});

describe('column choice', () => {
  it('should default to the first questions and drop vanished ids', () => {
    expect(resolveColumnChoice(null, ['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c']);
    expect(resolveColumnChoice(['d', 'x'], ['a', 'd'])).toEqual(['d']);
  });
});
