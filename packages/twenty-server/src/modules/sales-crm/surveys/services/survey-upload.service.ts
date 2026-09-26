import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import {
  type FileAnswer,
  type Question,
  SURVEY_LIMITS,
  isMimeTypeAccepted,
} from 'twenty-shared/surveys';
import { Repository } from 'typeorm';

import { InjectCacheStorage } from 'src/engine/core-modules/cache-storage/decorators/cache-storage.decorator';
import { CacheStorageService } from 'src/engine/core-modules/cache-storage/services/cache-storage.service';
import { CacheStorageNamespace } from 'src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum';
import { FilesFieldService } from 'src/engine/core-modules/file/files-field/services/files-field.service';
import { extractFileInfoOrThrow } from 'src/engine/core-modules/file/utils/extract-file-info-or-throw.utils';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { SURVEY_UPLOAD_REF_TTL_MS } from 'src/modules/sales-crm/surveys/constants/survey.constants';
import { SurveyRecordsService } from 'src/modules/sales-crm/surveys/services/survey-records.service';
import {
  SurveyException,
  SurveyExceptionCode,
} from 'src/modules/sales-crm/surveys/survey.exception';
import {
  buildSurveyRecordValues,
  type SurveyActor,
} from 'src/modules/sales-crm/surveys/utils/build-survey-record-values.util';
import {
  generateSecretToken,
  hashSecretToken,
  isWellFormedSecretToken,
} from 'src/modules/sales-crm/surveys/utils/survey-tokens.util';

export type PendingSurveyUpload = {
  workspaceId: string;
  formId: string;
  questionId: string;
  submissionKey: string;
  fileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  extension: string;
};

type AttachmentShape = { id: string };

const cacheKey = (ref: string) => `survey-upload:${hashSecretToken(ref)}`;

// Files uploaded from a public form before it is submitted. The upload stores
// the file and returns an opaque reference that is only redeemable by the same
// form + submission key + question within an hour; the attachment record is
// created when the response itself is created.
@Injectable()
export class SurveyUploadService {
  constructor(
    private readonly filesFieldService: FilesFieldService,
    private readonly surveyRecordsService: SurveyRecordsService,
    @InjectCacheStorage(CacheStorageNamespace.EngineWorkspace)
    private readonly cacheStorage: CacheStorageService,
    @InjectRepository(FieldMetadataEntity)
    private readonly fieldMetadataRepository: Repository<FieldMetadataEntity>,
    @InjectRepository(ObjectMetadataEntity)
    private readonly objectMetadataRepository: Repository<ObjectMetadataEntity>,
  ) {}

  async storePublicUpload({
    workspaceId,
    formId,
    question,
    submissionKey,
    buffer,
    filename,
    mimeType,
  }: {
    workspaceId: string;
    formId: string;
    question: Question;
    submissionKey: string;
    buffer: Buffer;
    filename: string;
    mimeType: string;
  }): Promise<FileAnswer> {
    const maxMb = Math.min(
      question.config.maxFileMb ?? SURVEY_LIMITS.maxFileMb,
      SURVEY_LIMITS.maxFileMb,
    );

    if (buffer.length === 0 || buffer.length > maxMb * 1024 * 1024) {
      throw new SurveyException(
        'File is empty or too large',
        SurveyExceptionCode.INVALID_FILE,
      );
    }

    // The type the browser declares is the uploader's claim; the type read
    // from the file's own bytes is what gets checked and recorded.
    const { mimeType: detectedMimeType } = await extractFileInfoOrThrow({
      file: buffer,
      filename,
    }).catch(() => ({ mimeType: 'application/octet-stream' }));

    if (
      !isMimeTypeAccepted(detectedMimeType, question.config.fileTypes) ||
      !isMimeTypeAccepted(mimeType, question.config.fileTypes)
    ) {
      throw new SurveyException(
        'This file type is not accepted',
        SurveyExceptionCode.INVALID_FILE,
      );
    }

    const safeName = filename.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200);
    const dotIndex = safeName.lastIndexOf('.');
    const extension =
      dotIndex >= 0 ? safeName.slice(dotIndex + 1).toLowerCase() : '';

