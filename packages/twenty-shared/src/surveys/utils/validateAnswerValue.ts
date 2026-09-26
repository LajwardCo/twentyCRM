import { OTHER_CHOICE_ID } from '../constants/OTHER_CHOICE_ID';
import { SURVEY_LIMITS } from '../constants/SURVEY_LIMITS';
import {
  type AnswerValue,
  type FileAnswer,
  type MultiChoiceAnswer,
} from '../types/FormAnswers';
import { type Question } from '../types/FormDefinition';
import { type ValidationCode } from '../types/ResponseValidation';
import { isMimeTypeAccepted } from './isMimeTypeAccepted';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^\+?\d{6,15}$/;
const WEBSITE_PATTERN = /^(https?:\/\/)?[^\s/.]+(\.[^\s/.]+)+(\/\S*)?$/i;

const checkLength = (
  text: string,
  minLength: number | undefined,
  maxLength: number,
): ValidationCode | null => {
  if (minLength !== undefined && text.length < minLength) {
    return 'TOO_SHORT';
  }

  return text.length > maxLength ? 'TOO_LONG' : null;
};

const checkRange = (
  value: number,
  min: number | undefined,
  max: number | undefined,
): ValidationCode | null => {
  if (min !== undefined && value < min) {
    return 'TOO_SMALL';
  }

  return max !== undefined && value > max ? 'TOO_LARGE' : null;
};

// Format and bounds checks for a present, normalized answer. Requiredness is
// decided elsewhere (it depends on logic).
export const validateAnswerValue = (
  question: Question,
  value: AnswerValue,
): ValidationCode | null => {
  const config = question.config;

  switch (question.type) {
    case 'short_text':
      return checkLength(
        value as string,
        config.minLength,
        Math.min(
          config.maxLength ?? SURVEY_LIMITS.maxShortTextLength,
          SURVEY_LIMITS.maxTextLength,
        ),
      );
    case 'long_text':
      return checkLength(
        value as string,
        config.minLength,
        Math.min(
          config.maxLength ?? SURVEY_LIMITS.maxTextLength,
          SURVEY_LIMITS.maxTextLength,
        ),
      );
    case 'email':
      return EMAIL_PATTERN.test(value as string) ? null : 'INVALID_EMAIL';
    case 'phone':
      return PHONE_PATTERN.test(value as string) ? null : 'INVALID_PHONE';
    case 'website':
      return WEBSITE_PATTERN.test(value as string) ? null : 'INVALID_URL';
    case 'number':
      return checkRange(value as number, config.min, config.max);
    case 'rating': {
      const rating = value as number;

      return Number.isInteger(rating) &&
        rating >= 1 &&
        rating <= (config.scaleMax ?? 5)
        ? null
        : 'INVALID_VALUE';
    }
    case 'opinion_scale': {
      const score = value as number;

      return Number.isInteger(score) &&
        score >= (config.scaleMin ?? 0) &&
        score <= (config.scaleMax ?? 10)
        ? null
        : 'INVALID_VALUE';
    }
    case 'multi_choice': {
      const selected = (value as MultiChoiceAnswer).choiceIds.length;

      if (config.minSelected !== undefined && selected < config.minSelected) {
        return 'TOO_FEW';
      }

      return config.maxSelected !== undefined && selected > config.maxSelected
        ? 'TOO_MANY'
        : null;
    }
    case 'single_choice':
    case 'dropdown': {
      const choice = value as { choiceId?: string; otherText?: string };

      return choice.choiceId === OTHER_CHOICE_ID &&
        (choice.otherText ?? '').length > SURVEY_LIMITS.maxShortTextLength
        ? 'TOO_LONG'
        : null;
    }
    case 'file': {
      const files = value as FileAnswer[];
      const maxFiles = Math.min(config.maxFiles ?? 1, SURVEY_LIMITS.maxFiles);
      const maxBytes =
        Math.min(
          config.maxFileMb ?? SURVEY_LIMITS.maxFileMb,
          SURVEY_LIMITS.maxFileMb,
        ) *
        1024 *
        1024;

      if (files.length > maxFiles) {
        return 'TOO_MANY';
      }

      return files.every(
        (file) =>
          file.sizeBytes > 0 &&
          file.sizeBytes <= maxBytes &&
          isMimeTypeAccepted(file.mimeType, config.fileTypes),
      )
        ? null
        : 'INVALID_FILE';
    }
    default:
      return null;
  }
};
