import { type FormLanguage, type QuestionType } from '@shared/surveys';

import {
  type BuyingInterest,
  type CampaignStatus,
  type CompletionStatus,
  type ReviewStatus,
  type SurveyFormStatus,
  type SurveyPurpose,
  type SurveySource,
  type VisitOutcome,
} from '../../api/surveys';

// Staff-facing text for Surveys & Forms. The app UI is Dari-only (house
// rule); respondent-facing chrome on public forms is localised separately in
// RESPONDENT_STRINGS below because respondents may pick English.

export const TSV = {
  nav: 'فرم‌ها و نظرسنجی',
  navCampaigns: 'کمپاین‌ها',
  navResponses: 'پاسخ‌ها',
  pageTitle: 'فرم‌ها و نظرسنجی‌ها',
  pageSub: 'فرم بسازید، منتشر کنید، آنلاین، حضوری یا کاغذی جمع‌آوری کنید',
  newForm: 'فرم جدید',
  startVisit: 'ثبت بازدید',
  enterPaper: 'ورود پاسخ کاغذی',
  search: 'جستجوی فرم…',
  empty: 'هنوز فرمی ساخته نشده است',
  emptyHint: 'از یک الگو شروع کنید یا فرم خالی بسازید.',
  notProvisioned:
    'بخش فرم‌ها هنوز روی این سرور راه‌اندازی نشده است (اسکریپت provision-surveys.mjs).',
  loadError: 'بارگذاری ناموفق بود. دوباره تلاش کنید.',
  retry: 'تلاش دوباره',
  save: 'ذخیره',
  saving: 'در حال ذخیره…',
  saved: 'ذخیره شد',
  saveFailed: 'ذخیره نشد',
  cancel: 'لغو',
  close: 'بستن',
  confirm: 'تأیید',
  delete: 'حذف',
  edit: 'ویرایش',
  duplicate: 'کپی',
  preview: 'پیش‌نمایش',
  publish: 'انتشار',
  share: 'اشتراک‌گذاری',
  print: 'چاپ',
  responses: 'پاسخ‌ها',
  archive: 'بایگانی',
  unarchive: 'بازگردانی از بایگانی',
  closeForm: 'بستن فرم',
  reopenForm: 'بازگشایی فرم',
  owner: 'مسئول',
  status: 'وضعیت',
  purpose: 'هدف',
  campaign: 'کمپاین',
  updatedAt: 'آخرین تغییر',
  responseCount: 'تعداد پاسخ',
  version: 'نسخه',
  noVersion: 'منتشر نشده',
  unpublishedChanges: 'تغییرات منتشرنشده',
  all: 'همه',
  cards: 'کارت',
  table: 'جدول',
  sortUpdated: 'آخرین تغییر',
  sortName: 'نام',
  sortResponses: 'بیشترین پاسخ',
  noPermission: 'اجازهٔ این کار را ندارید.',
  deviceOnly: 'فقط روی همین دستگاه ذخیره شده — هنوز به سرور ارسال نشده',
  serverSaved: 'در سرور ذخیره شد',
  required: 'الزامی',
  optional: 'اختیاری',
  staffOnly: 'فقط کارمندان',
  answered: 'پاسخ داده',
  unanswered: 'بی‌پاسخ',
  skippedByLogic: 'رد شده طبق منطق فرم',
  notInVersion: 'در این نسخه نبود',
};

export const FORM_STATUS_LABELS: Record<SurveyFormStatus, string> = {
  DRAFT: 'پیش‌نویس',
  PUBLISHED: 'منتشرشده',
  CLOSED: 'بسته',
  ARCHIVED: 'بایگانی',
};

export const PURPOSE_LABELS: Record<SurveyPurpose, string> = {
  FIELD_SURVEY: 'نظرسنجی میدانی',
  DEMO_REQUEST: 'درخواست دمو',
  FEEDBACK: 'نظر مشتری',
  QUALIFICATION: 'ارزیابی مشتری',
  OTHER: 'سایر',
};

export const SOURCE_LABELS: Record<SurveySource, string> = {
  PUBLIC_LINK: 'لینک آنلاین',
  INVITATION: 'دعوت‌نامه',
  STAFF_VISIT: 'بازدید حضوری',
  PAPER: 'کاغذی',
};

export const COMPLETION_LABELS: Record<CompletionStatus, string> = {
  PARTIAL: 'ناتمام',
  COMPLETED: 'تکمیل‌شده',
};

export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  NEW: 'جدید',
  NEEDS_REVIEW: 'نیاز به بررسی',
  REVIEWED: 'بررسی‌شده',
  ACTIONED: 'اقدام‌شده',
  SPAM: 'هرزنامه',
};

