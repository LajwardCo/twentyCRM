import { Injectable } from '@nestjs/common';

import { msg } from '@lingui/core/macro';
import { randomUUID } from 'crypto';
import { type FormDefinition, validateResponse } from 'twenty-shared/surveys';
import { Not } from 'typeorm';

import {
  CommonQueryRunnerException,
  CommonQueryRunnerExceptionCode,
} from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { SURVEY_MAX_DRAFT_DEFINITION_BYTES } from 'src/modules/sales-crm/surveys/constants/survey.constants';
import { SurveyRecordsService } from 'src/modules/sales-crm/surveys/services/survey-records.service';
import { type SurveyResponseRecord } from 'src/modules/sales-crm/surveys/types/survey-records.type';
import { generateBase62Code } from 'src/modules/sales-crm/surveys/utils/survey-tokens.util';

type RecordData = Record<string, unknown>;

// Fields only the server's own endpoints may set.
const FORM_ENDPOINT_ONLY_FIELDS = [
  'formStatus',
  'publishedVersionId',
  'currentVersionNumber',
  'publicSlug',
  'hasUnpublishedChanges',
];

const RESPONSE_CONTENT_FIELDS = [
  'answers',
  'completionStatus',
  'formVersionId',
  'formId',
  'versionNumber',
  'skippedByLogic',
  'source',
  'paperReference',
];

const STAFF_SOURCES = ['STAFF_VISIT', 'PAPER'];

// Error messages start with a stable tag the Sales App matches on; the rest
// is for people reading logs.
const reject = (tag: string, detail = ''): never => {
  throw new CommonQueryRunnerException(
    `${tag}${detail === '' ? '' : `: ${detail}`}`,
    CommonQueryRunnerExceptionCode.INVALID_ARGS_DATA,
    { userFriendlyMessage: msg`This survey change is not allowed.` },
  );
};

const memberIdOf = (authContext: WorkspaceAuthContext): string | null =>
  authContext.type === 'user' ? authContext.workspaceMemberId : null;

const assertDefinitionSize = (definition: unknown) => {
  if (
    Buffer.byteLength(JSON.stringify(definition ?? null), 'utf8') >
    SURVEY_MAX_DRAFT_DEFINITION_BYTES
  ) {
    reject('SURVEY_DEFINITION_TOO_LARGE');
  }
};

// The rules the record API must respect for survey objects, enforced in
// pre-query hooks so they hold for the Sales App, the main CRM UI, REST and
// API keys alike. Server endpoints write through the ORM directly and are not
// subject to these hooks.
@Injectable()
export class SurveyWriteGuardService {
  constructor(private readonly surveyRecordsService: SurveyRecordsService) {}

  rejectDirectWrite(objectName: string): never {
    return reject(
      'SURVEY_ENDPOINT_ONLY',
      `${objectName} records can only be changed through the survey endpoints`,
    );
  }

  prepareFormCreate(
    authContext: WorkspaceAuthContext,
    data: RecordData,
  ): RecordData {
    assertDefinitionSize(data.draftDefinition);

    return {
      ...data,
      formStatus: 'DRAFT',
      publishedVersionId: null,
      currentVersionNumber: 0,
      hasUnpublishedChanges: true,
      // Assigned up front so the unique index never sees two empty values.
      publicSlug: generateBase62Code(12),
      draftRevision: 0,
      draftUpdatedAt: new Date().toISOString(),
      ownerId: data.ownerId ?? memberIdOf(authContext),
    };
  }

  async prepareFormUpdate(
    authContext: WorkspaceAuthContext,
    formId: string,
    data: RecordData,
  ): Promise<RecordData> {
    for (const field of FORM_ENDPOINT_ONLY_FIELDS) {
      if (field in data) {
        reject('SURVEY_ENDPOINT_ONLY', `${field} is set by publishing`);
      }
    }

    if (!('draftDefinition' in data)) {
      const { draftRevision: _ignored, ...rest } = data;

      return rest;
    }

    assertDefinitionSize(data.draftDefinition);

    const existing = await this.surveyRecordsService.findFormById(
      authContext.workspace.id,
      formId,
    );

    // Autosave sends the revision it edited plus one; anything else means
    // another tab or person saved in between, and overwriting would lose work.
    if (data.draftRevision !== (existing.draftRevision ?? 0) + 1) {
      reject('SURVEY_DRAFT_CONFLICT', 'the draft was changed elsewhere');
    }

    return {
      ...data,
      hasUnpublishedChanges: true,
      draftUpdatedAt: new Date().toISOString(),
    };
  }

