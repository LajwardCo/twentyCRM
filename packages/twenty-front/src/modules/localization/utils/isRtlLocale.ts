import { type APP_LOCALES } from 'twenty-shared/translations';
import { isDefined } from 'twenty-shared/utils';

type AppLocale = keyof typeof APP_LOCALES;

// Locales written right-to-left. Drives the document `dir` attribute so the
// whole UI mirrors for these languages (Arabic, Hebrew and Dari/Afghan Persian).
export const RTL_LOCALES: ReadonlySet<AppLocale> = new Set([
  'ar-SA',
  'he-IL',
  'fa-AF',
]);

export const isRtlLocale = (locale?: string | null): boolean =>
  isDefined(locale) && RTL_LOCALES.has(locale as AppLocale);
