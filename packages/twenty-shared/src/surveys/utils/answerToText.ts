import { OTHER_CHOICE_ID } from '../constants/OTHER_CHOICE_ID';
import {
  type AddressAnswer,
  type AnswerValue,
  type CrmRecordAnswer,
  type FileAnswer,
  type LocationAnswer,
  type MultiChoiceAnswer,
  type SingleChoiceAnswer,
} from '../types/FormAnswers';
import {
  type FormDefinition,
  type FormLanguage,
  type Question,
} from '../types/FormDefinition';
import { pickLocalizedText } from './pickLocalizedText';

// Plain-text rendering of an answer for exports, CRM notes and mapping.
// Uses the labels of the version the answer was given against.
export const answerToText = (
  question: Question,
  value: AnswerValue | null | undefined,
  definition: FormDefinition,
  language?: FormLanguage,
): string => {
  if (value === undefined || value === null) {
    return '';
  }

  const lang = language ?? definition.languages[0] ?? 'fa';
  const choiceLabel = (choiceId: string, otherText?: string): string => {
    if (choiceId === OTHER_CHOICE_ID) {
      return otherText ?? '';
    }

    const choice = (question.config.choices ?? []).find(
      (candidate) => candidate.id === choiceId,
    );

    return choice === undefined
      ? choiceId
      : pickLocalizedText(choice.label, lang, definition.languages);
  };

  switch (question.type) {
    case 'single_choice':
    case 'dropdown': {
      const choice = value as SingleChoiceAnswer;

      return choice.choiceId === undefined
        ? ''
        : choiceLabel(choice.choiceId, choice.otherText);
    }
    case 'multi_choice': {
      const choices = value as MultiChoiceAnswer;

      return choices.choiceIds
        .map((choiceId) => choiceLabel(choiceId, choices.otherText))
        .filter((label) => label !== '')
        .join(lang === 'en' ? ', ' : '، ');
    }
    case 'yes_no':
    case 'consent':
      if (lang === 'en') {
        return value === true ? 'Yes' : 'No';
      }

      return value === true ? 'بلی' : 'نخیر';
    case 'address': {
      const address = value as AddressAnswer;

      return [
        address.street,
        address.district,
        address.city,
        address.province,
        address.country,
      ]
        .filter((part) => part !== undefined && part !== '')
        .join(lang === 'en' ? ', ' : '، ');
    }
    case 'location': {
      const location = value as LocationAnswer;
      const coordinates =
        location.lat !== undefined && location.lng !== undefined
          ? `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`
          : '';

      return [coordinates, location.description ?? '']
        .filter((part) => part !== '')
        .join(' — ');
    }
    case 'file':
      return (value as FileAnswer[]).map((file) => file.name).join(', ');
    case 'crm_company':
    case 'crm_contact':
    case 'crm_lead':
      return (value as CrmRecordAnswer).label;
    default:
      return String(value);
  }
};
