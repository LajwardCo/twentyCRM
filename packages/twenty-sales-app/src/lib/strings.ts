// All UI text in Dari (Afghan Persian). Single-language app by design.
export const T = {
  appName: 'شرکت خدمات تکنالوژی همگان',
  brand: 'همگان',
  brandSub: 'CRM',

  // auth
  signInTitle: 'ورود به حساب',
  signInSub: 'با حساب CRM خود وارد شوید',
  email: 'ایمیل',
  password: 'رمز عبور',
  signIn: 'ورود',
  signingIn: 'در حال ورود…',
  signOut: 'خروج',
  loginFailed: 'ورود ناموفق بود',

  // tabs
  tabToday: 'امروز',
  tabLeads: 'لیدها',
  tabNew: 'ثبت لید',

  // greetings
  goodMorning: 'صبح بخیر',
  goodAfternoon: 'چاشت بخیر',
  goodEvening: 'شام بخیر',

  // today
  todayTasks: 'کارهای امروز',
  overdue: 'عقب‌مانده',
  today: 'امروز',
  upcoming: 'پیش‌رو',
  doneNow: 'انجام شد',
  ofTasks: 'وظیفه',
  nothingToday: 'امروز کاری باقی نمانده 🎉',
  noLead: 'بدون لید',
  due: 'موعد',
  markDone: 'انجام شد',
  allCaughtUp: 'همه کارها انجام شده',

  // leads list
  leads: 'لیدها',
  searchLeads: 'جستجوی لید…',
  myLeads: 'لیدهای من',
  allLeads: 'همه لیدها',
  noLeadsFound: 'لیدی یافت نشد',
  noContact: 'بدون شخص تماس',

  // new lead form
  newLead: 'ثبت لید جدید',
  company: 'شرکت',
  companyName: 'نام شرکت',
  contactPerson: 'شخص تماس',
  firstName: 'نام',
  lastName: 'تخلص',
  phone: 'شماره تلفن',
  emailOptional: 'ایمیل (اختیاری)',
  qualification: 'ارزیابی',
  temperature: 'میزان علاقمندی',
  hot: 'داغ',
  warm: 'گرم',
  cold: 'سرد',
  leadSource: 'منبع لید',
  firstContact: 'تماس اول',
  firstContactHint: 'چه اتفاق افتاد؟ (یادداشت تماس یا بازدید)',
  firstContactPlaceholder:
    'مثلاً: از دفتر بازدید کردیم، با مدیر صحبت شد، به دمو علاقمند است…',
  when: 'چه وقت',
  followUp: 'پیگیری',
  scheduleFollowUp: 'تعیین وظیفهٔ پیگیری',
  followUpWhat: 'چه کاری انجام شود؟',
  followUpPlaceholder: 'مثلاً: تماس برای تعیین وقت دمو',
  registerLead: 'ثبت لید',
  saving: 'در حال ثبت…',
  creatingCompany: 'ایجاد شرکت…',
  creatingContact: 'ایجاد شخص تماس…',
  creatingLead: 'ایجاد لید…',
  savingFirstContact: 'ثبت تماس اول…',
  schedulingFollowUp: 'ثبت پیگیری…',
  stepFailed: 'ناموفق بود',

  // quick follow-up chips
  tomorrowMorning: 'فردا صبح',
  inThreeDays: '۳ روز بعد',
  nextWeek: 'هفته بعد',
  customTime: 'زمان دلخواه',

  // lead detail
  lead: 'لید',
  stage: 'مرحله',
  owner: 'مسئول',
  call: 'تماس',
  sms: 'پیامک',
  whatsapp: 'واتساپ',
  emailAction: 'ایمیل',
  aiSection: 'دستیار هوشمند',
  summarize: 'خلاصه لید',
  callScript: 'اسکریپت تماس',
  askAi: 'گفتگو با AI',
  copy: 'کاپی',
  copied: 'کاپی شد ✓',
  addNote: 'یادداشت جدید',
  notePlaceholder: 'چه اتفاق افتاد؟ (در یادداشت‌های لید ذخیره می‌شود)',
  saveNote: 'ذخیره یادداشت',
  newFollowUp: 'پیگیری جدید',
  addFollowUp: 'ثبت پیگیری',
  history: 'تاریخچه',
  noActivity: 'هنوز فعالیتی ثبت نشده',
  note: 'یادداشت',
  task: 'وظیفه',
  done: 'انجام شده',
  todo: 'در انتظار',
  loadFailed: 'بارگذاری ناموفق بود',

  // whatsapp modal
  sendWhatsapp: 'ارسال واتساپ',
  freeText: 'متن آزاد',
  template: 'قالب',
  message: 'پیام',
  freeTextHint:
    'متن آزاد فقط در پنجرهٔ ۲۴ ساعتهٔ مکالمه کار می‌کند؛ در غیر آن از قالب استفاده کنید.',
  selectTemplate: 'یک قالب انتخاب کنید…',
  variable: 'متغیر',
  send: 'ارسال',
  sending: 'در حال ارسال…',
  sent: 'ارسال شد ✓',
  sendFailed: 'ارسال ناموفق بود',
  close: 'بستن',

  // chat
  chatEmpty:
    'هر چیزی دربارهٔ این لید بپرسید — تاریخچه، قدم بعدی، نحوهٔ معرفی محصول، پاسخ به اعتراض‌ها…',
  chatPlaceholder: 'دربارهٔ این لید بپرسید…',
  thinking: 'در حال فکر کردن…',
  aiTimeout: 'هوش مصنوعی به موقع پاسخ نداد. دوباره تلاش کنید.',
  sendFailedChat: 'ارسال پیام ناموفق بود',
};