  assertFormUpdateMany(data: RecordData): void {
    for (const field of [
      ...FORM_ENDPOINT_ONLY_FIELDS,
      'draftDefinition',
      'draftRevision',
    ]) {
      if (field in data) {
        reject('SURVEY_ENDPOINT_ONLY', `${field} cannot be bulk-updated`);
      }
    }
  }

  async assertFormDeletable(
    authContext: WorkspaceAuthContext,
    formId: string,
  ): Promise<void> {
    const responses = await this.surveyRecordsService.withRepository(
      authContext.workspace.id,
      'surveyResponse',
      (repository) => repository.count({ where: { formId } }),
    );

    if (responses > 0) {
      reject('SURVEY_FORM_HAS_RESPONSES', 'archive the form instead');
    }
  }

  prepareCampaignCreate(data: RecordData): RecordData {
    return { ...data, publicCode: generateBase62Code(8) };
  }

  assertCampaignUpdate(data: RecordData): void {
    if ('publicCode' in data) {
      reject('SURVEY_ENDPOINT_ONLY', 'publicCode is generated');
    }
  }

  assertInvitationUpdate(data: RecordData): void {
    const allowed = new Set(['invitationStatus', 'name']);

    if (Object.keys(data).some((key) => !allowed.has(key))) {
      reject(
        'SURVEY_ENDPOINT_ONLY',
        'invitations can only be renamed or revoked',
      );
    }

    if ('invitationStatus' in data && data.invitationStatus !== 'REVOKED') {
      reject('SURVEY_ENDPOINT_ONLY', 'invitations can only be revoked');
    }
  }

  async prepareResponseCreate(
    authContext: WorkspaceAuthContext,
    data: RecordData,
  ): Promise<RecordData> {
    const source = (data.source as string | undefined) ?? 'STAFF_VISIT';

    // Public channels are only written by the public endpoint.
    if (!STAFF_SOURCES.includes(source)) {
      reject(
        'SURVEY_ENDPOINT_ONLY',
        `${source} responses come from the public form`,
      );
    }

    const memberId = memberIdOf(authContext);
    const now = new Date().toISOString();
    const completionStatus =
      (data.completionStatus as string | undefined) ?? 'PARTIAL';

    const prepared = await this.applyAnswers(authContext, {
      ...data,
      source,
      completionStatus,
      reviewStatus: data.reviewStatus ?? 'NEW',
      submissionKey:
        typeof data.submissionKey === 'string' && data.submissionKey !== ''
          ? data.submissionKey.toLowerCase()
          : randomUUID(),
      collectedAt: data.collectedAt ?? now,
      submittedAt:
        data.submittedAt ?? (completionStatus === 'COMPLETED' ? now : null),
      collectorId:
        data.collectorId ?? (source === 'STAFF_VISIT' ? memberId : null),
      enteredById: data.enteredById ?? (source === 'PAPER' ? memberId : null),
      enteredAt: data.enteredAt ?? (source === 'PAPER' ? now : null),
    });

    await this.assertPaperReferenceUnique(authContext, prepared, null);

    return prepared;
  }