export const INTEREST_LABELS: Record<BuyingInterest, string> = {
  INTERESTED: 'علاقه‌مند',
  UNDECIDED: 'مردد',
  NOT_INTERESTED: 'علاقه ندارد',
};

export const VISIT_OUTCOME_LABELS: Record<VisitOutcome, string> = {
  COMPLETED: 'نظرسنجی انجام شد',
  BUSINESS_CLOSED: 'کسب‌وکار بسته بود',
  MANAGER_UNAVAILABLE: 'مدیر حضور نداشت',
  DECLINED: 'همکاری نکرد',
  REVISIT_NEEDED: 'نیاز به بازدید دوباره',
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  PLANNED: 'برنامه‌ریزی‌شده',
  ACTIVE: 'فعال',
  COMPLETED: 'پایان‌یافته',
  CANCELLED: 'لغوشده',
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  short_text: 'متن کوتاه',
  long_text: 'متن بلند',
  number: 'عدد',
  email: 'ایمیل',
  phone: 'شمارهٔ تلفن',
  website: 'وب‌سایت',
  single_choice: 'تک‌گزینه‌ای',
  multi_choice: 'چندگزینه‌ای',
  dropdown: 'فهرست کشویی',
  yes_no: 'بلی / نخیر',
  date: 'تاریخ',
  time: 'ساعت',
  datetime: 'تاریخ و ساعت',
  rating: 'امتیاز ستاره‌ای',
  opinion_scale: 'مقیاس نظر (۰ تا ۱۰)',
  address: 'آدرس',
  location: 'موقعیت روی نقشه',
  file: 'فایل / عکس',
  consent: 'رضایت‌نامه',
  crm_company: 'انتخاب شرکت (CRM)',
  crm_contact: 'انتخاب مخاطب (CRM)',
  crm_lead: 'انتخاب سرنخ (CRM)',
};

export const LANGUAGE_LABELS: Record<FormLanguage, string> = {
  fa: 'دری',
  ps: 'پښتو',
  en: 'English',
};

// Chrome of the form a respondent fills in: navigation, validation messages
// and states. Pashto falls back to Dari until reviewed Pashto copy exists.
export type RespondentStrings = {
  next: string;
  previous: string;
  submit: string;
  submitting: string;
  start: string;
  required: string;
  optional: string;
  other: string;
  otherPlaceholder: string;
  yes: string;
  no: string;
  choose: string;
  pageOf: (page: string, total: string) => string;
  errors: Record<string, string>;
  fixErrors: string;
  submitFailed: string;
  retry: string;
  answersKept: string;
  closed: string;
  notYetOpen: string;
  expired: string;
  limitReached: string;
  invalid: string;
  rateLimited: string;
  uploading: string;
  upload: string;
  remove: string;
  useMyLocation: string;
  locating: string;
  locationDenied: string;
  latitude: string;
  longitude: string;
  locationDescription: string;
  street: string;
  district: string;
  city: string;
  province: string;
  previewNotice: string;
  previewSubmitted: string;
  language: string;
  selectedCount: (count: string) => string;
};

