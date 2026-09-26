import {
  type CrmTargetField,
  type QuestionType,
} from '../types/FormDefinition';

const TEXT_LIKE: QuestionType[] = [
  'short_text',
  'long_text',
  'single_choice',
  'dropdown',
  'multi_choice',
  'yes_no',
  'number',
  'date',
  'datetime',
  'email',
  'phone',
  'website',
  'rating',
  'opinion_scale',
  'address',
];

const COMPATIBLE_TYPES: Record<CrmTargetField, QuestionType[]> = {
  'company.name': ['short_text'],
  'company.address': ['address', 'short_text', 'long_text'],
  'company.domainName': ['website', 'short_text'],
  'company.businessType': ['short_text', 'single_choice', 'dropdown'],
  'company.employees': ['number'],
  'person.name': ['short_text'],
  'person.phone': ['phone'],
  'person.email': ['email'],
  'person.jobTitle': ['short_text', 'single_choice', 'dropdown'],
  'opportunity.name': ['short_text'],
  'opportunity.interest': TEXT_LIKE,
  'opportunity.followUp': TEXT_LIKE,
};

export const isMappingCompatible = (
  questionType: QuestionType,
  field: CrmTargetField,
): boolean => COMPATIBLE_TYPES[field]?.includes(questionType) ?? false;