  async prepareResponseUpdate(
    authContext: WorkspaceAuthContext,
    responseId: string,
    data: RecordData,
  ): Promise<RecordData> {
    if (!RESPONSE_CONTENT_FIELDS.some((field) => field in data)) {
      return data;
    }

    if ('source' in data || 'formId' in data || 'versionNumber' in data) {
      reject('SURVEY_ENDPOINT_ONLY', 'source and form cannot change');
    }

    const existing = await this.surveyRecordsService.withRepository<
      SurveyResponseRecord,
      SurveyResponseRecord | null
    >(authContext.workspace.id, 'surveyResponse', (repository) =>
      repository.findOne({ where: { id: responseId } }),
    );

    if (existing === null) {
      return data;
    }

    const merged = {
      formVersionId: existing.formVersionId,
      answers: existing.answers ?? {},
      completionStatus: existing.completionStatus ?? 'PARTIAL',
      paperReference: existing.paperReference,
      ...data,
    };
    const prepared = await this.applyAnswers(authContext, merged);

    // A response may move to another version of its own form (re-entering a
    // paper sheet against the right questionnaire), never to another form.
    if (existing.formId !== null && prepared.formId !== existing.formId) {
      reject('SURVEY_ENDPOINT_ONLY', 'a response cannot move to another form');
    }

    if (
      prepared.completionStatus === 'COMPLETED' &&
      existing.completionStatus !== 'COMPLETED' &&
      existing.submittedAt === null
    ) {
      prepared.submittedAt = new Date().toISOString();
    }

    await this.assertPaperReferenceUnique(
      authContext,
      { ...prepared, formId: existing.formId },
      responseId,
    );

    // Only send what changed, plus the derived fields.
    const {
      formVersionId: _formVersionId,
      paperReference: _paperReference,
      ...rest
    } = prepared;

    return {
      ...rest,
      ...('formVersionId' in data
        ? { formVersionId: prepared.formVersionId }
        : {}),
      ...('paperReference' in data
        ? { paperReference: prepared.paperReference }
        : {}),
    };
  }

  assertResponseUpdateMany(data: RecordData): void {
    if (RESPONSE_CONTENT_FIELDS.some((field) => field in data)) {
      reject(
        'SURVEY_ENDPOINT_ONLY',
        'answers must be edited one response at a time',
      );
    }
  }

  // Validates answers against the response's own version with the same engine
  // the public form uses, stores only the clean answers, and records which
  // questions logic skipped.
  private async applyAnswers(
    authContext: WorkspaceAuthContext,
    data: RecordData,
  ): Promise<RecordData> {
    const formVersionId = data.formVersionId;

    if (typeof formVersionId !== 'string') {
      return reject('SURVEY_VERSION_REQUIRED');
    }

    const version = await this.surveyRecordsService.findVersion(
      authContext.workspace.id,
      { id: formVersionId },
    );

    if (version === null || version.definition === null) {
      return reject('SURVEY_VERSION_REQUIRED', 'unknown form version');
    }

    const mode = data.completionStatus === 'COMPLETED' ? 'COMPLETE' : 'PARTIAL';
    const validation = validateResponse(
      version.definition as FormDefinition,
      (data.answers as Record<string, unknown> | undefined) ?? {},
      { audience: 'STAFF', mode },
    );

    if (validation.errors.length > 0) {
      reject('SURVEY_INVALID_ANSWERS', JSON.stringify(validation.errors));
    }

    return {
      ...data,
      formId: version.formId,
      versionNumber: version.versionNumber,
      answers: validation.cleanAnswers,
      skippedByLogic: validation.skippedByLogic,
    };
  }

  // A paper sheet is transcribed once per form: a second entry with the same
  // sheet reference is almost always a duplicate transcription.
  private async assertPaperReferenceUnique(
    authContext: WorkspaceAuthContext,
    data: RecordData,
    ownId: string | null,
  ): Promise<void> {
    const paperReference =
      typeof data.paperReference === 'string' ? data.paperReference.trim() : '';

    if (paperReference === '' || typeof data.formId !== 'string') {
      return;
    }

    const formId = data.formId;
    const duplicates = await this.surveyRecordsService.withRepository<
      SurveyResponseRecord,
      number
    >(authContext.workspace.id, 'surveyResponse', (repository) =>
      repository.count({
        where: {
          formId,
          paperReference,
          ...(ownId === null ? {} : { id: Not(ownId) }),
        },
      }),
    );

    if (duplicates > 0) {
      reject('SURVEY_DUPLICATE_PAPER_REFERENCE', paperReference);
    }
  }
}
