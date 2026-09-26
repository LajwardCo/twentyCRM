import {
  type FormDefinition,
  type FormLanguage,
  formatSurveyNumber,
  pickLocalizedText,
  toLatinDigits,
} from '@shared/surveys';

// Paper transcription helpers. An answer the transcriber cannot read is left
// empty (never guessed) and listed in paperReviewNotes for a reviewer.

export const withoutUnclear = (
  answers: Record<string, unknown>,
  unclearIds: Set<string>,
): Record<string, unknown> =>
  Object.fromEntries(Object.entries(answers).filter(([questionId]) => !unclearIds.has(questionId)));

export const buildPaperReviewNotes = ({
  definition,
  unclearIds,
  numbering,
  notes,
  language,
  unclearLine,
}: {
  definition: FormDefinition;
  unclearIds: Set<string>;
  numbering: Record<string, number>;
  notes: string;
  language: FormLanguage;
  unclearLine: (question: string) => string;
}): string => {
  const lines: string[] = [];

  for (const page of definition.pages) {
    for (const item of page.items) {
      if (item.kind !== 'question' || !unclearIds.has(item.id)) continue;

      const label = pickLocalizedText(item.label, language, definition.languages);
      const number = numbering[item.id];
      const name = number === undefined ? label : `${formatSurveyNumber(number, language)}. ${label}`;

      lines.push(`• ${unclearLine(name)}`);
    }
  }

  const trimmed = notes.trim();

  if (trimmed !== '') {
    if (lines.length > 0) lines.push('');
    lines.push(trimmed);
  }

  return lines.join('\n');
};

// Stored with Latin digits and single spaces so a sheet typed on a Dari
// keyboard ("S-F1G46-v2-۰۰۰۷") matches the printed reference.
export const normalizePaperReference = (value: string): string =>
  toLatinDigits(value).trim().replace(/\s+/g, ' ');

// ilike pattern that matches the reference exactly, ignoring case only.
export const exactIlikePattern = (value: string): string =>
  value.replace(/[\\%_]/g, (char) => `\\${char}`);

// "yyyy-mm-dd" from the date picker → ISO at local noon, so the stored
// timestamp never slips into the neighbouring day across time zones.
export const collectionDateToIso = (value: string): string | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);

  if (match === null) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const todayLocalDate = (now = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

// Sheet details typed before/alongside the answers; kept on the device with
// the answer draft so a reload mid-sheet loses nothing.
export type PaperMeta = {
  collectedDate: string;
  collectorId: string;
  paperReference: string;
  notes: string;
  unclearIds: string[];
};

export const emptyPaperMeta = (today: string): PaperMeta => ({
  collectedDate: today,
  collectorId: '',
  paperReference: '',
  notes: '',
  unclearIds: [],
});

export const parsePaperMeta = (raw: string | null, today: string): PaperMeta => {
  const empty = emptyPaperMeta(today);

  if (raw === null) return empty;

  try {
    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== 'object' || parsed === null) return empty;

    const value = parsed as Record<string, unknown>;
    const text = (key: keyof PaperMeta, fallback: string) =>
      typeof value[key] === 'string' ? (value[key] as string) : fallback;

    return {
      collectedDate: /^\d{4}-\d{2}-\d{2}/.test(text('collectedDate', '')) ? text('collectedDate', today) : today,
      collectorId: text('collectorId', ''),
      paperReference: text('paperReference', ''),
      notes: text('notes', ''),
      unclearIds: Array.isArray(value.unclearIds)
        ? value.unclearIds.filter((id): id is string => typeof id === 'string')
        : [],
    };
  } catch {
    return empty;
  }
};
