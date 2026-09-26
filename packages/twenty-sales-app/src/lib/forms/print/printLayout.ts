import {
  type DisplayBlock,
  type FormAudience,
  type FormDefinition,
  type FormLanguage,
  type MultiChoiceAnswer,
  OTHER_CHOICE_ID,
  type PrintAnalysis,
  type Question,
  type SingleChoiceAnswer,
  isItemAvailableTo,
  pickLocalizedText,
} from '@shared/surveys';

// Pure layout decisions for the A4 print documents (blank form and filled
// response). The components only draw what these return.

export const MAX_PRINT_COPIES = 200;

export type PrintOptions = {
  versionNumber: number | null;
  draft: boolean;
  copies: number;
  sheetRefs: boolean;
  qr: boolean;
  audience: FormAudience;
  embed: boolean;
  campaignId: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const flag = (params: URLSearchParams, name: string): boolean => {
  const value = params.get(name);

  return value === '1' || value === 'true' || (value === '' && params.has(name));
};

export const clampCopies = (value: number): number =>
  Number.isFinite(value) ? Math.min(MAX_PRINT_COPIES, Math.max(1, Math.floor(value))) : 1;

export const parsePrintOptions = (query: string): PrintOptions => {
  const params = new URLSearchParams(query);
  const version = Number(params.get('version'));
  const campaignId = params.get('campaign');

  return {
    versionNumber: Number.isInteger(version) && version > 0 ? version : null,
    draft: params.has('draft') && params.get('draft') !== '0',
    copies: clampCopies(Number(params.get('copies') ?? '1')),
    sheetRefs: flag(params, 'sheetRefs'),
    qr: flag(params, 'qr'),
    audience: params.get('audience') === 'staff' ? 'STAFF' : 'PUBLIC',
    embed: flag(params, 'embed'),
    campaignId: campaignId !== null && UUID.test(campaignId) ? campaignId : null,
  };
};

export const buildPrintQuery = (options: Partial<PrintOptions>): string => {
  const params = new URLSearchParams();

  if (options.draft === true) params.set('draft', '1');
  else if (options.versionNumber !== undefined && options.versionNumber !== null) {
    params.set('version', String(options.versionNumber));
  }
  if (options.copies !== undefined && options.copies > 1) {
    params.set('copies', String(clampCopies(options.copies)));
  }
  if (options.sheetRefs === true) params.set('sheetRefs', '1');
  if (options.qr === true) params.set('qr', '1');
  if (options.audience === 'STAFF') params.set('audience', 'staff');
  if (options.embed === true) params.set('embed', '1');
  if (options.campaignId !== undefined && options.campaignId !== null) {
    params.set('campaign', options.campaignId);
  }

  return params.toString();
};

// Pre-numbered sheet references, e.g. S-F1G46-v2-0001. Paper entry looks
// sheets up by this reference, so the format must never change.
export const sheetReference = (printCode: string, index: number): string =>
  `S-${printCode}-${String(index).padStart(4, '0')}`;

export const sheetReferences = (
  printCode: string | null,
  copies: number,
  enabled: boolean,
  startAt = 1,
): (string | null)[] =>
  Array.from({ length: clampCopies(copies) }, (_, index) =>
    enabled && printCode !== null && printCode !== ''
      ? sheetReference(printCode, startAt + index)
      : null,
  );

// A CSS string literal for generated content (the page footer). Everything
// outside letters/digits/space is hex-escaped, so user text can never close
// the string or the rule it sits in.
export const cssString = (text: string): string => {
  let out = '';

  for (const char of text.replace(/[\r\n\t]+/g, ' ')) {
    const safe = char === ' ' || /[\p{L}\p{N}]/u.test(char);

    out += safe ? char : `\\${(char.codePointAt(0) ?? 0).toString(16)} `;
  }

  return `"${out}"`;
};

export type ChoiceOptionView = { id: string; label: string };

export type AnswerArea =
  | { kind: 'choices'; multiple: boolean; options: ChoiceOptionView[]; other: string | null }
  | { kind: 'boxes'; values: number[]; minLabel: string; maxLabel: string }
  | { kind: 'yesno' }
  | { kind: 'consent'; text: string }
  | { kind: 'date' }
  | { kind: 'time' }
  | { kind: 'datetime' }
  | { kind: 'address' }
  | { kind: 'lines'; count: number };

export const answerLineCount = (question: Question): number =>
  Math.min(12, Math.max(1, Math.floor(question.print?.answerLines ?? 1)));

export const answerAreaFor = (
  question: Question,
  definition: FormDefinition,
  language: FormLanguage,
): AnswerArea => {
  const text = (value: Parameters<typeof pickLocalizedText>[0]) =>
    pickLocalizedText(value, language, definition.languages);
  const config = question.config;

  switch (question.type) {
    case 'single_choice':
    case 'dropdown':
    case 'multi_choice':
      return {
        kind: 'choices',
        multiple: question.type === 'multi_choice',
        options: (config.choices ?? []).map((choice) => ({ id: choice.id, label: text(choice.label) })),
        other: config.allowOther === true ? text(config.otherLabel) : null,
      };
    case 'rating': {
      const max = Math.min(20, Math.max(1, config.scaleMax ?? 5));

      return {
        kind: 'boxes',
        values: Array.from({ length: max }, (_, index) => index + 1),
        minLabel: text(config.scaleMinLabel),
        maxLabel: text(config.scaleMaxLabel),
      };
    }
    case 'opinion_scale': {
      const min = config.scaleMin ?? 0;
      const max = Math.min(min + 20, Math.max(min, config.scaleMax ?? 10));

      return {
        kind: 'boxes',
        values: Array.from({ length: max - min + 1 }, (_, index) => min + index),
        minLabel: text(config.scaleMinLabel),
        maxLabel: text(config.scaleMaxLabel),
      };
    }
    case 'yes_no':
      return { kind: 'yesno' };
    case 'consent':
      return { kind: 'consent', text: text(config.consentText) };
    case 'date':
      return { kind: 'date' };
    case 'time':
      return { kind: 'time' };
    case 'datetime':
      return { kind: 'datetime' };
    case 'address':
      return { kind: 'address' };
    default:
      return { kind: 'lines', count: answerLineCount(question) };
  }
};

export type PrintEntry =
  | { kind: 'section'; id: string; title: string; description: string; instruction: string | null }
  | { kind: 'block'; id: string; block: DisplayBlock; text: string; alternative: string | null }
  | {
      kind: 'question';
      id: string;
      question: Question;
      number: number;
      label: string;
      description: string;
      instruction: string | null;
      alternative: string | null;
    };

export type PrintPage = {
  id: string;
  title: string;
  description: string;
  entries: PrintEntry[];
  jumps: string[];
};

export const buildPrintPages = (
  definition: FormDefinition,
  audience: FormAudience,
  analysis: PrintAnalysis,
  language: FormLanguage,
): PrintPage[] => {
  const text = (value: Parameters<typeof pickLocalizedText>[0]) =>
    pickLocalizedText(value, language, definition.languages);

  return definition.pages
    .map((page) => {
      const entries: PrintEntry[] = [];

      for (const item of page.items) {
        if (!isItemAvailableTo(item, audience)) continue;

        if (item.kind === 'section') {
          entries.push({
            kind: 'section',
            id: item.id,
            title: text(item.title),
            description: text(item.description),
            instruction: analysis.instructions[item.id] ?? null,
          });
          continue;
        }

        if (item.kind === 'question') {
          const number = analysis.numbering[item.id];

          if (number === undefined) continue;

          entries.push({
            kind: 'question',
            id: item.id,
            question: item,
            number,
            label: text(item.label),
            description: text(item.description),
            instruction: analysis.instructions[item.id] ?? null,
            alternative: analysis.paperAlternatives[item.id] ?? null,
          });
          continue;
        }

        entries.push({
          kind: 'block',
          id: item.id,
          block: item,
          text: item.kind === 'image' ? text(item.imageAlt) : text(item.text),
          alternative: analysis.paperAlternatives[item.id] ?? null,
        });
      }

      return {
        id: page.id,
        title: text(page.title),
        description: text(page.description),
        entries,
        jumps: analysis.pageInstructions[page.id] ?? [],
      };
    })
    .filter((page) => page.entries.length > 0 || page.jumps.length > 0);
};

// Which boxes are ticked on a filled response.
export const selectedChoiceIds = (question: Question, value: unknown): string[] => {
  if (value === undefined || value === null) return [];

  switch (question.type) {
    case 'single_choice':
    case 'dropdown': {
      const choiceId = (value as SingleChoiceAnswer).choiceId;

      return typeof choiceId === 'string' ? [choiceId] : [];
    }
    case 'multi_choice':
      return Array.isArray((value as MultiChoiceAnswer).choiceIds)
        ? (value as MultiChoiceAnswer).choiceIds
        : [];
    case 'yes_no':
      return value === true ? ['yes'] : value === false ? ['no'] : [];
    case 'consent':
      return value === true ? ['yes'] : [];
    default:
      return [];
  }
};

export const otherTextOf = (value: unknown): string => {
  if (typeof value !== 'object' || value === null) return '';

  const other = (value as { otherText?: unknown; choiceIds?: unknown; choiceId?: unknown });
  const picked =
    other.choiceId === OTHER_CHOICE_ID ||
    (Array.isArray(other.choiceIds) && other.choiceIds.includes(OTHER_CHOICE_ID));

  return picked && typeof other.otherText === 'string' ? other.otherText : '';
};

export type FilledStatus = 'answered' | 'skipped' | 'unanswered';

export const filledStatus = (
  questionId: string,
  answers: Record<string, unknown>,
  skippedByLogic: string[],
): FilledStatus => {
  if (skippedByLogic.includes(questionId)) return 'skipped';

  const value = answers[questionId];

  return value === undefined || value === null || value === '' ? 'unanswered' : 'answered';
};
