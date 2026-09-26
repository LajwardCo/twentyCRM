import { HttpException, type Logger } from '@nestjs/common';

import { SurveyException } from 'src/modules/sales-crm/surveys/survey.exception';

// Survey errors become `{ ok: false, code, message, details }` with their own
// status; anything unexpected is logged and reported without internals.
export const toSurveyHttpException = (
  error: unknown,
  logger: Logger,
): HttpException => {
  if (error instanceof SurveyException) {
    return new HttpException(
      {
        ok: false,
        code: error.code,
        message: error.message,
        details: error.details ?? null,
      },
      error.httpStatus,
    );
  }

  if (error instanceof HttpException) {
    return error;
  }

  logger.error(`Unexpected survey failure: ${error}`);

  return new HttpException(
    { ok: false, code: 'INTERNAL', message: 'Something went wrong' },
    500,
  );
};
