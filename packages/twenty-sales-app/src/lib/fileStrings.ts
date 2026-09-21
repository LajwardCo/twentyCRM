// Every user-facing string of the Files manager / player feature, kept out of
// strings.ts so this feature's block cannot collide with another branch's.
export const TFILES = {
  nav: 'فایل‌ها',
  title: 'فایل‌ها',
  count: 'فایل',
  loadMore: 'بارگذاری بیشتر',
  loading: 'در حال بارگذاری…',
  noFiles: 'هنوز فایلی ثبت نشده است.',
  noMatches: 'فایلی با این فیلترها پیدا نشد.',
  clearAll: 'پاک کردن فیلترها',

  // columns
  colName: 'نام',
  colType: 'نوع',
  colTask: 'کار',
  colLead: 'لید',
  colUploader: 'ثبت‌کننده',
  colDate: 'تاریخ',

  // filters
  fType: 'نوع فایل',
  fKind: 'قالب',
  fName: 'نام فایل',
  fDate: 'تاریخ ثبت',
  kindAudio: 'صوتی',
  kindVideo: 'ویدیو',
  kindImage: 'عکس',
  kindPdf: 'PDF',
  kindOther: 'سایر',
  untyped: 'بدون نوع',

  // playback
  play: 'پخش',
  stop: 'توقف',
  nowPlaying: 'در حال پخش',
  autoAdvance: 'پخش پشت‌سرهم',
  unplayableHere: 'این مرورگر این قالب را پخش نمی‌کند؛ فایل را دانلود کنید یا با Chrome باز کنید.',
  noPreview: 'پیش‌نمایش برای این قالب در دسترس نیست.',
  fileUnavailable: 'فایل در دسترس نیست',
  reloadFile: 'بارگذاری دوباره',

  // viewer + detail
  open: 'باز کردن',
  download: 'دانلود',
  openTask: 'باز کردن کار',
  openLead: 'باز کردن لید',
  detailTitle: 'جزئیات فایل',
  name: 'نام فایل',
  type: 'نوع فایل',
  uploadedBy: 'ثبت‌کننده',
  uploadedAt: 'تاریخ ثبت',
  format: 'قالب',
  save: 'ذخیره',
  saved: 'ذخیره شد',
  saveFailed: 'ذخیره ناموفق بود',
  delete: 'حذف فایل',
  deleteConfirm: 'این فایل حذف شود؟ فایل از روی کار برداشته می‌شود.',
  deleted: 'فایل حذف شد',
  deleteFailed: 'حذف ناموفق بود',
  notFound: 'فایل پیدا نشد',
  backToFiles: 'فایل‌ها',

  // upload
  chooseType: 'نوع فایل',
  upload: 'آپلود',
  uploading: 'در حال آپلود…',
  selectedFile: 'فایل انتخاب‌شده',
  changeFile: 'تغییر فایل',
} as const;
