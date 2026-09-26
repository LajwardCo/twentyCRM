import {
  type FormDefinition,
  type Question,
  type QuestionType,
  createEmptyFormDefinition,
} from '@shared/surveys';

// Small hand-built form for the builder helper tests.

export const fixtureQuestion = (
  id: string,
  type: QuestionType,
  extra: Partial<Question> = {},
): Question => ({
  kind: 'question',
  id,
  type,
  label: { fa: id },
  required: false,
  audience: 'ALL',
  config:
    type === 'single_choice' || type === 'multi_choice' || type === 'dropdown'
      ? { choices: [{ id: `${id}_a`, label: { fa: 'A' } }, { id: `${id}_b`, label: { fa: 'B' } }] }
      : {},
  print: { answerLines: 1 },
  ...extra,
});

// Page 1: q1 (yes_no), s1 (section), q2 (single_choice)
// Page 2: q3 (number, shown when q1 = yes), q4 (multi_choice)
// Page 3: q5 (short_text)
export const buildFixtureDefinition = (): FormDefinition => {
  const base = createEmptyFormDefinition('fa');

  return {
    ...base,
    pages: [
      {
        id: 'p1',
        title: { fa: 'یک' },
        items: [
          fixtureQuestion('q1', 'yes_no'),
          { kind: 'section', id: 's1', title: { fa: 'بخش' } },
          fixtureQuestion('q2', 'single_choice'),
        ],
        jumps: [
          {
            id: 'j1',
            when: { mode: 'ALL', conditions: [{ questionId: 'q1', op: 'eq', value: false }] },
            to: { pageId: 'p3' },
          },
        ],
      },
      {
        id: 'p2',
        title: { fa: 'دو' },
        items: [
          fixtureQuestion('q3', 'number', {
            visibleWhen: { mode: 'ALL', conditions: [{ questionId: 'q1', op: 'eq', value: true }] },
          }),
          fixtureQuestion('q4', 'multi_choice'),
        ],
        jumps: [],
      },
      {
        id: 'p3',
        title: { fa: 'سه' },
        items: [fixtureQuestion('q5', 'short_text')],
        jumps: [],
      },
    ],
    crmMapping: [{ id: 'm1', questionId: 'q5', field: 'company.name' }],
    automations: [
      {
        id: 'a1',
        enabled: true,
        action: 'CREATE_TASK',
        when: { mode: 'ANY', conditions: [{ questionId: 'q3', op: 'gt', value: 5 }] },
      },
    ],
  };
};

export const itemIds = (definition: FormDefinition): string[][] =>
  definition.pages.map((page) => page.items.map((item) => item.id));
