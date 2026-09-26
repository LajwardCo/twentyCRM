import {
  type AnswerValue,
  type FormDefinition,
  type FormLanguage,
  type Question,
  answerToText,
  isAnswerPresent,
  pickLocalizedText,
} from '@shared/surveys';

// How one question stands in one response. "skipped" (the form's logic hid
// it) and "not in version" (the respondent's version never asked it) are kept
// apart from "unanswered" so reports never blame a respondent for a question
// they were not shown.
export type AnswerStatus = 'answered' | 'unanswered' | 'skipped' | 'not_in_version';

export type StoredAnswers = {
  answers: Record<string, AnswerValue | null | undefined>;
  skippedByLogic: string[];
};

export const classifyAnswer = (
  question: Question | undefined,
  response: StoredAnswers,
): AnswerStatus => {
  if (question === undefined) return 'not_in_version';
  if (isAnswerPresent(question, response.answers[question.id])) return 'answered';
  if (response.skippedByLogic.includes(question.id)) return 'skipped';

  return 'unanswered';
};

export type AnswerRow = {
  question: Question;
  status: AnswerStatus;
  text: string;
  staffOnly: boolean;
};

export type AnswerSection = {
  sectionId: string | null;
  title: string;
  rows: AnswerRow[];
};

export type AnswerPage = {
  pageId: string;
  title: string;
  sections: AnswerSection[];
};

// The response laid out like the version the respondent filled in: its pages,
// then its sections, in their original order.
export const buildAnswerLayout = (
  definition: FormDefinition,
  response: StoredAnswers,
  language?: FormLanguage,
): AnswerPage[] => {
  const lang = language ?? definition.languages[0] ?? 'fa';
  const text = (value: Parameters<typeof pickLocalizedText>[0]) =>
    pickLocalizedText(value, lang, definition.languages);

  return definition.pages.map((page) => {
    const sections: AnswerSection[] = [{ sectionId: null, title: '', rows: [] }];

    for (const item of page.items) {
      if (item.kind === 'section') {
        sections.push({ sectionId: item.id, title: text(item.title), rows: [] });
        continue;
      }

      if (item.kind !== 'question') continue;

      const status = classifyAnswer(item, response);

      sections[sections.length - 1].rows.push({
        question: item,
        status,
        text: status === 'answered' ? answerToText(item, response.answers[item.id], definition, lang) : '',
        staffOnly: item.audience === 'STAFF_ONLY' || item.type.startsWith('crm_'),
      });
    }

    return {
      pageId: page.id,
      title: text(page.title),
      sections: sections.filter((section) => section.rows.length > 0),
    };
  });
};

export const countAnswerStatuses = (
  pages: AnswerPage[],
): Record<AnswerStatus, number> => {
  const counts: Record<AnswerStatus, number> = {
    answered: 0,
    unanswered: 0,
    skipped: 0,
    not_in_version: 0,
  };

  for (const page of pages) {
    for (const section of page.sections) {
      for (const row of section.rows) counts[row.status] += 1;
    }
  }

  return counts;
};
