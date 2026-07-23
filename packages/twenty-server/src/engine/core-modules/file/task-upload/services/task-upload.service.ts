import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { FieldActorSource } from 'twenty-shared/types';
import { Repository } from 'typeorm';

import { JwtTokenTypeEnum } from 'src/engine/core-modules/auth/types/jwt-token-type.enum';
import { type UploadTokenJwtPayload } from 'src/engine/core-modules/auth/types/upload-token-jwt-payload.type';
import { FilesFieldService } from 'src/engine/core-modules/file/files-field/services/files-field.service';
import {
  TASK_UPLOAD_ALLOWED_MIME_TYPES,
  TASK_UPLOAD_MAX_FILE_SIZE_BYTES,
  TASK_UPLOAD_RATE_LIMIT_MAX_TOKENS,
  TASK_UPLOAD_RATE_LIMIT_WINDOW_MS,
} from 'src/engine/core-modules/file/task-upload/constants/task-upload.constants';
import {
  TaskUploadException,
  TaskUploadExceptionCode,
} from 'src/engine/core-modules/file/task-upload/task-upload.exception';
import { JwtWrapperService } from 'src/engine/core-modules/jwt/services/jwt-wrapper.service';
import { CreateRecordService } from 'src/engine/core-modules/record-crud/services/create-record.service';
import { ThrottlerService } from 'src/engine/core-modules/throttler/throttler.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';

type TaskEntityShape = { id: string; title: string | null };

@Injectable()
export class TaskUploadService {
  private readonly logger = new Logger(TaskUploadService.name);

  constructor(
    private readonly jwtWrapperService: JwtWrapperService,
    private readonly twentyConfigService: TwentyConfigService,
    private readonly filesFieldService: FilesFieldService,
    private readonly createRecordService: CreateRecordService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly throttlerService: ThrottlerService,
    @InjectRepository(FieldMetadataEntity)
    private readonly fieldMetadataRepository: Repository<FieldMetadataEntity>,
    @InjectRepository(ObjectMetadataEntity)
    private readonly objectMetadataRepository: Repository<ObjectMetadataEntity>,
  ) {}

  // Mints a short-lived, upload-only token scoped to one task. Called from the
  // authenticated GraphQL mutation, so `workspaceId` is already trusted.
  async generateToken({
    workspaceId,
    workspaceMemberId,
    taskId,
    opportunityId,
  }: {
    workspaceId: string;
    workspaceMemberId: string | null;
    taskId: string;
    opportunityId?: string | null;
  }): Promise<{ token: string; expiresAt: string; taskLabel: string }> {
    const task = await this.findTaskInWorkspace(workspaceId, taskId);

    if (task === null) {
      throw new TaskUploadException(
        'Task not found in this workspace',
        TaskUploadExceptionCode.TASK_NOT_FOUND,
      );
    }

    const payload: UploadTokenJwtPayload = {
      type: JwtTokenTypeEnum.UPLOAD,
      sub: workspaceId,
      workspaceId,
      targetTaskId: taskId,
      workspaceMemberId,
      targetOpportunityId: opportunityId ?? null,
    };

    const expiresIn = this.twentyConfigService.get(
      'TASK_UPLOAD_TOKEN_EXPIRES_IN',
    );

    const token = await this.jwtWrapperService.signAsyncOrThrow(payload, {
      expiresIn,
    });

    // Read the authoritative `exp` claim back off the signed token so the
    // countdown UI matches the server exactly.
    const decoded = this.jwtWrapperService.decode<{ exp?: number }>(token, {
      json: true,
    });
    const expiresAt =
      decoded?.exp !== undefined
        ? new Date(decoded.exp * 1000).toISOString()
        : new Date().toISOString();

    return { token, expiresAt, taskLabel: task.title ?? 'وظیفه' };
  }

