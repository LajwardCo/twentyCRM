import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { type FileAnswer } from 'twenty-shared/surveys';

import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import {
  type PublicFormPayload,
  type PublicSubmissionResult,
  SurveyPublicService,
} from 'src/modules/sales-crm/surveys/services/survey-public.service';
import {
  SurveyException,
  SurveyExceptionCode,
} from 'src/modules/sales-crm/surveys/survey.exception';
import { toSurveyHttpException } from 'src/modules/sales-crm/surveys/utils/to-survey-http-exception.util';

// request.ip honours Express "trust proxy" (TRUST_PROXY: only local and
// private proxies by default), so it is the address the nearest trusted proxy
// saw — unlike the left-most X-Forwarded-For entry, which the client writes.
type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
};

type UploadedMulterFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

// Buffering ceiling above the per-question limit the service enforces.
const MULTER_HARD_LIMIT_BYTES = 12 * 1024 * 1024;

// The browser's Origin header decides the workspace when present (page script
// cannot forge it); same-origin GETs carry none, so the page passes its own
// origin as a query parameter instead.
const resolveOrigin = (
  headerOrigin: string | undefined,
  queryOrigin: unknown,
): string => {
  const candidate =
    typeof headerOrigin === 'string' && headerOrigin !== ''
      ? headerOrigin
      : typeof queryOrigin === 'string'
        ? queryOrigin
        : '';

  try {
    return new URL(candidate).origin;
  } catch {
    throw new SurveyException(
      'Invalid origin',
      SurveyExceptionCode.FORM_NOT_FOUND,
    );
  }
};

// Unauthenticated endpoints behind public form links. They never return CRM
// data or internal ids; see SurveyPublicService.
@Controller('public/forms')
@UseGuards(PublicEndpointGuard, NoPermissionGuard)
export class SurveyPublicController {
  private readonly logger = new Logger(SurveyPublicController.name);

  constructor(private readonly surveyPublicService: SurveyPublicService) {}

  @Get(':slug')
  async getForm(
    @Param('slug') slug: string,
    @Query('origin') queryOrigin: unknown,
    @Query('i') inviteToken: unknown,
    @Headers('origin') headerOrigin: string | undefined,
    @Req() request: RequestLike,
  ): Promise<PublicFormPayload> {
    try {
      return await this.surveyPublicService.getPublicForm({
        origin: resolveOrigin(headerOrigin, queryOrigin),
        slug,
        inviteToken: typeof inviteToken === 'string' ? inviteToken : null,
        ip: request.ip ?? request.socket?.remoteAddress ?? null,
      });
    } catch (error) {
      throw toSurveyHttpException(error, this.logger);
    }
  }

  @Post(':slug/uploads')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MULTER_HARD_LIMIT_BYTES } }),
  )
  async upload(
    @Param('slug') slug: string,
    @Query('origin') queryOrigin: unknown,
    @Headers('origin') headerOrigin: string | undefined,
    @Body() body: Record<string, unknown>,
    @UploadedFile() file: UploadedMulterFile | undefined,
    @Req() request: RequestLike,
  ): Promise<FileAnswer> {
    try {
      if (file === undefined) {
        throw new SurveyException(
          'Missing file',
          SurveyExceptionCode.INVALID_FILE,
        );
      }

      return await this.surveyPublicService.uploadFile({
        origin: resolveOrigin(headerOrigin, queryOrigin),
        slug,
        body: body ?? {},
        file,
        ip: request.ip ?? request.socket?.remoteAddress ?? null,
      });
    } catch (error) {
      throw toSurveyHttpException(error, this.logger);
    }
  }

  @Post(':slug/submissions')
  @HttpCode(200)
  async submit(
    @Param('slug') slug: string,
    @Query('origin') queryOrigin: unknown,
    @Headers('origin') headerOrigin: string | undefined,
    @Body() body: unknown,
    @Req() request: RequestLike,
  ): Promise<PublicSubmissionResult> {
    try {
      return await this.surveyPublicService.submit({
        origin: resolveOrigin(headerOrigin, queryOrigin),
        slug,
        body,
        ip: request.ip ?? request.socket?.remoteAddress ?? null,
      });
    } catch (error) {
      throw toSurveyHttpException(error, this.logger);
    }
  }
}
