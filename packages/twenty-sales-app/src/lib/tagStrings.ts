// Every user-facing string of the lead-tags feature, kept out of strings.ts so
// this feature's block cannot collide with another branch's.
export const TTAG = {
  nav: 'برچسب‌ها',
  title: 'برچسب‌ها',
  sectionTitle: 'برچسب‌ها',
  addTag: 'برچسب',
  addTagTitle: 'برچسب‌های این لید',
  noTags: 'هنوز برچسبی نزده‌اید',
  remove: 'برداشتن برچسب',

  // picker
  searchOrCreate: 'جستجو یا ساخت برچسب…',
  noMatches: 'برچسبی پیدا نشد',
  createNamed: 'ساخت برچسب',
  create: 'ساختن',
  back: 'بازگشت',
  creating: 'در حال ساخت…',
  mineGroup: 'برچسب‌های شخصی من',
  publicGroup: 'برچسب‌های عمومی',

  // editor
  name: 'نام برچسب',
  color: 'رنگ',
  visibility: 'نمایش',
  personal: 'شخصی',
  public: 'عمومی',
  personalHint: 'فقط خودتان این برچسب را می‌بینید.',
  publicHint: 'همهٔ همکاران این برچسب را می‌بینند و می‌توانند استفاده کنند.',
  publishWarning: 'با عمومی‌کردن، نام این برچسب برای همهٔ همکاران نمایان می‌شود.',

  // manage screen
  newTag: 'برچسب جدید',
  editTag: 'ویرایش برچسب',
  save: 'ذخیره',
  mineSection: 'برچسب‌های شخصی من',
  publicSection: 'برچسب‌های عمومی',
  emptyMine: 'برچسب شخصی ندارید.',
  emptyPublic: 'برچسب عمومی وجود ندارد.',
  leadsCount: 'لید',
  showLeads: 'نمایش لیدها',
  deleteTag: 'حذف برچسب',
  confirmDelete: 'این برچسب از همهٔ لیدها برداشته و حذف شود؟',
  createdBy: 'ساخته‌شده توسط',
  notReady: 'سیستم برچسب‌ها هنوز روی این سرور فعال نشده است.',
  loadFailed: 'بارگذاری برچسب‌ها ناموفق بود.',

  // filter
  fTags: 'برچسب',

  // validation
  errEmpty: 'نام برچسب را بنویسید.',
  errTooLong: 'نام برچسب حداکثر ۳۰ حرف باشد.',
  errDuplicate: 'برچسبی با این نام وجود دارد.',
  errGeneric: 'عملیات ناموفق بود. دوباره تلاش کنید.',

  colors: {
    GRAY: 'خاکستری',
    RED: 'قرمز',
    ORANGE: 'نارنجی',
    YELLOW: 'زرد',
    GREEN: 'سبز',
    TEAL: 'فیروزه‌ای',
    BLUE: 'آبی',
    PURPLE: 'بنفش',
    PINK: 'صورتی',
  } as Record<string, string>,
};
