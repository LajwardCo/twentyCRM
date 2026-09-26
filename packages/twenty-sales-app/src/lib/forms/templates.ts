import {
  type ChoiceOption,
  type Condition,
  type ConditionGroup,
  type FormDefinition,
  type FormItem,
  type Question,
  type QuestionConfig,
  type QuestionType,
} from '@shared/surveys';

import { type SurveyPurpose } from '../../api/surveys';

// Starter forms. They show off pages, conditional questions, skip rules and
// CRM mapping, and are copied into a new draft — every part stays editable.
// Ids are fixed per template; they only need to be unique within one form.

export type SurveyTemplate = {
  key: string;
  name: string;
  description: string;
  purpose: SurveyPurpose;
  build: () => FormDefinition;
};

const choice = (id: string, fa: string, en?: string): ChoiceOption => ({
  id,
  label: en === undefined ? { fa } : { fa, en },
});

const q = (
  id: string,
  type: QuestionType,
  fa: string,
  extra: Partial<Omit<Question, 'config'>> & { config?: QuestionConfig } = {},
): Question => ({
  kind: 'question',
  id,
  type,
  label: { fa },
  required: false,
  audience: type.startsWith('crm_') ? 'STAFF_ONLY' : 'ALL',
  config: {},
  print: { answerLines: type === 'long_text' ? 4 : type === 'address' ? 3 : 1 },
  ...extra,
});

const when = (...conditions: Condition[]): ConditionGroup => ({
  mode: 'ALL',
  conditions,
});

const base = (
  overrides: Partial<FormDefinition> & Pick<FormDefinition, 'pages' | 'endings'>,
): FormDefinition => ({
  schemaVersion: 1,
  languages: ['fa'],
  presentation: 'ALL_ON_PAGE',
  welcome: { enabled: false, title: {}, body: {} },
  appearance: { accent: '#2453d6', showProgress: true, showQuestionNumbers: true },
  print: { instructions: { fa: 'لطفاً دور گزینهٔ مورد نظر علامت بزنید و پاسخ‌ها را خوانا بنویسید.' } },
  crmMapping: [],
  automations: [],
  ...overrides,
});

const section = (id: string, title: string): FormItem => ({
  kind: 'section',
  id,
  title: { fa: title },
});

