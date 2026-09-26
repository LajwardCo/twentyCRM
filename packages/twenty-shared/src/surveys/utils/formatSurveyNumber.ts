import { type FormLanguage } from '../types/FormDefinition';

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export const formatSurveyNumber = (
  value: number | string,
  language: FormLanguage,
): string =>
  language === 'en'
    ? String(value)
    : String(value).replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
