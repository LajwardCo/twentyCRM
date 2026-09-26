import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { type ObjectLiteral, In, Repository } from 'typeorm';

import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace.repository';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  SurveyException,
  SurveyExceptionCode,
} from 'src/modules/sales-crm/surveys/survey.exception';
import {
  type SurveyFormRecord,
  type SurveyFormVersionRecord,
} from 'src/modules/sales-crm/surveys/types/survey-records.type';

export const SURVEY_OBJECT_NAMES = [
  'surveyForm',
  'surveyFormVersion',
  'surveyResponse',
  'surveyCampaign',
  'surveyInvitation',
] as const;

export type SurveyObjectName = (typeof SURVEY_OBJECT_NAMES)[number];

// Server-side access to the survey objects. Everything here runs with the
// server's own privileges inside one workspace: callers are responsible for
// having authorised the request (public token/slug checks, capabilities).
@Injectable()
export class SurveyRecordsService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    @InjectRepository(ObjectMetadataEntity)
    private readonly objectMetadataRepository: Repository<ObjectMetadataEntity>,
  ) {}

  // Object metadata ids by name, or null when the workspace has not run
  // tools/sales-crm/provision-surveys.mjs.
  async getSurveyObjectIds(
    workspaceId: string,
  ): Promise<Record<SurveyObjectName, string> | null> {
    const objects = await this.objectMetadataRepository.find({
      select: { id: true, nameSingular: true },
      where: {
        workspaceId,
        nameSingular: In([...SURVEY_OBJECT_NAMES]),
        isActive: true,
      },
    });

    if (objects.length !== SURVEY_OBJECT_NAMES.length) {
      return null;
    }

    return Object.fromEntries(
      objects.map((object) => [object.nameSingular, object.id]),
    ) as Record<SurveyObjectName, string>;
  }

  async assertProvisioned(workspaceId: string): Promise<void> {
    if ((await this.getSurveyObjectIds(workspaceId)) === null) {
      throw new SurveyException(
        'Surveys are not set up in this workspace',
        SurveyExceptionCode.NOT_PROVISIONED,
      );
    }
  }

  async withRepository<TRecord extends ObjectLiteral, TResult>(
    workspaceId: string,
    objectName: string,
    callback: (repository: WorkspaceRepository<TRecord>) => Promise<TResult>,
  ): Promise<TResult> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repository =
          await this.globalWorkspaceOrmManager.getRepository<TRecord>(
            workspaceId,
            objectName,
            { shouldBypassPermissionChecks: true },
          );

        return callback(repository);
      },
      buildSystemAuthContext(workspaceId),
    );
  }

  async findFormById(
    workspaceId: string,
    formId: string,
  ): Promise<SurveyFormRecord> {
    const form = await this.withRepository<
      SurveyFormRecord,
      SurveyFormRecord | null
    >(workspaceId, 'surveyForm', (repository) =>
      repository.findOne({ where: { id: formId } }),
    );

    if (form === null) {
      throw new SurveyException(
        'Form not found',
        SurveyExceptionCode.FORM_NOT_FOUND,
      );
    }

    return form;
  }

  async findFormBySlug(
    workspaceId: string,
    publicSlug: string,
  ): Promise<SurveyFormRecord | null> {
    return this.withRepository<SurveyFormRecord, SurveyFormRecord | null>(
      workspaceId,
      'surveyForm',
      (repository) => repository.findOne({ where: { publicSlug } }),
    );
  }

  async findVersion(
    workspaceId: string,
    where: { id: string } | { formId: string; versionNumber: number },
  ): Promise<SurveyFormVersionRecord | null> {
    return this.withRepository<
      SurveyFormVersionRecord,
      SurveyFormVersionRecord | null
    >(workspaceId, 'surveyFormVersion', (repository) =>
      repository.findOne({ where }),
    );
  }

  async countCompletedResponses(
    workspaceId: string,
    formId: string,
  ): Promise<number> {
    return this.withRepository(workspaceId, 'surveyResponse', (repository) =>
      repository.count({
        where: {
          formId,
          completionStatus: 'COMPLETED',
          reviewStatus: In(['NEW', 'NEEDS_REVIEW', 'REVIEWED', 'ACTIONED']),
        },
      }),
    );
  }
}