    // FilesFieldService checks the file's real type from its bytes, so a
    // renamed executable does not pass as an image.
    const uploaded = await this.filesFieldService
      .uploadFile({
        file: buffer,
        filename: safeName,
        workspaceId,
        fieldMetadataId: await this.getAttachmentFileFieldId(workspaceId),
      })
      .catch(() => {
        throw new SurveyException(
          'The file could not be stored',
          SurveyExceptionCode.INVALID_FILE,
        );
      });

    const ref = generateSecretToken();
    const pending: PendingSurveyUpload = {
      workspaceId,
      formId,
      questionId: question.id,
      submissionKey,
      fileId: uploaded.id,
      name: safeName,
      mimeType: detectedMimeType,
      sizeBytes: buffer.length,
      extension,
    };

    await this.cacheStorage.set(
      cacheKey(ref),
      pending,
      SURVEY_UPLOAD_REF_TTL_MS,
    );

    return {
      ref,
      name: safeName,
      mimeType: detectedMimeType,
      sizeBytes: buffer.length,
    };
  }

  // Resolves every file answer of a submission to its stored upload, refusing
  // references minted for another form, question or submission.
  async redeemPublicUploads({
    workspaceId,
    formId,
    submissionKey,
    fileAnswers,
  }: {
    workspaceId: string;
    formId: string;
    submissionKey: string;
    fileAnswers: Record<string, FileAnswer[]>;
  }): Promise<Record<string, PendingSurveyUpload[]>> {
    const redeemed: Record<string, PendingSurveyUpload[]> = {};

    for (const [questionId, files] of Object.entries(fileAnswers)) {
      redeemed[questionId] = [];

      for (const file of files) {
        const pending = isWellFormedSecretToken(file.ref)
          ? await this.cacheStorage.get<PendingSurveyUpload>(cacheKey(file.ref))
          : undefined;

        if (
          pending === undefined ||
          pending.workspaceId !== workspaceId ||
          pending.formId !== formId ||
          pending.submissionKey !== submissionKey ||
          pending.questionId !== questionId
        ) {
          throw new SurveyException(
            'An uploaded file has expired. Please upload it again.',
            SurveyExceptionCode.INVALID_UPLOAD_REF,
            { questionId },
          );
        }

        redeemed[questionId].push(pending);
      }
    }

    return redeemed;
  }

  async attachToResponse({
    workspaceId,
    responseId,
    uploads,
    actor,
  }: {
    workspaceId: string;
    responseId: string;
    uploads: PendingSurveyUpload[];
    actor: SurveyActor;
  }): Promise<Map<string, string>> {
    const attachmentIdsByFileId = new Map<string, string>();

    if (uploads.length === 0) {
      return attachmentIdsByFileId;
    }

    await this.surveyRecordsService.withRepository<AttachmentShape, void>(
      workspaceId,
      'attachment',
      async (repository) => {
        for (const upload of uploads) {
          const saved = (await repository.save(
            buildSurveyRecordValues(
              {
                name: upload.name,
                file: [
                  {
                    fileId: upload.fileId,
                    label: upload.name,
                    extension: upload.extension,
                  },
                ],
                targetSurveyResponseId: responseId,
              },
              actor,
            ) as Partial<AttachmentShape>,
          )) as AttachmentShape;

          attachmentIdsByFileId.set(upload.fileId, saved.id);
        }
      },
    );

    return attachmentIdsByFileId;
  }

  private async getAttachmentFileFieldId(workspaceId: string): Promise<string> {
    const attachmentObject = await this.objectMetadataRepository.findOne({
      select: { id: true },
      where: { nameSingular: 'attachment', workspaceId },
    });
    const fileField =
      attachmentObject === null
        ? null
        : await this.fieldMetadataRepository.findOne({
            select: { id: true },
            where: {
              name: 'file',
              objectMetadataId: attachmentObject.id,
              workspaceId,
            },
          });

    if (fileField === null) {
      throw new SurveyException(
        'File storage is not available',
        SurveyExceptionCode.INVALID_FILE,
      );
    }

    return fileField.id;
  }
}
