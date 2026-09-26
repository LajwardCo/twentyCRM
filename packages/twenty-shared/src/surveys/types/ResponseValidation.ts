import { type AnswerValue } from './FormAnswers';

export type ValidationCode =
  | 'REQUIRED'
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'TOO_SMALL'
  | 'TOO_LARGE'
  | 'TOO_FEW'
  | 'TOO_MANY'
  | 'INVALID_EMAIL'
  | 'INVALID_PHONE'
  | 'INVALID_URL'
  | 'INVALID_DATE'
  | 'INVALID_TIME'
  | 'INVALID_CHOICE'
  | 'INVALID_FILE'
  | 'INVALID_VALUE';

export type ResponseValidationError = {
  questionId: string;
  code: ValidationCode;
};

export type ResponseValidationMode = 'PARTIAL' | 'COMPLETE';

export type ResponseValidation = {
  cleanAnswers: Record<string, AnswerValue>;
  skippedByLogic: string[];
  errors: ResponseValidationError[];
  endingId: string | null;
};