const cityBusinessSurvey = (): FormDefinition =>
  base({
    welcome: {
      enabled: true,
      title: { fa: 'نظرسنجی کسب‌وکارهای شهر' },
      body: { fa: 'چند دقیقه وقت شما را می‌گیریم تا نیازهای کسب‌وکارتان را بهتر بشناسیم.' },
    },
    pages: [
      {
        id: 'p_business',
        title: { fa: 'معلومات کسب‌وکار' },
        jumps: [],
        items: [
          q('q_business_name', 'short_text', 'نام کسب‌وکار', { required: true }),
          q('q_business_type', 'dropdown', 'نوع کسب‌وکار', {
            required: true,
            config: {
              choices: [
                choice('c_pharmacy', 'دواخانه'),
                choice('c_shop', 'فروشگاه'),
                choice('c_clinic', 'کلینیک'),
                choice('c_restaurant', 'رستورانت'),
              ],
              allowOther: true,
            },
          }),
          q('q_contact_name', 'short_text', 'نام شخص پاسخ‌دهنده'),
          q('q_phone', 'phone', 'شمارهٔ تماس', { required: true }),
          q('q_employees', 'number', 'تعداد کارمندان', { config: { min: 1, max: 10000 } }),
          q('q_address', 'address', 'آدرس'),
          q('q_location', 'location', 'موقعیت کسب‌وکار'),
        ],
      },
      {
        id: 'p_software',
        title: { fa: 'وضعیت فعلی' },
        jumps: [],
        items: [
          q('q_uses_software', 'yes_no', 'آیا فعلاً از نرم‌افزار استفاده می‌کنید؟', { required: true }),
          q('q_which_software', 'short_text', 'از کدام نرم‌افزار؟', {
            required: true,
            visibleWhen: when({ questionId: 'q_uses_software', op: 'eq', value: true }),
          }),
          q('q_satisfaction', 'rating', 'چقدر از آن راضی هستید؟', {
            visibleWhen: when({ questionId: 'q_uses_software', op: 'eq', value: true }),
            config: { scaleMax: 5 },
          }),
          q('q_records_today', 'single_choice', 'حساب و کتاب را فعلاً چطور نگه می‌دارید؟', {
            required: true,
            visibleWhen: when({ questionId: 'q_uses_software', op: 'eq', value: false }),
            config: {
              choices: [choice('c_paper', 'دفتر کاغذی'), choice('c_excel', 'اکسل'), choice('c_none', 'نگه نمی‌داریم')],
              allowOther: true,
            },
          }),
        ],
      },
      {
        id: 'p_interest',
        title: { fa: 'علاقه و پیگیری' },
        jumps: [
          {
            id: 'j_not_interested',
            when: when({ questionId: 'q_interest', op: 'eq', value: 'c_no' }),
            to: { endingId: 'e_thanks' },
          },
        ],
        items: [
          q('q_interest', 'single_choice', 'آیا به یک سیستم مدیریتی علاقه دارید؟', {
            required: true,
            config: {
              choices: [choice('c_yes', 'بلی'), choice('c_maybe', 'شاید، معلومات بیشتر می‌خواهم'), choice('c_no', 'فعلاً نه')],
            },
          }),
        ],
      },
      {
        id: 'p_follow_up',
        title: { fa: 'پیگیری' },
        jumps: [],
        items: [
          q('q_modules', 'multi_choice', 'کدام بخش‌ها برایتان مهم است؟', {
            config: {
              choices: [
                choice('c_inventory', 'گدام و موجودی'),
                choice('c_sales', 'فروش و بل'),
                choice('c_accounting', 'حسابداری'),
                choice('c_hr', 'کارمندان و معاش'),
              ],
            },
          }),
          q('q_follow_up', 'single_choice', 'چه زمانی برای تماس مناسب است؟', {
            config: {
              choices: [choice('c_morning', 'صبح'), choice('c_afternoon', 'بعد از ظهر'), choice('c_visit', 'بازدید حضوری')],
            },
          }),
          q('q_staff_notes', 'long_text', 'یادداشت کارمند', { audience: 'STAFF_ONLY' }),
        ],
      },
    ],
    endings: [
      { id: 'e_thanks', title: { fa: 'سپاس از همکاری شما' }, message: { fa: 'پاسخ‌های شما ثبت شد.' } },
    ],
    crmMapping: [
      { id: 'm_company_name', questionId: 'q_business_name', field: 'company.name' },
      { id: 'm_business_type', questionId: 'q_business_type', field: 'company.businessType' },
      { id: 'm_employees', questionId: 'q_employees', field: 'company.employees' },
      { id: 'm_address', questionId: 'q_address', field: 'company.address' },
      { id: 'm_person_name', questionId: 'q_contact_name', field: 'person.name' },
      { id: 'm_phone', questionId: 'q_phone', field: 'person.phone' },
      { id: 'm_modules', questionId: 'q_modules', field: 'opportunity.interest' },
      { id: 'm_follow_up', questionId: 'q_follow_up', field: 'opportunity.followUp' },
    ],
  });

