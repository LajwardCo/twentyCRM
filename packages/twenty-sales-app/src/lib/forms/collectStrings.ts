import { type FormLanguage } from '@shared/surveys';

// Dari UI text for the collection screens (public page chrome aside, which
// lives in RESPONDENT_STRINGS), the print documents and the share panel.

export const TC = {
  // shared
  loading: 'در حال بارگذاری…',
  loadFailed: 'بارگذاری ناموفق بود.',
  retry: 'تلاش دوباره',
  notPublished: 'این فرم هنوز منتشر نشده است؛ پس از انتشار می‌توانید پاسخ جمع کنید.',
  openBuilder: 'رفتن به سازندهٔ فرم',
  noCollectPermission: 'اجازهٔ ثبت پاسخ برای این فرم را ندارید.',
  saveIncomplete: 'ذخیرهٔ ناتمام',
  savingIncomplete: 'در حال ذخیره…',
  submitResponse: 'ثبت پاسخ',
  staffCollectSub: 'ثبت پاسخ توسط کارمند (حضوری یا تلفنی)',
  savedIncomplete: 'پاسخ به‌صورت ناتمام در سرور ذخیره شد.',
  savedComplete: 'پاسخ در سرور ذخیره شد.',
  saveFailed: 'ذخیره نشد. پاسخ‌ها روی همین دستگاه نگه داشته شده‌اند؛ دوباره تلاش کنید.',
  fixAnswers: 'چند پاسخ را سرور نپذیرفت؛ موارد مشخص‌شده را اصلاح کنید.',
  unsavedEdits: 'تغییرات تازه فقط روی همین دستگاه است',
  discardDraft: 'پاک‌کردن پیش‌نویس',
  discardConfirm: 'پیش‌نویس این دستگاه پاک شود؟ پاسخ‌های ذخیره‌نشده از بین می‌روند.',
  restoredDraft: 'پیش‌نویس قبلی همین دستگاه بازیابی شد.',
  linkedTo: 'مرتبط با',
  version: (code: string) => `نسخهٔ ${code}`,
  // after save
  nextActions: 'قدم بعدی',
  openResponse: 'مشاهدهٔ پاسخ',
  linkLead: 'اتصال / ساخت سرنخ',
  scheduleFollowUp: 'برنامهٔ پیگیری',
  collectAnother: 'ثبت پاسخ دیگر',
  newVisit: 'ثبت بازدید دیگر',
  // field data
  fieldData: 'اطلاعات میدانی (کارمند)',
  buyingInterest: 'علاقه به خرید',
  interestUnknown: 'مشخص نیست',
  city: 'شهر',
  area: 'ساحه / ناحیه',
  location: 'موقعیت',
  captureGps: 'ثبت موقعیت GPS',
  capturingGps: 'در حال یافتن موقعیت…',
  gpsUnavailable: 'موقعیت در دسترس نیست؛ نشانی را دستی بنویسید.',
  gpsCaptured: (accuracy: string) => `موقعیت ثبت شد (دقت حدود ${accuracy} متر)`,
  clearLocation: 'حذف موقعیت',
  manualLocation: 'نشانی یا نزدیک‌ترین نشانه (دستی)',
  gpsHint: 'اجازهٔ موقعیت فقط با زدن دکمه خواسته می‌شود.',
  // staff files
  staffFilesNote:
    'فایل‌ها همین حالا بارگذاری می‌شوند و پس از ذخیرهٔ پاسخ، به‌عنوان پیوست آن ثبت می‌گردند.',
  attachFailed: 'پاسخ ذخیره شد، اما پیوست‌کردن فایل‌ها ناموفق بود؛ دوباره «ثبت» را بزنید.',
  // visit flow
  visitTitle: 'ثبت بازدید',
  visitSub: 'کسب‌وکار را پیدا کنید، نتیجهٔ بازدید را ثبت کنید و در صورت امکان نظرسنجی بگیرید',
  stepBusiness: 'کسب‌وکار',
  stepSurvey: 'نظرسنجی',
  stepOutcome: 'نتیجه',
  stepCollect: 'پاسخ‌ها',
  findBusiness: 'کسب‌وکار را جستجو کنید',
  addProspect: 'افزودن کسب‌وکار جدید',
  prospectName: 'نام کسب‌وکار',
  prospectCity: 'شهر',
  prospectContact: 'نام شخص تماس (اختیاری)',
  prospectPhone: 'شمارهٔ تماس (اختیاری)',
  createProspect: 'ثبت کسب‌وکار',
  creatingProspect: 'در حال ثبت…',
  changeBusiness: 'تغییر',
  duplicateCompanies: 'کسب‌وکارهای مشابه از قبل ثبت شده‌اند؛ اگر همین است، آن را انتخاب کنید:',
  chooseSurvey: 'کدام نظرسنجی؟',
  noSurvey: 'بدون نظرسنجی — فقط نتیجهٔ بازدید ثبت شود',
  noPublishedForms: 'هیچ فرم منتشرشده‌ای وجود ندارد.',
  campaignOptional: 'کمپاین (اختیاری)',
  noCampaign: 'بدون کمپاین',
  visitOutcome: 'نتیجهٔ بازدید',
  outcomeNeedsSurvey: 'برای «نظرسنجی انجام شد» باید یک نظرسنجی انتخاب شود.',
  visitNotes: 'یادداشت بازدید',
  continueToSurvey: 'ادامه به پرسش‌ها',
  saveVisit: 'ثبت بازدید',
  savingVisit: 'در حال ثبت بازدید…',
  visitSaved: 'بازدید ثبت شد.',
  visitSavedWithResponse: 'بازدید و پاسخ نظرسنجی ثبت شد.',
  visitFailed: 'ثبت بازدید ناموفق بود؛ اطلاعات روی همین دستگاه حفظ شده است.',
  next: 'بعدی',
  back: 'قبلی',
  interestSeparate: 'علاقه به خرید جدا از نتیجهٔ بازدید ثبت می‌شود.',
  // paper entry
  paperTitle: 'ورود پاسخ کاغذی',
  paperSub: 'پاسخ برگه‌های چاپی را با همان نسخه‌ای که چاپ شده بود وارد کنید',
  printedCode: 'کد چاپ‌شده در پایین برگه',
  printedCodeHint: 'مثلاً F1G46-v2',
  findByCode: 'یافتن',
  codeNotFound: 'نسخه‌ای با این کد پیدا نشد.',
  orPickForm: 'یا فرم و نسخه را انتخاب کنید',
  pickForm: 'فرم',
  pickVersion: 'نسخه',
  chooseForm: 'انتخاب فرم…',
  collectionDate: 'تاریخ تکمیل برگه',
  collector: 'جمع‌کننده',
  noCollector: 'نامشخص',
  paperReference: 'شمارهٔ برگه / مرجع',
  paperReferenceHint: 'مثلاً S-F1G46-v2-0007',
  duplicateReference: 'این شمارهٔ برگه قبلاً برای همین فرم ثبت شده است.',
  openExisting: 'مشاهدهٔ پاسخ موجود',
  transcriptionNotes: 'یادداشت واردکننده',
  enteredBy: (name: string) => `واردکننده: ${name}`,
  unclear: 'ناخوانا/نامشخص',
  unclearCount: (count: string) => `${count} پاسخ ناخوانا علامت خورد؛ پاسخ برای بررسی علامت‌گذاری می‌شود.`,
  unclearNote: (question: string) => `${question}: ناخوانا/نامشخص`,
  scansTitle: 'اسکن یا عکس برگه',
  scansHint: 'اسکن/عکس برگه را پیوست کنید تا بازبین بتواند مقایسه کند.',
  addScan: 'افزودن اسکن یا عکس',
  uploading: 'در حال بارگذاری…',
  scanAttached: 'پیوست شد',
  enterAnother: 'ورود برگهٔ دیگر',
  paperSavedHint: 'پاسخ ذخیره شد. اکنون اسکن برگه را پیوست کنید.',
  changeVersion: 'تغییر نسخه',
  // print
  printBlockedTitle: 'این فرم را فعلاً نمی‌توان چاپ کرد',
  printBlockedHint:
    'این قواعد به سؤال‌هایی وابسته‌اند که روی کاغذ نیستند. در تب «منطق» شرط را به سؤالی چاپ‌شدنی وصل کنید، یا مخاطب آن سؤال را «همه» بگذارید، یا نسخهٔ کارمندی را چاپ کنید.',
  printButton: 'چاپ',
  printDraftWatermark: 'پیش‌نویس — منتشر نشده',
  printNotFound: 'این نسخه پیدا نشد.',
  printCopies: (count: string) => `${count} نسخه`,
  responseNotFound: 'پاسخ پیدا نشد.',
  // share panel
  shareTitle: 'اشتراک‌گذاری و چاپ',
  publicLink: 'لینک عمومی',
  notPublishedShare: 'پس از انتشار، لینک عمومی و QR اینجا نمایش داده می‌شود.',
  copy: 'کپی',
  copied: 'کپی شد',
  downloadQr: 'دانلود QR',
  publicEnabled: 'لینک عمومی فعال است',
  publicDisabled: 'لینک عمومی غیرفعال است — فقط کارمندان و دعوت‌نامه‌ها',
  toggleFailed: 'تغییر وضعیت لینک ناموفق بود.',
  whatsapp: 'ارسال در واتس‌اپ',
  republishNote:
    'لینک همیشه آخرین نسخهٔ منتشرشده را نشان می‌دهد؛ کسی که فرم را باز کرده، همان نسخه‌ای را که شروع کرده تمام می‌کند.',
  campaignLinks: 'لینک‌های کمپاین',
  campaignLinksHint: 'فقط کمپاین‌های «فعال» که به این فرم وصل‌اند شمرده می‌شوند.',
  campaignInactive: 'غیرفعال — شمرده نمی‌شود',
  noCampaigns: 'کمپاینی به این فرم وصل نیست.',
  invitations: 'دعوت‌نامه‌های فردی',
  invitationsHint:
    'هر دعوت‌نامه یک لینک یک‌بارمصرف است. لینک فرستاده‌شده دلیل هویت نیست؛ پاسخ‌های دعوت‌نامه برای بررسی علامت می‌خورند.',
  invitationTargets: 'گیرندگان',
  targetKind: 'نوع',
  addTarget: 'افزودن',
  anonymousLinks: 'لینک بی‌نام',
  anonymousCount: 'تعداد لینک بی‌نام',
  expiresAt: 'تاریخ انقضا (اختیاری)',
  invitationCampaign: 'کمپاین (اختیاری)',
  createInvitations: 'ساخت دعوت‌نامه‌ها',
  creatingInvitations: 'در حال ساخت…',
  invitationsCreated:
    'این لینک‌ها فقط همین یک بار نمایش داده می‌شوند. همین حالا کپی کنید.',
  copyAll: 'کپی همه',
  noInviteTargets: 'حداقل یک گیرنده یا تعدادی لینک بی‌نام انتخاب کنید.',
  noInvitePermission: 'اجازهٔ ساخت دعوت‌نامه را ندارید.',
  printOptions: 'چاپ',
  copies: 'تعداد نسخه',
  sheetRefs: 'شمارهٔ برگه روی هر نسخه',
  includeQr: 'QR لینک آنلاین',
  staffVersion: 'نسخهٔ کارمندی (با سؤال‌های کارمندی)',
  openPrint: 'باز کردن نسخهٔ چاپی',
  kindCompany: 'شرکت',
  kindPerson: 'مخاطب',
  kindLead: 'سرنخ',
  remove: 'حذف',
  close: 'بستن',
  printCampaign: 'کمپاین روی برگه (اختیاری)',
  printDraft: 'چاپ پیش‌نویس (منتشرنشده)',
  publicLinkOff: 'لینک عمومی خاموش است؛ QR و لینک تا روشن‌کردن کار نمی‌کنند.',
  formNotOpen: 'فرم بسته یا بایگانی است؛ لینک‌ها فعلاً پاسخ نمی‌پذیرند.',
};