export const STAGE_LABELS: Record<string, string> = {
  NEW_LEAD: 'لید جدید',
  FOLLOWING_UP: 'در حال پیگیری',
  DEMO_SCHEDULED: 'دمو تعیین شده',
  DEMO_NEGOTIATION: 'دمو و مذاکره',
  CONTRACT_SENT: 'قرارداد ارسال شده',
  SIGNED_AWAITING_PAYMENT: 'امضا شده (منتظر پرداخت)',
  PAID_AWAITING_TRAINING: 'پرداخت شده (منتظر آموزش)',
  IN_TRAINING: 'در حال آموزش',
  ACTIVE_CUSTOMER: 'مشتری فعال',
  LOST_MISSED: 'از دست رفته',
};

export const SOURCE_LABELS: Record<string, string> = {
  FIELD: 'بازدید ساحوی',
  WHATSAPP: 'واتساپ',
  TELEGRAM: 'تلگرام',
  FACEBOOK: 'فیسبوک',
  REFERRAL: 'معرفی',
  OTHER: 'سایر',
};

export const TASK_TYPE_LABELS: Record<string, string> = {
  CALL: 'تماس',
  MEETING: 'جلسه',
  DEMO: 'دمو',
  VISIT: 'بازدید',
  OTHER: 'دیگر',
};

export const TEMP_LABELS: Record<string, string> = {
  HOT: '🔥 داغ',
  WARM: '🌤 گرم',
  COLD: '❄️ سرد',
};

export const stageLabelFa = (value: string | null): string =>
  value ? (STAGE_LABELS[value] ?? value) : '—';

// reports + lead enrichment (added with the reports/pricing build)
export const T2 = {
  reports: 'گزارش‌ها',
  thisWeek: 'این هفته',
  thisMonth: 'این ماه',
  threeMonths: '۳ ماه',
  me: 'من',
  team: 'تیم',
  leadsRegistered: 'لید ثبت‌شده',
  tasksDone: 'وظیفه انجام‌شده',
  activeCustomers: 'مشتری فعال',
  openPipelineValue: 'ارزش قیف باز',
  registrationsTrend: 'روند ثبت لید',
  byStage: 'به تفکیک مرحله',
  bySource: 'به تفکیک منبع',
  byOwner: 'به تفکیک فروشنده',
  byTemperature: 'به تفکیک علاقمندی',
  count: 'تعداد',
  value: 'ارزش',
  seller: 'فروشنده',
  noData: 'داده‌ای در این دوره نیست',

  openTasks: 'وظایف باز',
  companySection: 'شرکت',
  showContacts: 'مخاطبین شرکت',
  hideContacts: 'بستن مخاطبین',
  employees: 'تعداد کارمندان',
  website: 'ویب‌سایت',
  addressLbl: 'آدرس',
  businessType: 'نوع فعالیت',
  productsServices: 'محصولات/خدمات',
  metaSection: 'متادیتا',
  referrerLbl: 'معرف',
  commission: 'کمیسیون',
  marketerLbl: 'بازاریاب',
  registeredBy: 'ثبت‌کننده',
  pricingSection: 'قیمت‌گذاری',
  dealProducts: 'محصولات معامله',
  addProduct: 'افزودن محصول',
  productLbl: 'محصول',
  quantityLbl: 'تعداد',
  installPrice: 'قیمت نصب',
  annualPrice: 'قیمت سالانه',
  discount: 'تخفیف',
  quotations: 'پیشنهادهای قیمت',
  quoteNumber: 'شماره',
  validUntil: 'اعتبار تا',
  agreedPrice: 'قیمت توافقی',
  noPricing: 'هنوز محصول یا پیشنهاد قیمتی ثبت نشده',
  total: 'مجموع',
};

