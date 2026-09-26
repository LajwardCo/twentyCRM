import {
  type FormDefinition,
  type FormLanguage,
  type LocalizedText,
  SURVEY_RTL_LANGUAGES,
  pickLocalizedText,
} from '@shared/surveys';

import { toPersianDigits } from '../jalali';

// Text of a form in the respondent's language, falling back to the form's
// other languages so a missing translation never shows an empty label.
export const formText = (
  text: LocalizedText | undefined,
  definition: FormDefinition,
  language: FormLanguage,
): string => pickLocalizedText(text, language, definition.languages);

export const directionOf = (language: FormLanguage): 'rtl' | 'ltr' =>
  SURVEY_RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr';

export const formatNumberFor = (
  value: number | string,
  language: FormLanguage,
): string => (language === 'en' ? String(value) : toPersianDigits(String(value)));

// Sets one language's value without touching the others.
export const withText = (
  text: LocalizedText | undefined,
  language: FormLanguage,
  value: string,
): LocalizedText => ({ ...(text ?? {}), [language]: value });
