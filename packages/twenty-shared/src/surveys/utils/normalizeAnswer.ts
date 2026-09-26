import { OTHER_CHOICE_ID } from '../constants/OTHER_CHOICE_ID';
import { SURVEY_LIMITS } from '../constants/SURVEY_LIMITS';
import {
  type AddressAnswer,
  type AnswerValue,
  type FileAnswer,
  type LocationAnswer,
} from '../types/FormAnswers';
import { type Question } from '../types/FormDefinition';
import { type ValidationCode } from '../types/ResponseValidation';
import { toLatinDigits } from './toLatinDigits';

export type NormalizedAnswer =
  | { value: AnswerValue | undefined }
  | { error: ValidationCode };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const cleanText = (value: unknown, maxLength: number): string | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  // Hard cap regardless of question config: bounds abuse of public payloads.
  return value.trim().slice(0, maxLength);
};

const parseNumber = (value: unknown): number | undefined | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const text = toLatinDigits(value).replace(/,/g, '').trim();

  if (text === '') {
    return undefined;
  }

  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : null;
};

const isValidIsoDate = (text: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

  if (match === null) {
    return false;
  }

  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const isValidTime = (text: string): boolean =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(text);

const choiceIdsOf = (question: Question): Set<string> => {
  const ids = new Set(
    (question.config.choices ?? []).map((choice) => choice.id),
  );

  if (question.config.allowOther === true) {
    ids.add(OTHER_CHOICE_ID);
  }

  return ids;
};

const MAX_ADDRESS_PART = 300;

// Coerces a raw (possibly hostile) answer into the canonical shape for the
// question type. Never throws: bad input becomes an error code.
export const normalizeAnswer = (
  question: Question,
  raw: unknown,
): NormalizedAnswer => {
  if (raw === undefined || raw === null) {
    return { value: undefined };
  }

  switch (question.type) {
    case 'short_text':
    case 'website': {
      const text = cleanText(raw, SURVEY_LIMITS.maxTextLength);

      return text === undefined ? { error: 'INVALID_VALUE' } : { value: text };
    }
    case 'long_text': {
      const text = cleanText(raw, SURVEY_LIMITS.maxTextLength);

      return text === undefined ? { error: 'INVALID_VALUE' } : { value: text };
    }
    case 'email': {
      const text = cleanText(raw, 320);

      return text === undefined
        ? { error: 'INVALID_VALUE' }
        : { value: text.toLowerCase() };
    }
    case 'phone': {
      const text = cleanText(raw, 40);

      return text === undefined
        ? { error: 'INVALID_VALUE' }
        : { value: toLatinDigits(text).replace(/[\s\-().]/g, '') };
    }
    case 'number':
    case 'rating':
    case 'opinion_scale': {
      const number = parseNumber(raw);

      return number === null ? { error: 'INVALID_VALUE' } : { value: number };
    }
    case 'yes_no':
    case 'consent': {
      if (typeof raw === 'boolean') {
        return { value: raw };
      }

      if (raw === 'true' || raw === 'yes') {
        return { value: true };
      }

      if (raw === 'false' || raw === 'no') {
        return { value: false };
      }

      return { error: 'INVALID_VALUE' };
    }
    // Dates are validated, never truncated: "2024-01-01T10:00+04:30" must be
    // rejected, not silently stored as another value.
    case 'date': {
      const text = cleanText(raw, 40);

      if (text === undefined) {
        return { error: 'INVALID_DATE' };
      }

      const latin = toLatinDigits(text);

      if (latin === '') {
        return { value: undefined };
      }

      return isValidIsoDate(latin)
        ? { value: latin }
        : { error: 'INVALID_DATE' };
    }
    case 'time': {
      const text = cleanText(raw, 40);

      if (text === undefined) {
        return { error: 'INVALID_TIME' };
      }

      const latin = toLatinDigits(text);

      if (latin === '') {
        return { value: undefined };
      }

      return isValidTime(latin) ? { value: latin } : { error: 'INVALID_TIME' };
    }
    case 'datetime': {
      const text = cleanText(raw, 40);

      if (text === undefined) {
        return { error: 'INVALID_DATE' };
      }

      const latin = toLatinDigits(text);

      if (latin === '') {
        return { value: undefined };
      }

      // Local date and time to the minute; seconds from native pickers are
      // accepted and dropped, any zone or extra text is invalid.
      const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2})?$/.exec(latin);

      return match !== null && isValidIsoDate(match[1]) && isValidTime(match[2])
        ? { value: `${match[1]}T${match[2]}` }
        : { error: 'INVALID_DATE' };
    }
    case 'single_choice':
    case 'dropdown': {
      const choice = typeof raw === 'string' ? { choiceId: raw } : raw;

      if (!isRecord(choice)) {
        return { error: 'INVALID_CHOICE' };
      }

      const choiceId =
        typeof choice.choiceId === 'string' ? choice.choiceId : '';

      if (choiceId === '') {
        return { value: undefined };
      }

      if (!choiceIdsOf(question).has(choiceId)) {
        return { error: 'INVALID_CHOICE' };
      }

      if (choiceId === OTHER_CHOICE_ID) {
        return {
          value: {
            choiceId,
            otherText:
              cleanText(choice.otherText, SURVEY_LIMITS.maxShortTextLength) ??
              '',
          },
        };
      }

      return { value: { choiceId } };
    }
    case 'multi_choice': {
      const choices = Array.isArray(raw) ? { choiceIds: raw } : raw;

      if (!isRecord(choices) || !Array.isArray(choices.choiceIds)) {
        return { error: 'INVALID_CHOICE' };
      }

      const allowed = choiceIdsOf(question);
      const choiceIds: string[] = [];

      for (const choiceId of choices.choiceIds) {
        if (typeof choiceId !== 'string' || !allowed.has(choiceId)) {
          return { error: 'INVALID_CHOICE' };
        }

        if (!choiceIds.includes(choiceId)) {
          choiceIds.push(choiceId);
        }
      }

      if (choiceIds.includes(OTHER_CHOICE_ID)) {
        return {
          value: {
            choiceIds,
            otherText:
              cleanText(choices.otherText, SURVEY_LIMITS.maxShortTextLength) ??
              '',
          },
        };
      }

      return { value: { choiceIds } };
    }
    case 'address': {
      if (!isRecord(raw)) {
        return { error: 'INVALID_VALUE' };
      }

      const address: AddressAnswer = {};

      for (const part of [
        'street',
        'district',
        'city',
        'province',
        'country',
      ] as const) {
        const text = cleanText(raw[part], MAX_ADDRESS_PART);

        if (text !== undefined && text !== '') {
          address[part] = text;
        }
      }

      return { value: address };
    }
    case 'location': {
      if (!isRecord(raw)) {
        return { error: 'INVALID_VALUE' };
      }

      const lat = parseNumber(raw.lat);
      const lng = parseNumber(raw.lng);
      const accuracy = parseNumber(raw.accuracy);

      if (lat === null || lng === null) {
        return { error: 'INVALID_VALUE' };
      }

      if (
        (lat !== undefined && (lat < -90 || lat > 90)) ||
        (lng !== undefined && (lng < -180 || lng > 180)) ||
        (lat === undefined) !== (lng === undefined)
      ) {
        return { error: 'INVALID_VALUE' };
      }

      const location: LocationAnswer = {
        source: raw.source === 'GPS' ? 'GPS' : 'MANUAL',
      };

      if (lat !== undefined && lng !== undefined) {
        location.lat = lat;
        location.lng = lng;
      }

      if (typeof accuracy === 'number') {
        location.accuracy = accuracy;
      }

      const description = cleanText(raw.description, MAX_ADDRESS_PART);

      if (description !== undefined && description !== '') {
        location.description = description;
      }

      return { value: location };
    }
    case 'file': {
      if (!Array.isArray(raw)) {
        return { error: 'INVALID_FILE' };
      }

      const files: FileAnswer[] = [];

      for (const file of raw) {
        if (
          !isRecord(file) ||
          typeof file.ref !== 'string' ||
          file.ref === '' ||
          typeof file.name !== 'string' ||
          typeof file.mimeType !== 'string' ||
          typeof file.sizeBytes !== 'number'
        ) {
          return { error: 'INVALID_FILE' };
        }

        files.push({
          ref: file.ref,
          name: file.name.slice(0, 255),
          mimeType: file.mimeType.slice(0, 120),
          sizeBytes: file.sizeBytes,
        });
      }

      return { value: files };
    }
    case 'crm_company':
    case 'crm_contact':
    case 'crm_lead': {
      if (!isRecord(raw) || typeof raw.recordId !== 'string') {
        return { error: 'INVALID_VALUE' };
      }

      if (raw.recordId === '') {
        return { value: undefined };
      }

      return {
        value: {
          recordId: raw.recordId,
          label: cleanText(raw.label, 255) ?? '',
        },
      };
    }
  }
};
