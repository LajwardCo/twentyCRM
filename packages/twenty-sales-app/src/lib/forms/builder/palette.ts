import {
  type DisplayBlock,
  type FormDefinition,
  type FormItem,
  type FormLanguage,
  type QuestionType,
  STAFF_ONLY_QUESTION_TYPES,
  createQuestion,
  generateSurveyId,
  pickLocalizedText,
} from '@shared/surveys';

// What the builder's "add" palette offers, grouped the way staff think about
// fields rather than by engine type.

export type BlockKind = 'section' | DisplayBlock['kind'];

export type PaletteEntry =
  | { key: string; kind: 'question'; type: QuestionType }
  | { key: string; kind: BlockKind };

export type PaletteGroupKey =
  | 'text'
  | 'choice'
  | 'dateNumber'
  | 'scales'
  | 'contact'
  | 'display'
  | 'staff';

const question = (type: QuestionType): PaletteEntry => ({ key: type, kind: 'question', type });
const block = (kind: BlockKind): PaletteEntry => ({ key: kind, kind });

export const PALETTE_GROUPS: { key: PaletteGroupKey; entries: PaletteEntry[] }[] = [
  { key: 'text', entries: ['short_text', 'long_text', 'email', 'phone', 'website'].map((type) => question(type as QuestionType)) },
  { key: 'choice', entries: ['single_choice', 'multi_choice', 'dropdown', 'yes_no'].map((type) => question(type as QuestionType)) },
  { key: 'dateNumber', entries: ['number', 'date', 'time', 'datetime'].map((type) => question(type as QuestionType)) },
  { key: 'scales', entries: [question('rating'), question('opinion_scale')] },
  { key: 'contact', entries: ['address', 'location', 'file', 'consent'].map((type) => question(type as QuestionType)) },
  { key: 'display', entries: ['section', 'heading', 'paragraph', 'image', 'divider'].map((kind) => block(kind as BlockKind)) },
  { key: 'staff', entries: [...STAFF_ONLY_QUESTION_TYPES].map((type) => question(type)) },
];

export const createPaletteItem = (
  entry: PaletteEntry,
  language: FormLanguage,
): FormItem => {
  if (entry.kind === 'question') return createQuestion(entry.type, language);
  if (entry.kind === 'section') return { kind: 'section', id: generateSurveyId('s'), title: {} };

  return { kind: entry.kind, id: generateSurveyId('b'), text: {} };
};

export const findPaletteEntry = (key: string): PaletteEntry | undefined =>
  PALETTE_GROUPS.flatMap((group) => group.entries).find((entry) => entry.key === key);

// The text staff see for an item in lists and pickers.
export const itemText = (item: FormItem, definition: FormDefinition): string => {
  const languages = definition.languages;
  const language = languages[0] ?? 'fa';

  if (item.kind === 'question') return pickLocalizedText(item.label, language, languages);
  if (item.kind === 'section') return pickLocalizedText(item.title, language, languages);

  return pickLocalizedText(item.text, language, languages);
};

const TYPE_GLYPHS: Record<QuestionType, string> = {
  short_text: 'Aa',
  long_text: '¶',
  number: '#',
  email: '@',
  phone: '☎',
  website: '⌘',
  single_choice: '◉',
  multi_choice: '☑',
  dropdown: '▾',
  yes_no: '±',
  date: '▦',
  time: '◷',
  datetime: '▦◷',
  rating: '★',
  opinion_scale: '⋯',
  address: '⌂',
  location: '⌖',
  file: '⇪',
  consent: '✓',
  crm_company: 'Co',
  crm_contact: 'Ct',
  crm_lead: 'Ld',
};

const BLOCK_GLYPHS: Record<BlockKind, string> = {
  section: '§',
  heading: 'H',
  paragraph: '≡',
  image: '▣',
  divider: '—',
};

export const glyphFor = (entry: PaletteEntry | FormItem): string =>
  entry.kind === 'question'
    ? TYPE_GLYPHS[entry.type]
    : BLOCK_GLYPHS[entry.kind];