const pharmacySurvey = (): FormDefinition =>
  base({
    pages: [
      {
        id: 'p_pharmacy',
        title: { fa: 'دواخانه' },
        jumps: [],
        items: [
          q('q_company', 'crm_company', 'دواخانه در CRM'),
          q('q_pharmacy_name', 'short_text', 'نام دواخانه', { required: true }),
          q('q_owner_name', 'short_text', 'نام مالک یا مسئول'),
          q('q_phone', 'phone', 'شمارهٔ تماس', { required: true }),
          q('q_daily_customers', 'single_choice', 'تعداد مشتری روزانه', {
            config: {
              choices: [choice('c_lt50', 'کمتر از ۵۰'), choice('c_50_150', '۵۰ تا ۱۵۰'), choice('c_gt150', 'بیشتر از ۱۵۰')],
            },
          }),
        ],
      },
      {
        id: 'p_needs',
        title: { fa: 'نیازها' },
        jumps: [],
        items: [
          section('s_current', 'روش فعلی'),
          q('q_uses_software', 'yes_no', 'آیا از نرم‌افزار دواخانه استفاده می‌کنید؟', { required: true }),
          q('q_which_software', 'short_text', 'نام نرم‌افزار', {
            required: true,
            visibleWhen: when({ questionId: 'q_uses_software', op: 'eq', value: true }),
          }),
          q('q_problems', 'multi_choice', 'بیشترین مشکل فعلی شما چیست؟', {
            config: {
              choices: [
                choice('c_expiry', 'پیگیری تاریخ انقضا'),
                choice('c_stock', 'کمبود یا اضافه‌بود موجودی'),
                choice('c_billing', 'بل و حساب مشتری'),
                choice('c_reports', 'گزارش فروش'),
              ],
              allowOther: true,
            },
          }),
          section('s_interest', 'علاقه'),
          q('q_modules', 'multi_choice', 'به کدام امکانات علاقه دارید؟', {
            required: true,
            config: {
              choices: [
                choice('c_expiry_alerts', 'هشدار انقضا'),
                choice('c_barcode', 'فروش با بارکد'),
                choice('c_insurance', 'بیمه و مشتریان قرضه'),
                choice('c_multi_branch', 'چند شعبه'),
              ],
              minSelected: 1,
            },
          }),
          q('q_budget', 'opinion_scale', 'اهمیت قیمت برای شما (۰ کم، ۱۰ بسیار زیاد)', {
            config: { scaleMin: 0, scaleMax: 10 },
          }),
          q('q_demo', 'yes_no', 'آیا می‌خواهید یک نمایش (دمو) ببینید؟', { required: true }),
          q('q_demo_time', 'datetime', 'زمان مناسب برای دمو', {
            requiredWhen: when({ questionId: 'q_demo', op: 'eq', value: true }),
            visibleWhen: when({ questionId: 'q_demo', op: 'eq', value: true }),
          }),
        ],
      },
    ],
    endings: [
      {
        id: 'e_demo',
        when: when({ questionId: 'q_demo', op: 'eq', value: true }),
        title: { fa: 'سپاس!' },
        message: { fa: 'همکاران ما برای هماهنگی دمو با شما تماس می‌گیرند.' },
      },
      { id: 'e_thanks', title: { fa: 'سپاس!' }, message: { fa: 'پاسخ‌های شما ثبت شد.' } },
    ],
    crmMapping: [
      { id: 'm_company_name', questionId: 'q_pharmacy_name', field: 'company.name' },
      { id: 'm_person_name', questionId: 'q_owner_name', field: 'person.name' },
      { id: 'm_phone', questionId: 'q_phone', field: 'person.phone' },
      { id: 'm_modules', questionId: 'q_modules', field: 'opportunity.interest' },
      { id: 'm_demo_time', questionId: 'q_demo_time', field: 'opportunity.followUp' },
    ],
    automations: [
      {
        id: 'a_demo_task',
        enabled: false,
        action: 'CREATE_TASK',
        taskTitle: 'هماهنگی دمو برای دواخانه',
        dueInDays: 1,
        when: when({ questionId: 'q_demo', op: 'eq', value: true }),
      },
    ],
  });

const demoRequest = (): FormDefinition =>
  base({
    languages: ['fa', 'en'],
    presentation: 'ONE_QUESTION',
    welcome: {
      enabled: true,
      title: { fa: 'درخواست نمایش (دمو)', en: 'Request a demo' },
      body: {
        fa: 'معلومات خود را بگذارید؛ برای تعیین وقت با شما تماس می‌گیریم.',
        en: 'Leave your details and we will call you to arrange a time.',
      },
    },
    pages: [
      {
        id: 'p_request',
        title: { fa: 'درخواست دمو', en: 'Demo request' },
        jumps: [],
        items: [
          { ...q('q_name', 'short_text', 'نام شما', { required: true }), label: { fa: 'نام شما', en: 'Your name' } },
          { ...q('q_business_name', 'short_text', 'نام کسب‌وکار', { required: true }), label: { fa: 'نام کسب‌وکار', en: 'Business name' } },
          { ...q('q_phone', 'phone', 'شمارهٔ تماس', { required: true }), label: { fa: 'شمارهٔ تماس', en: 'Phone number' } },
          { ...q('q_email', 'email', 'ایمیل'), label: { fa: 'ایمیل', en: 'Email' } },
          {
            ...q('q_product', 'single_choice', 'به کدام محصول علاقه دارید؟', {
              required: true,
              config: {
                choices: [
                  choice('c_pharmacy', 'سیستم دواخانه', 'Pharmacy system'),
                  choice('c_retail', 'سیستم فروشگاه', 'Retail system'),
                  choice('c_clinic', 'سیستم شفاخانه', 'Clinic system'),
                ],
                allowOther: true,
              },
            }),
            label: { fa: 'به کدام محصول علاقه دارید؟', en: 'Which product interests you?' },
          },
          {
            ...q('q_consent', 'consent', 'اجازهٔ تماس', {
              required: true,
              config: {
                consentText: {
                  fa: 'موافقم که برای هماهنگی دمو با من تماس گرفته شود.',
                  en: 'I agree to be contacted to arrange the demo.',
                },
              },
            }),
            label: { fa: 'اجازهٔ تماس', en: 'Consent to contact' },
          },
        ],
      },
    ],
    endings: [
      {
        id: 'e_thanks',
        title: { fa: 'درخواست شما رسید', en: 'Request received' },
        message: { fa: 'به زودی با شما تماس می‌گیریم.', en: 'We will contact you shortly.' },
      },
    ],
    crmMapping: [
      { id: 'm_person_name', questionId: 'q_name', field: 'person.name' },
      { id: 'm_company_name', questionId: 'q_business_name', field: 'company.name' },
      { id: 'm_phone', questionId: 'q_phone', field: 'person.phone' },
      { id: 'm_email', questionId: 'q_email', field: 'person.email' },
      { id: 'm_product', questionId: 'q_product', field: 'opportunity.interest' },
    ],
    // Off by default: turning it on makes every online request a lead.
    automations: [{ id: 'a_create_lead', enabled: false, action: 'CREATE_LEAD' }],
  });