// catalog management: Product / Package / Pricing Version / Discount Rule
export const T3 = {
  catalog: 'کاتالوگ',
  catalogSub: 'مدیریت محصولات، بسته‌ها، نسخه‌های قیمت‌گذاری و قوانین تخفیف',
  productsTab: 'محصولات',
  discountRulesTab: 'قوانین تخفیف',
  newProduct: 'محصول جدید',
  editProduct: 'ویرایش محصول',
  nameLbl: 'نام *',
  baseInstallPriceLbl: 'قیمت نصب پایه (؋)',
  baseAnnualPriceLbl: 'قیمت سالانه پایه (؋)',
  maxDiscountPercentLbl: 'حداکثر درصد تخفیف',
  pricingModelLbl: 'مدل قیمت‌گذاری',
  pricingFactorNotesLbl: 'یادداشت عوامل قیمت‌گذاری',
  isSellableLbl: 'قابل فروش',
  packagesSection: 'بسته‌ها',
  newPackage: 'بسته جدید',
  editPackage: 'ویرایش بسته',
  statusLbl: 'وضعیت',
  allowsCustomPricingLbl: 'اجازه قیمت‌گذاری سفارشی',
  notesLbl: 'یادداشت',
  pricingVersionsSection: 'نسخه‌های قیمت‌گذاری',
  newPricingVersion: 'نسخه جدید',
  activeVersionBadge: 'فعال',
  deactivatedVersionNote: 'ثبت این نسخه، نسخه فعال فعلی این بسته را غیرفعال می‌کند.',
  effectiveFromLbl: 'مؤثر از',
  currencyCodeLbl: 'کد ارز',
  isActiveLbl: 'فعال',
  version: 'نسخه',
  newDiscountRule: 'قانون تخفیف جدید',
  editDiscountRule: 'ویرایش قانون تخفیف',
  appliesToProductLbl: 'برای محصول',
  conditionTypeLbl: 'نوع شرط',
  conditionMinQuantityLbl: 'حداقل تعداد شرط',
  conditionSiblingProductLbl: 'محصول همراه (باندل)',
  discountTypeLbl: 'نوع تخفیف',
  discountPercentValueLbl: 'درصد تخفیف',
  discountFixedAmountLbl: 'مبلغ تخفیف (؋)',
  noProducts: 'هنوز محصولی ثبت نشده — اولین را اضافه کنید',
  noPackages: 'هنوز بسته‌ای برای این محصول ثبت نشده',
  noPricingVersions: 'هنوز نسخه قیمتی برای این بسته ثبت نشده',
  noDiscountRules: 'هنوز قانون تخفیفی ثبت نشده',
  save: 'ذخیره',
  cancel: 'انصراف',
  edit: 'ویرایش',
  back: 'بازگشت',
};

export const CONDITION_TYPE_LABELS: Record<string, string> = {
  ALWAYS: 'همیشه',
  MIN_QUANTITY: 'حداقل تعداد',
  SIBLING_PRODUCT_PURCHASED: 'با خرید محصول همراه (باندل)',
};

export const DISCOUNT_TYPE_LABELS: Record<string, string> = {
  PERCENTAGE: 'درصدی',
  FIXED_AMOUNT: 'مبلغ ثابت',
};

export const PRICING_MODEL_LABELS: Record<string, string> = {
  FLAT: 'ثابت',
  PER_FACTOR: 'بر اساس عامل',
};

export const CATALOG_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'فعال',
  ARCHIVED: 'بایگانی‌شده',
};

export const MARKETER_LABELS: Record<string, string> = {
  ALAVI: 'مصطفی علوی',
  SHABAB: 'نذیراحمد شباب',
  NOORZAI: 'سهراب نورزایی',
};

export const PARTNER_TYPE_LABELS: Record<string, string> = {
  MARKETER: 'بازاریاب',
  SELLER: 'فروشنده',
  PARTNER: 'شریک',
};

export const LINE_STATUS_LABELS: Record<string, string> = {
  QUOTED: 'پیشنهاد شده',
  CONTRACTED: 'قرارداد شده',
  PAID: 'پرداخت شده',
  DELIVERED: 'تحویل شده',
};

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'پیش‌نویس',
  SENT: 'ارسال شده',
  ACCEPTED: 'پذیرفته شده',
  EXPIRED: 'منقضی',
  CONVERTED: 'قرارداد شده',
};
