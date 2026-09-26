import { type FormDefinition, type Question } from '@shared/surveys';

import { type SurveyResponse } from '../../../../api/surveys';

export const question = (id: string, type: Question['type'], extra: Partial<Question> = {}): Question => ({
  kind: 'question',
  id,
  type,
  label: { fa: `سؤال ${id}` },
  required: false,
  audience: 'ALL',
  config: {},
  print: { answerLines: 1 },
  ...extra,
});

export const definition = (items: FormDefinition['pages'][number]['items'], extraPages: FormDefinition['pages'] = []): FormDefinition => ({
  schemaVersion: 1,
  languages: ['fa'],
  presentation: 'ALL_ON_PAGE',
  welcome: { enabled: false, title: {}, body: {} },
  pages: [{ id: 'p1', title: { fa: 'صفحه ۱' }, items, jumps: [] }, ...extraPages],
  endings: [{ id: 'e1', title: { fa: 'پایان' }, message: { fa: '' } }],
  appearance: { accent: '#123', showProgress: true, showQuestionNumbers: true },
  print: { instructions: {} },
  crmMapping: [],
  automations: [],
});

export const response = (overrides: Partial<SurveyResponse> = {}): SurveyResponse => ({
  id: 'r1',
  name: 'Noor',
  formId: 'f1',
  formVersionId: 'v1',
  versionNumber: 1,
  submissionKey: 'k1',
  answers: {},
  skippedByLogic: [],
  language: 'fa',
  completionStatus: 'COMPLETED',
  reviewStatus: 'NEW',
  source: 'PUBLIC_LINK',
  collectedAt: '2026-09-20T10:00:00.000Z',
  submittedAt: '2026-09-20T10:05:00.000Z',
  enteredAt: null,
  paperReference: '',
  paperReviewNotes: '',
  buyingInterest: null,
  city: 'کابل',
  area: '',
  location: null,
  crmActions: [],
  createdAt: '2026-09-20T10:05:00.000Z',
  updatedAt: '2026-09-20T10:05:00.000Z',
  form: { id: 'f1', name: 'فرم' },
  collector: null,
  enteredBy: null,
  company: null,
  person: null,
  opportunity: null,
  campaign: null,
  visit: null,
  ...overrides,
});