export type PrintChrome = {
  pageFooter: { page: string; of: string };
  oneOption: string;
  oneOrMore: string;
  other: string;
  dateHint: string;
  timeHint: string;
  sheetReference: string;
  instructionsTitle: string;
  scanToFill: string;
  campaign: string;
  campaignCode: string;
  required: string;
  skippedByLogic: string;
  notAnswered: string;
  street: string;
  district: string;
  city: string;
  province: string;
  meta: {
    form: string;
    version: string;
    source: string;
    collectedAt: string;
    enteredAt: string;
    collector: string;
    enteredBy: string;
    paperReference: string;
    completion: string;
    reviewNotes: string;
    interest: string;
    place: string;
  };
};

const DARI_PRINT: PrintChrome = {
  pageFooter: { page: 'صفحه', of: 'از' },
  oneOption: '(یک گزینه)',
  oneOrMore: '(یک یا چند گزینه)',
  other: 'سایر:',
  dateHint: 'روز / ماه / سال (هجری شمسی)',
  timeHint: 'ساعت : دقیقه',
  sheetReference: 'شمارهٔ برگه',
  instructionsTitle: 'رهنمایی',
  scanToFill: 'برای تکمیل آنلاین اسکن کنید',
  campaign: 'کمپاین',
  campaignCode: 'کد',
  required: 'الزامی',
  skippedByLogic: '(طبق منطق فرم رد شد)',
  notAnswered: '(بی‌پاسخ)',
  street: 'سرک / کوچه',
  district: 'ناحیه',
  city: 'شهر',
  province: 'ولایت',
  meta: {
    form: 'فرم',
    version: 'نسخه',
    source: 'منبع',
    collectedAt: 'تاریخ جمع‌آوری',
    enteredAt: 'تاریخ ورود',
    collector: 'جمع‌کننده',
    enteredBy: 'واردکننده',
    paperReference: 'شمارهٔ برگه',
    completion: 'وضعیت',
    reviewNotes: 'یادداشت بررسی',
    interest: 'علاقه به خرید',
    place: 'محل',
  },
};

