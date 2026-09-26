import { type FormLanguage, type LocalizedText } from '../types/FormDefinition';

// Falls back through the given languages so a missing translation shows the
// default-language text instead of an empty label.
export const pickLocalizedText = (
  text: LocalizedText | undefined,
  language: FormLanguage,
  fallbackLanguages: FormLanguage[] = [],
): string => {
  if (text === undefined) {
    return '';
  }

  for (const candidate of [language, ...fallbackLanguages]) {
    const value = text[candidate];

    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }

  return '';
};
