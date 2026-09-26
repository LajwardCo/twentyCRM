import { OTHER_CHOICE_ID } from '../constants/OTHER_CHOICE_ID';
import {
  type AddressAnswer,
  type AnswerValue,
  type CrmRecordAnswer,
  type LocationAnswer,
  type MultiChoiceAnswer,
  type SingleChoiceAnswer,
} from '../types/FormAnswers';
import { type Question } from '../types/FormDefinition';

const hasText = (value: unknown): boolean =>
  typeof value === 'string' && value.trim() !== '';

// Expects a normalized answer (see normalizeAnswer).
export const isAnswerPresent = (
  question: Question,
  value: AnswerValue | null | undefined,
): boolean => {
  if (value === undefined || value === null) {
    return false;
  }

  switch (question.type) {
    case 'short_text':
    case 'long_text':
    case 'email':
    case 'phone':
    case 'website':
    case 'date':
    case 'time':
    case 'datetime':
      return hasText(value);
    case 'number':
    case 'rating':
    case 'opinion_scale':
      return typeof value === 'number' && Number.isFinite(value);
    case 'yes_no':
      return typeof value === 'boolean';
    case 'consent':
      return value === true;
    case 'single_choice':
    case 'dropdown': {
      const choice = value as SingleChoiceAnswer;

      if (!hasText(choice.choiceId)) {
        return false;
      }

      return choice.choiceId !== OTHER_CHOICE_ID || hasText(choice.otherText);
    }
    case 'multi_choice': {
      const choices = value as MultiChoiceAnswer;
      const regular = (choices.choiceIds ?? []).filter(
        (choiceId) => choiceId !== OTHER_CHOICE_ID,
      );

      return (
        regular.length > 0 ||
        ((choices.choiceIds ?? []).includes(OTHER_CHOICE_ID) &&
          hasText(choices.otherText))
      );
    }
    case 'address': {
      const address = value as AddressAnswer;

      return [
        address.street,
        address.district,
        address.city,
        address.province,
        address.country,
      ].some(hasText);
    }
    case 'location': {
      const location = value as LocationAnswer;

      return (
        (typeof location.lat === 'number' &&
          typeof location.lng === 'number') ||
        hasText(location.description)
      );
    }
    case 'file':
      return Array.isArray(value) && value.length > 0;
    case 'crm_company':
    case 'crm_contact':
    case 'crm_lead':
      return hasText((value as CrmRecordAnswer).recordId);
  }
};
