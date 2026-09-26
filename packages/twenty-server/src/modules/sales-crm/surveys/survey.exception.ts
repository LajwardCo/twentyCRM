import { HttpStatus } from '@nestjs/common';

export enum SurveyExceptionCode {
  NOT_PROVISIONED = 'NOT_PROVISIONED',
  FORM_NOT_FOUND = 'FORM_NOT_FOUND',
  RESPONSE_NOT_FOUND = 'RESPONSE_NOT_FOUND',
  FORBIDDEN = 'FORBIDDEN',
  DRAFT_CONFLICT = 'DRAFT_CONFLICT',
  PUBLISH_INVALID = 'PUBLISH_INVALID',
  INVALID_STATUS_CHANGE = 'INVALID_STATUS_CHANGE',
  FORM_NOT_OPEN = 'FORM_NOT_OPEN',
  INVALID_SUBMISSION = 'INVALID_SUBMISSION',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED = 'RATE_LIMITED',
  INVALID_FILE = 'INVALID_FILE',
  INVALID_UPLOAD_REF = 'INVALID_UPLOAD_REF',
}

const HTTP_STATUS_BY_CODE: Record<SurveyExceptionCode, HttpStatus> = {
  [SurveyExceptionCode.NOT_PROVISIONED]: HttpStatus.NOT_FOUND,
  [SurveyExceptionCode.FORM_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [SurveyExceptionCode.RESPONSE_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [SurveyExceptionCode.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [SurveyExceptionCode.DRAFT_CONFLICT]: HttpStatus.CONFLICT,
  [SurveyExceptionCode.PUBLISH_INVALID]: HttpStatus.UNPROCESSABLE_ENTITY,
  [SurveyExceptionCode.INVALID_STATUS_CHANGE]: HttpStatus.CONFLICT,
  [SurveyExceptionCode.FORM_NOT_OPEN]: HttpStatus.CONFLICT,
  [SurveyExceptionCode.INVALID_SUBMISSION]: HttpStatus.UNPROCESSABLE_ENTITY,
  [SurveyExceptionCode.PAYLOAD_TOO_LARGE]: HttpStatus.PAYLOAD_TOO_LARGE,
  [SurveyExceptionCode.RATE_LIMITED]: HttpStatus.TOO_MANY_REQUESTS,
  [SurveyExceptionCode.INVALID_FILE]: HttpStatus.UNPROCESSABLE_ENTITY,
  [SurveyExceptionCode.INVALID_UPLOAD_REF]: HttpStatus.UNPROCESSABLE_ENTITY,
};

export class SurveyException extends Error {
  readonly code: SurveyExceptionCode;
  readonly httpStatus: HttpStatus;
  // Structured detail the client can act on (per-question errors, publish
  // issues). Never contains internal ids on public endpoints.
  readonly details: unknown;

  constructor(message: string, code: SurveyExceptionCode, details?: unknown) {
    super(message);
    this.name = 'SurveyException';
    this.code = code;
    this.httpStatus = HTTP_STATUS_BY_CODE[code];
    this.details = details;
  }
}
