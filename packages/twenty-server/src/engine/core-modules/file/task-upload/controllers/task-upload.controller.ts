import {
  Body,
  Controller,
  HttpException,
  Logger,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { TaskUploadException } from 'src/engine/core-modules/file/task-upload/task-upload.exception';
import { TaskUploadService } from 'src/engine/core-modules/file/task-upload/services/task-upload.service';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';

// Minimal shape of a Multer-parsed upload (avoids depending on @types/multer).
type UploadedMulterFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

// A hard buffering ceiling well above the logical per-file limit (which the
// service enforces) — nginx caps the request body first in production.
const MULTER_HARD_LIMIT_BYTES = 100 * 1024 * 1024;

@Controller('public')
export class TaskUploadController {
  private readonly logger = new Logger(TaskUploadController.name);

  constructor(private readonly taskUploadService: TaskUploadService) {}

  // Public, unauthenticated: the only credential is the upload token in the
  // multipart body, which can only attach a file to one task for a short window.
  @Post('task-upload')
  @UseGuards(PublicEndpointGuard, NoPermissionGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MULTER_HARD_LIMIT_BYTES } }),
  )
  async uploadTaskFile(
    @Body('token') token: string | undefined,
    @UploadedFile() file: UploadedMulterFile | undefined,
  ): Promise<{ ok: true; taskLabel: string }> {
    if (!token || !file) {
      throw new HttpException(
        { ok: false, message: 'Missing token or file' },
        400,
      );
    }

    try {
      const { taskLabel } = await this.taskUploadService.handlePublicUpload({
        token,
        buffer: file.buffer,
        filename: file.originalname,
        mimetype: file.mimetype,
      });

      return { ok: true, taskLabel };
    } catch (error) {
      if (error instanceof TaskUploadException) {
        throw new HttpException(
          { ok: false, message: error.message, code: error.code },
          error.httpStatus,
        );
      }

      this.logger.error(`Unexpected task-upload failure: ${error}`);
      throw new HttpException({ ok: false, message: 'Upload failed' }, 500);
    }
  }
}