const DARI_RESPONDENT: RespondentStrings = {
  next: 'بعدی',
  previous: 'قبلی',
  submit: 'ارسال',
  submitting: 'در حال ارسال…',
  start: 'شروع',
  required: 'الزامی',
  optional: 'اختیاری',
  other: 'سایر',
  otherPlaceholder: 'بنویسید…',
  yes: 'بلی',
  no: 'نخیر',
  choose: 'انتخاب کنید…',
  pageOf: (page, total) => `صفحهٔ ${page} از ${total}`,
  errors: {
    REQUIRED: 'پاسخ به این سؤال الزامی است.',
    TOO_SHORT: 'پاسخ کوتاه‌تر از حد مجاز است.',
    TOO_LONG: 'پاسخ طولانی‌تر از حد مجاز است.',
    TOO_SMALL: 'عدد کوچک‌تر از حد مجاز است.',
    TOO_LARGE: 'عدد بزرگ‌تر از حد مجاز است.',
    TOO_FEW: 'گزینه‌های بیشتری انتخاب کنید.',
    TOO_MANY: 'گزینه‌های کمتری انتخاب کنید.',
    INVALID_EMAIL: 'ایمیل معتبر نیست.',
    INVALID_PHONE: 'شمارهٔ تلفن معتبر نیست.',
    INVALID_URL: 'آدرس وب‌سایت معتبر نیست.',
    INVALID_DATE: 'تاریخ معتبر نیست.',
    INVALID_TIME: 'ساعت معتبر نیست.',
    INVALID_CHOICE: 'این گزینه معتبر نیست.',
    INVALID_FILE: 'فایل پذیرفته نشد (نوع یا اندازه).',
    INVALID_VALUE: 'مقدار معتبر نیست.',
  },
  fixErrors: 'لطفاً موارد مشخص‌شده را اصلاح کنید.',
  submitFailed: 'ارسال انجام نشد. پاسخ‌های شما حفظ شده است؛ دوباره تلاش کنید.',
  retry: 'تلاش دوباره',
  answersKept: 'پاسخ‌های شما روی همین دستگاه نگه داشته شده است.',
  closed: 'این فرم دیگر پاسخ نمی‌پذیرد.',
  notYetOpen: 'این فرم هنوز باز نشده است.',
  expired: 'مهلت پاسخ‌دهی به این فرم تمام شده است.',
  limitReached: 'ظرفیت پاسخ‌های این فرم پر شده است.',
  invalid: 'این لینک معتبر نیست یا فرم در دسترس نیست.',
  rateLimited: 'تعداد درخواست‌ها زیاد است؛ چند دقیقه بعد دوباره تلاش کنید.',
  uploading: 'در حال بارگذاری…',
  upload: 'انتخاب فایل',
  remove: 'حذف',
  useMyLocation: 'استفاده از موقعیت فعلی من',
  locating: 'در حال یافتن موقعیت…',
  locationDenied: 'دسترسی به موقعیت داده نشد؛ نشانی را دستی بنویسید.',
  latitude: 'عرض جغرافیایی',
  longitude: 'طول جغرافیایی',
  locationDescription: 'نشانی یا نزدیک‌ترین نشانه',
  street: 'سرک / کوچه',
  district: 'ناحیه',
  city: 'شهر',
  province: 'ولایت',
  previewNotice: 'پیش‌نمایش — هیچ پاسخی ثبت نمی‌شود.',
  previewSubmitted: 'پیش‌نمایش تمام شد؛ پاسخی ذخیره نشد.',
  language: 'زبان',
  selectedCount: (count) => `${count} مورد انتخاب شد`,
};

const ENGLISH_RESPONDENT: RespondentStrings = {
  next: 'Next',
  previous: 'Back',
  submit: 'Submit',
  submitting: 'Submitting…',
  start: 'Start',
  required: 'Required',
  optional: 'Optional',
  other: 'Other',
  otherPlaceholder: 'Type your answer…',
  yes: 'Yes',
  no: 'No',
  choose: 'Choose…',
  pageOf: (page, total) => `Page ${page} of ${total}`,
  errors: {
    REQUIRED: 'This question is required.',
    TOO_SHORT: 'Your answer is too short.',
    TOO_LONG: 'Your answer is too long.',
    TOO_SMALL: 'The number is too small.',
    TOO_LARGE: 'The number is too large.',
    TOO_FEW: 'Please choose more options.',
    TOO_MANY: 'Please choose fewer options.',
    INVALID_EMAIL: 'Please enter a valid email address.',
    INVALID_PHONE: 'Please enter a valid phone number.',
    INVALID_URL: 'Please enter a valid website address.',
    INVALID_DATE: 'Please enter a valid date.',
    INVALID_TIME: 'Please enter a valid time.',
    INVALID_CHOICE: 'This option is not valid.',
    INVALID_FILE: 'This file was not accepted (type or size).',
    INVALID_VALUE: 'This value is not valid.',
  },
  fixErrors: 'Please fix the highlighted answers.',
  submitFailed: 'Your answers could not be sent. They are kept here — please try again.',
  retry: 'Try again',
  answersKept: 'Your answers are kept on this device.',
  closed: 'This form is no longer accepting responses.',
  notYetOpen: 'This form is not open yet.',
  expired: 'The deadline for this form has passed.',
  limitReached: 'This form has reached its response limit.',
  invalid: 'This link is not valid or the form is unavailable.',
  rateLimited: 'Too many requests. Please try again in a few minutes.',
  uploading: 'Uploading…',
  upload: 'Choose file',
  remove: 'Remove',
  useMyLocation: 'Use my current location',
  locating: 'Finding your location…',
  locationDenied: 'Location access was not granted; please type the address.',
  latitude: 'Latitude',
  longitude: 'Longitude',
  locationDescription: 'Address or nearest landmark',
  street: 'Street',
  district: 'District',
  city: 'City',
  province: 'Province',
  previewNotice: 'Preview — no response will be recorded.',
  previewSubmitted: 'Preview finished; nothing was saved.',
  language: 'Language',
  selectedCount: (count) => `${count} selected`,
};

export const RESPONDENT_STRINGS: Record<FormLanguage, RespondentStrings> = {
  fa: DARI_RESPONDENT,
  ps: DARI_RESPONDENT,
  en: ENGLISH_RESPONDENT,
};