  // Verifies the token, validates the file, then uploads + attaches it. Runs on
  // the PUBLIC endpoint, so it trusts nothing but a well-formed UPLOAD token.
  async handlePublicUpload({
    token,
    buffer,
    filename,
    mimetype,
  }: {
    token: string;
    buffer: Buffer;
    filename: string;
    mimetype: string;
  }): Promise<{ taskLabel: string }> {
    const payload = await this.verifyUploadToken(token);

    await this.throttlerService.tokenBucketThrottleOrThrow(
      `task-upload:${payload.workspaceId}`,
      1,
      TASK_UPLOAD_RATE_LIMIT_MAX_TOKENS,
      TASK_UPLOAD_RATE_LIMIT_WINDOW_MS,
    );

    this.validateFile({ buffer, mimetype });

    const fieldMetadataId = await this.getAttachmentFileFieldId(
      payload.workspaceId,
    );

    const uploaded = await this.filesFieldService.uploadFile({
      file: buffer,
      filename,
      workspaceId: payload.workspaceId,
      fieldMetadataId,
    });

    const task = await this.findTaskInWorkspace(
      payload.workspaceId,
      payload.targetTaskId,
    );

    if (task === null) {
      throw new TaskUploadException(
        'Task no longer exists',
        TaskUploadExceptionCode.TASK_NOT_FOUND,
      );
    }

    const dotIndex = filename.lastIndexOf('.');
    const extension =
      dotIndex >= 0 ? filename.slice(dotIndex + 1).toLowerCase() : '';

    const result = await this.createRecordService.execute({
      objectName: 'attachment',
      objectRecord: {
        name: filename,
        file: [{ fileId: uploaded.id, label: filename, extension }],
        targetTaskId: payload.targetTaskId,
        ...(payload.targetOpportunityId
          ? { targetOpportunityId: payload.targetOpportunityId }
          : {}),
      },
      authContext: buildSystemAuthContext(payload.workspaceId),
      createdBy: {
        source: FieldActorSource.MANUAL,
        workspaceMemberId: payload.workspaceMemberId,
        name: 'ارسال از موبایل',
        context: {},
      },
    });

    if (!result.success) {
      this.logger.error(`Public attachment creation failed: ${result.error}`);
      throw new TaskUploadException(
        'Failed to attach the uploaded file',
        TaskUploadExceptionCode.ATTACHMENT_CREATION_FAILED,
      );
    }

    return { taskLabel: task.title ?? 'وظیفه' };
  }

  private async verifyUploadToken(
    token: string,
  ): Promise<UploadTokenJwtPayload> {
    let verified: unknown;

    try {
      verified = await this.jwtWrapperService.verifyJwtToken(token);
    } catch {
      throw new TaskUploadException(
        'Upload link is invalid or expired',
        TaskUploadExceptionCode.INVALID_TOKEN,
      );
    }

    const payload = verified as Partial<UploadTokenJwtPayload>;

    // Strict token-type check prevents confusing an ACCESS/FILE token for an
    // upload token (and vice-versa).
    if (
      payload?.type !== JwtTokenTypeEnum.UPLOAD ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.targetTaskId !== 'string'
    ) {
      throw new TaskUploadException(
        'Upload link is invalid',
        TaskUploadExceptionCode.INVALID_TOKEN,
      );
    }

    return {
      type: JwtTokenTypeEnum.UPLOAD,
      sub: payload.workspaceId,
      workspaceId: payload.workspaceId,
      targetTaskId: payload.targetTaskId,
      workspaceMemberId: payload.workspaceMemberId ?? null,
      targetOpportunityId: payload.targetOpportunityId ?? null,
    };
  }

  private validateFile({
    buffer,
    mimetype,
  }: {
    buffer: Buffer;
    mimetype: string;
  }): void {
    if (buffer.length === 0) {
      throw new TaskUploadException(
        'Empty file',
        TaskUploadExceptionCode.INVALID_FILE,
      );
    }

    if (buffer.length > TASK_UPLOAD_MAX_FILE_SIZE_BYTES) {
      throw new TaskUploadException(
        'File is too large',
        TaskUploadExceptionCode.FILE_TOO_LARGE,
      );
    }

    if (!TASK_UPLOAD_ALLOWED_MIME_TYPES.includes(mimetype)) {
      throw new TaskUploadException(
        'This file type is not allowed',
        TaskUploadExceptionCode.UNSUPPORTED_FILE_TYPE,
      );
    }
  }

  private async findTaskInWorkspace(
    workspaceId: string,
    taskId: string,
  ): Promise<TaskEntityShape | null> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const taskRepository =
          await this.globalWorkspaceOrmManager.getRepository<TaskEntityShape>(
            workspaceId,
            'task',
            { shouldBypassPermissionChecks: true },
          );

        const task = await taskRepository.findOne({
          where: { id: taskId },
          select: { id: true, title: true },
        });

        return task ?? null;
      },
      buildSystemAuthContext(workspaceId),
    );
  }

  private async getAttachmentFileFieldId(workspaceId: string): Promise<string> {
    const attachmentObject = await this.objectMetadataRepository.findOne({
      select: { id: true },
      where: { nameSingular: 'attachment', workspaceId },
    });

    if (attachmentObject === null) {
      throw new TaskUploadException(
        'Attachment object not found',
        TaskUploadExceptionCode.ATTACHMENT_CREATION_FAILED,
      );
    }

    const fileField = await this.fieldMetadataRepository.findOne({
      select: { id: true },
      where: {
        name: 'file',
        objectMetadataId: attachmentObject.id,
        workspaceId,
      },
    });

    if (fileField === null) {
      throw new TaskUploadException(
        'Attachment file field not found',
        TaskUploadExceptionCode.ATTACHMENT_CREATION_FAILED,
      );
    }

    return fileField.id;
  }
}
