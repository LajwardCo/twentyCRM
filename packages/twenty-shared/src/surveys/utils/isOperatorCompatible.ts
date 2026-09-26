import {
  type ConditionOperator,
  type QuestionType,
} from '../types/FormDefinition';

const NUMERIC: QuestionType[] = ['number', 'rating', 'opinion_scale'];

// Types that cannot be compared to a single value.
const NOT_COMPARABLE: QuestionType[] = [
  'file',
  'location',
  'address',
  'multi_choice',
  'crm_company',
  'crm_contact',
  'crm_lead',
];

export const isOperatorCompatible = (
  operator: ConditionOperator,
  questionType: QuestionType,
): boolean => {
  switch (operator) {
    case 'answered':
    case 'not_answered':
      return true;
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return NUMERIC.includes(questionType);
    case 'includes':
    case 'excludes':
      return questionType === 'multi_choice';
    case 'eq':
    case 'neq':
      return !NOT_COMPARABLE.includes(questionType);
  }
};
