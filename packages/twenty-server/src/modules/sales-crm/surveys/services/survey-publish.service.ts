import { Injectable } from '@nestjs/common';

import { validateForPublish } from 'twenty-shared/surveys';

import { SurveyRecordsService } from 'src/modules/sales-crm/surveys/services/survey-records.service';
import {
  SurveyException,
  SurveyExceptionCode,
} from 'src/modules/sales-crm/surveys/survey.exception';
import {
  type SurveyFormRecord,
  type SurveyFormStatus,
  type SurveyFormVersionRecord,
} from 'src/modules/sales-crm/surveys/types/survey-records.type';
import {
  buildSurveyRecordValues,
  type SurveyActor,
} from 'src/modules/sales-crm/surveys/utils/build-survey-record-values.util';
import { generateBase62Code } from 'src/modules/sales-crm/surveys/utils/survey-tokens.util';

export type PublishResult = {
  versionId: string;
  versionNumber: number;
  printCode: string;
  publicSlug: string;
};

const ALLOWED_STATUS_CHANGES: Record<SurveyFormStatus, SurveyFormStatus[]> = {
  DRAFT: ['ARCHIVED'],
  PUBLISHED: ['CLOSED', 'ARCHIVED'],
  CLOSED: ['PUBLISHED', 'ARCHIVED'],
  // Unarchiving returns a form to where it can be worked on again; it never
  // silently reopens a public link.
  ARCHIVED: ['CLOSED', 'DRAFT'],
};

@Injectable()
export class SurveyPublishService {
  // Serialises publishes of the same form within this process so two quick
  // clicks cannot both claim the same version number.
  private readonly publishing = new Map<string, Promise<unknown>>();

  constructor(private readonly surveyRecordsService: SurveyRecordsService) {}

  async publish({
    workspaceId,
    workspaceMemberId,
    actorName,
    formId,
    expectedDraftRevision,
    changeNote,
  }: {
    workspaceId: string;
    workspaceMemberId: string | null;
    actorName: string;
    formId: string;
    expectedDraftRevision: number;
    changeNote: string;
  }): Promise<PublishResult> {
    const actor: SurveyActor = { name: actorName, workspaceMemberId };
    const lockKey = `${workspaceId}:${formId}`;
    const previous = this.publishing.get(lockKey) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(() =>
        this.publishUnlocked({
          workspaceId,
          actor,
          formId,
          expectedDraftRevision,
          changeNote,
        }),
      );

    this.publishing.set(lockKey, run);

    try {
      return await run;
    } finally {
      if (this.publishing.get(lockKey) === run) {
        this.publishing.delete(lockKey);
      }
    }
  }

  private async publishUnlocked({
    workspaceId,
    actor,
    formId,
    expectedDraftRevision,
    changeNote,
  }: {
    workspaceId: string;
    actor: SurveyActor;
    formId: string;
    expectedDraftRevision: number;
    changeNote: string;
  }): Promise<PublishResult> {
    const form = await this.surveyRecordsService.findFormById(
      workspaceId,
      formId,
    );

    if (form.formStatus === 'ARCHIVED') {
      throw new SurveyException(
        'Archived forms cannot be published',
        SurveyExceptionCode.INVALID_STATUS_CHANGE,
      );
    }

    // The publisher reviewed a specific draft; if someone saved over it since,
    // publishing would release changes nobody reviewed.
    if ((form.draftRevision ?? 0) !== expectedDraftRevision) {
      throw new SurveyException(
        'The draft changed since you opened it. Reload and review it again.',
        SurveyExceptionCode.DRAFT_CONFLICT,
      );
    }

    if (form.draftDefinition === null) {
      throw new SurveyException(
        'The form has no content',
        SurveyExceptionCode.PUBLISH_INVALID,
        { errors: [], warnings: [] },
      );
    }

    const validation = validateForPublish(form.draftDefinition, {
      publicEnabled: form.publicEnabled === true,
    });

    if (validation.errors.length > 0) {
      throw new SurveyException(
        'The form has problems that must be fixed before publishing',
        SurveyExceptionCode.PUBLISH_INVALID,
        validation,
      );
    }

    const versionNumber = (form.currentVersionNumber ?? 0) + 1;
    const publicSlug = form.publicSlug ?? generateBase62Code(12);
    const printCode = `F${publicSlug.slice(0, 4).toUpperCase()}-v${versionNumber}`;
    const now = new Date().toISOString();

    const version = await this.surveyRecordsService.withRepository<
      SurveyFormVersionRecord,
      SurveyFormVersionRecord
    >(workspaceId, 'surveyFormVersion', async (repository) => {
      const existing = await repository.findOne({
        where: { formId, versionNumber },
      });

      if (existing !== null) {
        throw new SurveyException(
          'This version was just published by someone else. Reload.',
          SurveyExceptionCode.DRAFT_CONFLICT,
        );
      }

      return repository.save(
        buildSurveyRecordValues(
          {
            name: `v${versionNumber}`,
            formId,
            versionNumber,
            // A deep copy: the draft keeps changing, the version never does.
            definition: JSON.parse(JSON.stringify(form.draftDefinition)),
            publishedAt: now,
            publishedById: actor.workspaceMemberId,
            changeNote: changeNote.slice(0, 2000),
            printCode,
          },
          actor,
        ) as Partial<SurveyFormVersionRecord>,
      ) as Promise<SurveyFormVersionRecord>;
    });

    await this.surveyRecordsService.withRepository<SurveyFormRecord, unknown>(
      workspaceId,
      'surveyForm',
      (repository) =>
        repository.update(formId, {
          formStatus: form.formStatus === 'CLOSED' ? 'CLOSED' : 'PUBLISHED',
          publishedVersionId: version.id,
          currentVersionNumber: versionNumber,
          hasUnpublishedChanges: false,
          publicSlug,
        }),
    );

    return {
      versionId: version.id,
      versionNumber,
      printCode,
      publicSlug,
    };
  }

  async changeStatus({
    workspaceId,
    formId,
    status,
  }: {
    workspaceId: string;
    formId: string;
    status: SurveyFormStatus;
  }): Promise<{ formStatus: SurveyFormStatus }> {
    const form = await this.surveyRecordsService.findFormById(
      workspaceId,
      formId,
    );
    const current = form.formStatus ?? 'DRAFT';

    if (current === status) {
      return { formStatus: status };
    }

    const reopeningWithoutVersion =
      status === 'PUBLISHED' && form.publishedVersionId === null;
    const unarchivingToClosedWithoutVersion =
      status === 'CLOSED' && form.publishedVersionId === null;

    if (
      !ALLOWED_STATUS_CHANGES[current].includes(status) ||
      reopeningWithoutVersion ||
      unarchivingToClosedWithoutVersion
    ) {
      throw new SurveyException(
        `Cannot change a ${current} form to ${status}`,
        SurveyExceptionCode.INVALID_STATUS_CHANGE,
      );
    }

    await this.surveyRecordsService.withRepository<SurveyFormRecord, unknown>(
      workspaceId,
      'surveyForm',
      (repository) => repository.update(formId, { formStatus: status }),
    );

    return { formStatus: status };
  }
}
