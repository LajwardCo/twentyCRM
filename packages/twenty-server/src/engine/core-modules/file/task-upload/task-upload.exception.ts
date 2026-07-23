import { HttpStatus } from '@nestjs/common';

export enum TaskUploadExceptionCode {
  INVALID_TOKEN = 'INVALID_TOKEN',
  TASK_NOT_FOUND = 'TASK_NOT_FOUND',
  INVALID_FILE = 'INVALID_FILE',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE = 'UNSUPPORTED_FILE_TYPE',
  ATTACHMENT_CREATION_FAILED = 'ATTACHMENT_CREATION_FAILED',
}

const HTTP_STATUS_BY_CODE: Record<TaskUploadExceptionCode, HttpStatus> = {
  [TaskUploadExceptionCode.INVALID_TOKEN]: HttpStatus.UNAUTHORIZED,
  [TaskUploadExceptionCode.TASK_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [TaskUploadExceptionCode.INVALID_FILE]: HttpStatus.BAD_REQUEST,
  [TaskUploadExceptionCode.FILE_TOO_LARGE]: HttpStatus.PAYLOAD_TOO_LARGE,
  [TaskUploadExceptionCode.UNSUPPORTED_FILE_TYPE]:
    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  [TaskUploadExceptionCode.ATTACHMENT_CREATION_FAILED]:
    HttpStatus.INTERNAL_SERVER_ERROR,
};

export class TaskUploadException extends Error {
  readonly code: TaskUploadExceptionCode;
  readonly httpStatus: HttpStatus;

  constructor(message: string, code: TaskUploadExceptionCode) {
    super(message);
    this.name = 'TaskUploadException';
    this.code = code;
    this.httpStatus = HTTP_STATUS_BY_CODE[code];
  }
}
