import {
  type FormDefinition,
  type Question,
  type QuestionType,
} from '../../types/FormDefinition';

export const question = (
  id: string,
  type: QuestionType,
  overrides: Partial<Question> = {},
): Question => ({
  kind: 'question',
  id,
  type,
  label: { fa: `سؤال ${id}` },
  required: false,
  audience: 'ALL',
  config: {},
  print: { answerLines: 1 },
  ...overrides,
});

// The brief's example: "Do you currently use software?" Yes → which one;
// No → how are records managed today. Plus a staff-only note, a second page
// reached only by businesses that are interested, and a conditional ending.
export const buildSoftwareSurvey = (): FormDefinition => ({
  schemaVersion: 1,
  languages: ['fa', 'en'],
  presentation: 'ALL_ON_PAGE',
  welcome: { enabled: false, title: {}, body: {} },
  pages: [
    {
      id: 'p1',
      title: { fa: 'کسب‌وکار' },
      items: [
        question('q_name', 'short_text', { required: true }),
        question('q_uses', 'yes_no', { required: true }),
        question('q_which', 'short_text', {
          required: true,
          visibleWhen: {
            mode: 'ALL',
            conditions: [{ questionId: 'q_uses', op: 'eq', value: true }],
          },
        }),
        question('q_how', 'single_choice', {
          required: true,
          config: {
            choices: [
              { id: 'c_paper', label: { fa: 'دفتر کاغذی', en: 'Paper' } },
              { id: 'c_excel', label: { fa: 'اکسل', en: 'Excel' } },
            ],
            allowOther: true,
          },
          visibleWhen: {
            mode: 'ALL',
            conditions: [{ questionId: 'q_uses', op: 'eq', value: false }],
          },
        }),
        question('q_interest', 'single_choice', {
          required: true,
          config: {
            choices: [
              { id: 'c_yes', label: { fa: 'علاقه‌مند' } },
              { id: 'c_no', label: { fa: 'علاقه ندارد' } },
            ],
          },
        }),
        question('q_staff_note', 'long_text', { audience: 'STAFF_ONLY' }),
      ],
      jumps: [
        {
          id: 'j_not_interested',
          when: {
            mode: 'ALL',
            conditions: [{ questionId: 'q_interest', op: 'eq', value: 'c_no' }],
          },
          to: { endingId: 'e_bye' },
        },
      ],
    },
    {
      id: 'p2',
      title: { fa: 'نیازها' },
      items: [
        question('q_modules', 'multi_choice', {
          required: true,
          config: {
            choices: [
              { id: 'c_stock', label: { fa: 'انبار' } },
              { id: 'c_sales', label: { fa: 'فروش' } },
              { id: 'c_hr', label: { fa: 'منابع بشری' } },
            ],
            maxSelected: 2,
          },
        }),
        question('q_phone', 'phone'),
        question('q_employees', 'number', { config: { min: 1, max: 5000 } }),
      ],
      jumps: [],
    },
  ],
  endings: [
    {
      id: 'e_thanks',
      title: { fa: 'سپاس' },
      message: { fa: 'به زودی با شما تماس می‌گیریم.' },
    },
    {
      id: 'e_bye',
      title: { fa: 'سپاس از وقت شما' },
      message: { fa: 'پاسخ شما ثبت شد.' },
    },
  ],
  appearance: {
    accent: '#1f3a8a',
    showProgress: true,
    showQuestionNumbers: true,
  },
  print: { instructions: {} },
  crmMapping: [
    { id: 'm_name', questionId: 'q_name', field: 'company.name' },
    { id: 'm_phone', questionId: 'q_phone', field: 'person.phone' },
    { id: 'm_modules', questionId: 'q_modules', field: 'opportunity.interest' },
  ],
  automations: [],
});