const customerSatisfaction = (): FormDefinition =>
  base({
    pages: [
      {
        id: 'p_rating',
        title: { fa: 'نظر شما' },
        jumps: [],
        items: [
          q('q_nps', 'opinion_scale', 'چقدر احتمال دارد ما را به دیگران معرفی کنید؟', {
            required: true,
            config: {
              scaleMin: 0,
              scaleMax: 10,
              scaleMinLabel: { fa: 'اصلاً' },
              scaleMaxLabel: { fa: 'حتماً' },
            },
          }),
          q('q_overall', 'rating', 'رضایت کلی شما از سیستم', { required: true, config: { scaleMax: 5 } }),
          q('q_problem', 'multi_choice', 'چه چیزی خوب کار نکرد؟', {
            required: true,
            visibleWhen: { mode: 'ANY', conditions: [
              { questionId: 'q_overall', op: 'lte', value: 2 },
              { questionId: 'q_nps', op: 'lte', value: 6 },
            ] },
            config: {
              choices: [
                choice('c_speed', 'سرعت سیستم'),
                choice('c_support', 'پشتیبانی'),
                choice('c_training', 'آموزش'),
                choice('c_price', 'قیمت'),
              ],
              allowOther: true,
            },
          }),
          q('q_comment', 'long_text', 'پیشنهاد یا توضیح بیشتر'),
          q('q_contact_back', 'yes_no', 'آیا می‌خواهید تیم پشتیبانی با شما تماس بگیرد؟'),
          q('q_phone', 'phone', 'شمارهٔ تماس', {
            requiredWhen: when({ questionId: 'q_contact_back', op: 'eq', value: true }),
            visibleWhen: when({ questionId: 'q_contact_back', op: 'eq', value: true }),
          }),
        ],
      },
    ],
    endings: [{ id: 'e_thanks', title: { fa: 'سپاس از نظر شما' }, message: { fa: 'نظر شما به بهتر شدن خدمات ما کمک می‌کند.' } }],
    crmMapping: [{ id: 'm_phone', questionId: 'q_phone', field: 'person.phone' }],
    automations: [
      {
        id: 'a_support_task',
        enabled: false,
        action: 'CREATE_TASK',
        taskTitle: 'تماس با مشتری ناراضی',
        dueInDays: 1,
        when: when({ questionId: 'q_contact_back', op: 'eq', value: true }),
      },
    ],
  });

export const SURVEY_TEMPLATES: SurveyTemplate[] = [
  {
    key: 'city-business',
    name: 'نظرسنجی کسب‌وکارهای شهر',
    description: 'چند صفحه، سؤال شرطی نرم‌افزار، پرش برای افراد بی‌علاقه، نگاشت به شرکت/مخاطب/سرنخ.',
    purpose: 'FIELD_SURVEY',
    build: cityBusinessSurvey,
  },
  {
    key: 'pharmacy-needs',
    name: 'نیازسنجی نرم‌افزار دواخانه',
    description: 'بخش‌بندی، انتخاب دواخانه از CRM (فقط کارمند)، پیام پایانی شرطی برای دمو.',
    purpose: 'QUALIFICATION',
    build: pharmacySurvey,
  },
  {
    key: 'demo-request',
    name: 'درخواست دمو',
    description: 'دو زبانه (دری/انگلیسی)، یک سؤال در هر صفحه، رضایت تماس، ساخت خودکار سرنخ (خاموش).',
    purpose: 'DEMO_REQUEST',
    build: demoRequest,
  },
  {
    key: 'customer-satisfaction',
    name: 'رضایت مشتری',
    description: 'مقیاس ۰ تا ۱۰ و ستاره، سؤال «چه چیزی خوب نبود» فقط برای نمرهٔ پایین.',
    purpose: 'FEEDBACK',
    build: customerSatisfaction,
  },
];