const ENGLISH_PRINT: PrintChrome = {
  pageFooter: { page: 'Page', of: 'of' },
  oneOption: '(choose one)',
  oneOrMore: '(choose one or more)',
  other: 'Other:',
  dateHint: 'day / month / year',
  timeHint: 'hour : minute',
  sheetReference: 'Sheet reference',
  instructionsTitle: 'Instructions',
  scanToFill: 'Scan to fill in online',
  campaign: 'Campaign',
  campaignCode: 'Code',
  required: 'Required',
  skippedByLogic: '(skipped by form logic)',
  notAnswered: '(not answered)',
  street: 'Street',
  district: 'District',
  city: 'City',
  province: 'Province',
  meta: {
    form: 'Form',
    version: 'Version',
    source: 'Source',
    collectedAt: 'Collected',
    enteredAt: 'Entered',
    collector: 'Collector',
    enteredBy: 'Entered by',
    paperReference: 'Sheet reference',
    completion: 'Status',
    reviewNotes: 'Review notes',
    interest: 'Buying interest',
    place: 'Place',
  },
};

export const PRINT_CHROME: Record<FormLanguage, PrintChrome> = {
  fa: DARI_PRINT,
  ps: DARI_PRINT,
  en: ENGLISH_PRINT,
};

// Respondent-facing text the shared RESPONDENT_STRINGS do not cover.
export type PublicPageStrings = {
  loading: string;
  loadFailed: string;
  uploadExpired: string;
  unavailableTitle: string;
  honeypotLabel: string;
};

const DARI_PUBLIC: PublicPageStrings = {
  loading: 'در حال بارگذاری فرم…',
  loadFailed: 'فرم بارگذاری نشد. اتصال انترنت را بررسی کنید و دوباره تلاش کنید.',
  uploadExpired: 'مهلت یکی از فایل‌های بارگذاری‌شده تمام شده است؛ لطفاً آن را دوباره بارگذاری کنید.',
  unavailableTitle: 'فرم در دسترس نیست',
  honeypotLabel: 'این خانه را خالی بگذارید',
};

const ENGLISH_PUBLIC: PublicPageStrings = {
  loading: 'Loading the form…',
  loadFailed: 'The form could not be loaded. Check your connection and try again.',
  uploadExpired: 'One of your uploaded files has expired. Please upload it again.',
  unavailableTitle: 'Form unavailable',
  honeypotLabel: 'Leave this field empty',
};

export const PUBLIC_PAGE_STRINGS: Record<FormLanguage, PublicPageStrings> = {
  fa: DARI_PUBLIC,
  ps: DARI_PUBLIC,
  en: ENGLISH_PUBLIC,
};
