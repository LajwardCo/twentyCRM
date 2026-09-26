import {
  type FormAudience,
  type FormDefinition,
  type FormLanguage,
  analysePrintability,
  formatSurveyNumber,
  pickLocalizedText,
} from '@shared/surveys';

// "3. Business name، 7. Phone" — names the questions a server rejection is
// about, because they may sit on a screen the respondent has already left.
export const summariseQuestions = (
  definition: FormDefinition,
  questionIds: string[],
  { audience, language }: { audience: FormAudience; language: FormLanguage },
): string => {
  const numbering = analysePrintability(definition, { audience, language }).numbering;
  const wanted = new Set(questionIds);
  const names: string[] = [];

  for (const page of definition.pages) {
    for (const item of page.items) {
      if (item.kind !== 'question' || !wanted.has(item.id)) continue;

      const label = pickLocalizedText(item.label, language, definition.languages);
      const number = numbering[item.id];

      names.push(number === undefined ? label : `${formatSurveyNumber(number, language)}. ${label}`);
    }
  }

  return names.join(language === 'en' ? ', ' : '، ');
};
