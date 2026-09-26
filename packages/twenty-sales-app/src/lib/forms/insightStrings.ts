import { toPersianDigits } from '../jalali';

// Dari UI text for survey insights and campaigns. Kept apart from
// surveyStrings.ts so the insights/campaign screens can evolve on their own.

const n = (value: number) => toPersianDigits(value);

export const TINS = {
  // insights panel
  loading: 'در حال محاسبه…',
  loadError: 'بارگذاری بینش‌ها ناموفق بود.',
  retry: 'تلاش دوباره',
  noResponses: 'هنوز پاسخی برای این فرم ثبت نشده است.',
  noMatch: 'هیچ پاسخی با این فیلترها پیدا نشد.',
  filters: 'فیلترها',
  version: 'نسخه',
  allVersions: 'همهٔ نسخه‌ها',
  versionN: (version: number) => `نسخهٔ ${n(version)}`,
  allCampaigns: 'همهٔ کمپاین‌ها',
  noCampaign: 'بدون کمپاین',
  from: 'از تاریخ',
  to: 'تا تاریخ',
  clearFilters: 'پاک کردن فیلترها',
  spamNote: (count: number) =>
    count === 0
      ? 'پاسخ‌های هرزنامه در هیچ عددی شمرده نمی‌شوند.'
      : `${n(count)} پاسخ هرزنامه از همهٔ اعداد کنار گذاشته شد.`,

  // KPIs
  completed: 'تکمیل‌شده',
  partial: 'ناتمام',
  partialN: (count: number) => `(${n(count)} ناتمام)`,
  total: 'مجموع',
  byChannel: 'بر اساس کانال',
  uniqueLeads: 'لیدهای یکتا',
  conversion: 'نرخ تبدیل به لید',
  conversionHint: (leads: number, completed: number) =>
    `${n(leads)} لید از ${n(completed)} پاسخ تکمیل‌شده`,
  leadsHint: 'هر لید یک بار شمرده می‌شود، حتی اگر چند پاسخ به آن وصل باشد.',
  responsesWithLead: (count: number) => `${n(count)} پاسخ به لید وصل است`,

  // over time
  overTime: 'پاسخ‌های تکمیل‌شده در هر هفته',
  overTimeHint: 'هفته از دوشنبه شروع می‌شود؛ تاریخ زیر هر ستون آغاز هفته است.',
  weekOf: (label: string, count: number) => `هفتهٔ ${label}: ${n(count)} پاسخ`,

  // per question
  questions: 'سؤال‌ها',
  questionsBasis: (count: number) =>
    `بر اساس ${n(count)} پاسخ تکمیل‌شده (پاسخ‌های ناتمام در آمار سؤال‌ها شمرده نمی‌شوند).`,
  unknownVersion: (count: number) =>
    `${n(count)} پاسخ به نسخه‌ای تعلق دارد که در دسترس نیست و کنار گذاشته شد.`,
  noQuestions: 'این فرم هنوز سؤال منتشرشده‌ای ندارد.',
  versionsOf: (versions: number[]) =>
    versions.length === 1
      ? `فقط در نسخهٔ ${n(versions[0])}`
      : `در نسخه‌های ${versions.map(n).join('، ')}`,
  answered: 'پاسخ داده',
  unanswered: 'بی‌پاسخ (نمایش داده شد، خالی ماند)',
  unansweredShort: 'بی‌پاسخ',
  skippedByLogic: 'رد شده طبق منطق فرم',
  skippedShort: 'رد شده با منطق',
  notInVersion: 'در نسخهٔ این پاسخ نبود',
  notInVersionShort: 'در نسخه نبود',
  notShownToChannel: 'فقط کارمندان — به پاسخ‌دهندهٔ آنلاین نشان داده نشد',
  notShownShort: 'مخصوص کارمند',
  ofResponses: (count: number, total: number) => `${n(count)} از ${n(total)}`,
  choiceBasis: (count: number) => `درصدها از ${n(count)} پاسخی که به این سؤال جواب دادند.`,
  multiBasis: (count: number) =>
    `هر پاسخ می‌تواند چند گزینه داشته باشد؛ درصدها از ${n(count)} پاسخی که جواب دادند.`,
  other: 'سایر (متن آزاد)',
  otherTexts: 'متن‌های «سایر»',
  showAll: (count: number) => `نمایش همه (${n(count)})`,
  showLess: 'نمایش کمتر',
  retiredChoice: 'در نسخهٔ جدید حذف شده',
  yes: 'بلی',
  no: 'نخیر',
  count: 'تعداد',
  min: 'کمترین',
  median: 'میانه',
  mean: 'میانگین',
  max: 'بیشترین',
  valuesN: (count: number) => `${n(count)} عدد`,
  latestAnswers: 'آخرین پاسخ‌ها',
  noAnswersYet: 'هنوز پاسخی ثبت نشده است.',

  // activity
  activity: 'فعالیت',
  byCampaign: 'بر اساس کمپاین',
  byCollector: 'بر اساس جمع‌آوری‌کننده',
  byCity: 'بر اساس شهر',
  byArea: 'بر اساس ناحیه',
  noCollector: 'بدون جمع‌آوری‌کننده (آنلاین)',
  noCity: 'ثبت نشده',
  unassigned: 'بدون مسئول',
  name: 'نام',
  leadStages: 'مرحلهٔ لیدهای وصل‌شده',
  noStage: 'بدون مرحله',
  noLeads: 'هنوز هیچ پاسخی به لید وصل نشده است.',

  // campaigns list
  campaignsTitle: 'کمپاین‌ها',
  campaignsSub: 'برنامه‌های جمع‌آوری نظرسنجی، پیشرفت و نتیجه',
  newCampaign: 'کمپاین جدید',
  noCampaigns: 'هنوز کمپاینی ساخته نشده است.',
  notProvisioned:
    'بخش کمپاین‌ها هنوز روی این سرور راه‌اندازی نشده است (اسکریپت provision-surveys.mjs).',
  campaignName: 'نام کمپاین',
  status: 'وضعیت',
  dates: 'تاریخ‌ها',
  city: 'شهر',
  progress: 'پیشرفت',
  formsCount: 'فرم‌ها',
  formsN: (count: number) => `${n(count)} فرم`,
  targetOf: (done: number, target: number) => `${n(done)} از ${n(target)}`,
  noTarget: (done: number) => `${n(done)} پاسخ (بدون هدف)`,
  progressBasis: 'پاسخ‌های تکمیل‌شده، بدون هرزنامه',
  searchCampaigns: 'جستجوی کمپاین…',
  allStatuses: 'همهٔ وضعیت‌ها',

  // create / edit
  createTitle: 'کمپاین جدید',
  description: 'توضیحات',
  startsAt: 'تاریخ شروع',
  endsAt: 'تاریخ پایان',
  create: 'ساختن کمپاین',
  creating: 'در حال ساختن…',
  nameRequired: 'نام کمپاین لازم است.',
  datesInvalid: 'تاریخ پایان نباید پیش از تاریخ شروع باشد.',
  saveFailed: 'ذخیره نشد. دوباره تلاش کنید.',
  save: 'ذخیرهٔ تغییرات',
  saving: 'در حال ذخیره…',
  saved: 'ذخیره شد',
  cancel: 'لغو',
  unsaved: 'تغییرات ذخیره‌نشده',
  readOnly: 'شما اجازهٔ ویرایش کمپاین‌ها را ندارید؛ فقط مشاهده.',
  notFound: 'این کمپاین پیدا نشد یا به آن دسترسی ندارید.',

  // detail sections
  details: 'مشخصات',
  areas: 'ناحیه‌ها',
  addArea: 'افزودن ناحیه',
  areaPlaceholder: 'نام ناحیه و Enter',
  removeArea: (area: string) => `حذف ناحیهٔ ${area}`,
  assignees: 'کارمندان مسئول',
  addAssignee: 'افزودن کارمند…',
  noMembers: 'کارمندی پیدا نشد.',
  target: 'هدف (تعداد پاسخ تکمیل‌شده)',
  channels: 'کانال‌ها',
  forms: 'فرم‌های این کمپاین',
  noForms: 'هنوز فرمی ساخته نشده است.',
  notPublished: 'منتشر نشده',
  attribution: 'کد ردیابی کمپاین',
  attributionHelp:
    'پاسخ‌های آنلاین با این کد به کمپاین نسبت داده می‌شوند — فقط برای فرم‌هایی که در بالا انتخاب شده‌اند و فقط تا وقتی وضعیت کمپاین «فعال» است. در غیر آن، پاسخ ثبت می‌شود ولی بدون کمپاین.',
  attributionInactive: 'کمپاین فعال نیست؛ این لینک‌ها فعلاً پاسخ را به کمپاین نسبت نمی‌دهند.',
  codePending: 'کد پس از ذخیره توسط سرور ساخته می‌شود.',
  exampleLinks: 'لینک نمونه برای هر فرم',
  noFormLinks: 'فرمی انتخاب نشده است.',
  copy: 'کپی',
  copied: 'کپی شد',
  unpublishedFormLink: 'این فرم هنوز منتشر نشده؛ لینک پس از انتشار کار می‌کند.',

  // progress
  progressTitle: 'پیشرفت و نتیجه',
  viewResponses: 'دیدن پاسخ‌های این کمپاین',
  targetProgress: 'پیشرفت نسبت به هدف',
  responsesTitle: 'پاسخ‌ها',
  visitsTitle: 'بازدیدها',
  visitsTotal: 'مجموع بازدیدها',
  visitsWithSurvey: 'بازدید با نظرسنجی',
  visitsWithoutSurvey: 'بازدید بدون نظرسنجی',
  staffVisitResponses: 'پاسخ تکمیل‌شدهٔ حضوری',
  surveysVsVisits: (surveys: number, visits: number) =>
    `${n(surveys)} بازدید از ${n(visits)} بازدید به یک پاسخ نظرسنجی وصل است`,
  leadsVisited: (count: number) => `${n(count)} لید یکتا بازدید شد`,
  noOutcome: 'بدون نتیجه',
  noVisits: 'هنوز بازدیدی برای این کمپاین ثبت نشده است.',
  visitsBy: 'بازدید بر اساس کارمند',
  responsesBy: 'پاسخ بر اساس کارمند',
  followUps: 'کارهای پیگیری روی لیدهای کمپاین',
  followUpsHint: 'همهٔ کارهای ثبت‌شده روی این لیدها به‌جز خودِ بازدیدها.',
  done: 'انجام‌شده',
  open: 'باز',
  noFollowUps: 'روی لیدهای این کمپاین کاری ثبت نشده است.',
  byOutcome: 'بر اساس نتیجهٔ بازدید',
  partialLoad: 'بخشی از اطلاعات بارگذاری نشد:',
  truncatedResponses: (count: number) =>
    `فقط ${n(count)} پاسخ اول بارگذاری شد؛ اعداد این صفحه همهٔ پاسخ‌ها را در بر نمی‌گیرند.`,
  truncatedVisits: (count: number) =>
    `فقط ${n(count)} بازدید اول بارگذاری شد؛ آمار بازدیدها ناقص است.`,
};
