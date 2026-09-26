import { Injectable, Logger } from '@nestjs/common';

import {
  type AnswerValue,
  type FileAnswer,
  type FormDefinition,
  type FormEnding,
  buildQuestionIndex,
  evaluateForm,
  toPublicDefinition,
  validateResponse,
} from 'twenty-shared/surveys';

import { WorkspaceDomainsService } from 'src/engine/core-modules/domain/workspace-domains/services/workspace-domains.service';
import { ThrottlerService } from 'src/engine/core-modules/throttler/throttler.service';
import {
  SURVEY_MIN_FILL_MILLISECONDS,
  SURVEY_PUBLIC_ACTOR_NAME,
  SURVEY_READ_RATE_LIMIT_PER_IP,
  SURVEY_SUBMIT_RATE_LIMIT_PER_FORM,
  SURVEY_SUBMIT_RATE_LIMIT_PER_IP,
  SURVEY_SUBMIT_RATE_LIMIT_PER_IP_ANY_FORM,
  SURVEY_UPLOAD_RATE_LIMIT_PER_IP,
} from 'src/modules/sales-crm/surveys/constants/survey.constants';
import { SurveyAutomationService } from 'src/modules/sales-crm/surveys/services/survey-automation.service';
import { SurveyInvitationService } from 'src/modules/sales-crm/surveys/services/survey-invitation.service';
import { SurveyRecordsService } from 'src/modules/sales-crm/surveys/services/survey-records.service';
import {
  type PendingSurveyUpload,
  SurveyUploadService,
} from 'src/modules/sales-crm/surveys/services/survey-upload.service';
import {
  SurveyException,
  SurveyExceptionCode,
} from 'src/modules/sales-crm/surveys/survey.exception';
import { type SurveyPublicState } from 'src/modules/sales-crm/surveys/types/survey-public-state.type';
import {
  type SurveyCampaignRecord,
  type SurveyCrmAction,
  type SurveyFormRecord,
  type SurveyInvitationRecord,
  type SurveyResponseRecord,
} from 'src/modules/sales-crm/surveys/types/survey-records.type';
import { buildSurveyRecordValues } from 'src/modules/sales-crm/surveys/utils/build-survey-record-values.util';
import { computeSurveyPublicState } from 'src/modules/sales-crm/surveys/utils/compute-survey-public-state.util';
import { deriveSurveyResponseName } from 'src/modules/sales-crm/surveys/utils/derive-survey-response-name.util';
import { parsePublicSubmission } from 'src/modules/sales-crm/surveys/utils/parse-public-submission.util';
import { isWellFormedPublicSlug } from 'src/modules/sales-crm/surveys/utils/survey-tokens.util';

export type PublicFormPayload = {
  state: SurveyPublicState;
  title?: string;
  versionNumber?: number;
  definition?: FormDefinition;
};

export type PublicSubmissionResult = {
  ok: true;
  ending: Pick<FormEnding, 'title' | 'message'> | null;
};

type ResolvedForm = {
  workspaceId: string;
  form: SurveyFormRecord;
  invitation: SurveyInvitationRecord | null | undefined;
  state: SurveyPublicState;
};

const PUBLIC_ACTOR = {
  name: SURVEY_PUBLIC_ACTOR_NAME,
  workspaceMemberId: null,
};

const isUniqueViolation = (error: unknown): boolean =>
  /duplicate key|duplicate entry|unique constraint|23505/i.test(
    error instanceof Error ? error.message : String(error),
  );

// Everything a respondent without an account can do. The workspace comes from
// the request origin (like Twenty's own public login page) and every lookup is
// scoped to it; nothing returned here carries a record id or staff-only data.
@Injectable()
export class SurveyPublicService {
  private readonly logger = new Logger(SurveyPublicService.name);

  constructor(
    private readonly workspaceDomainsService: WorkspaceDomainsService,
    private readonly throttlerService: ThrottlerService,
    private readonly surveyRecordsService: SurveyRecordsService,
    private readonly surveyInvitationService: SurveyInvitationService,
    private readonly surveyUploadService: SurveyUploadService,
    private readonly surveyAutomationService: SurveyAutomationService,
  ) {}

  async getPublicForm({
    origin,
    slug,
    inviteToken,
    ip,
  }: {
    origin: string;
    slug: string;
    inviteToken: string | null;
    ip: string | null;
  }): Promise<PublicFormPayload> {
    await this.throttle(
      `survey-read:${ip ?? 'unknown'}`,
      SURVEY_READ_RATE_LIMIT_PER_IP,
    );

    const resolved = await this.resolveForm({ origin, slug, inviteToken });

    if (resolved === null) {
      return { state: 'INVALID' };
    }

    if (resolved.state !== 'OPEN') {
      return {
        state: resolved.state,
        title:
          resolved.state === 'INVALID' ? undefined : (resolved.form.name ?? ''),
      };
    }

    const version = await this.surveyRecordsService.findVersion(
      resolved.workspaceId,
      { id: resolved.form.publishedVersionId as string },
    );

    if (version?.definition === null || version === null) {
      return { state: 'INVALID' };
    }

    return {
      state: 'OPEN',
      title: resolved.form.name ?? '',
      versionNumber: version.versionNumber ?? 1,
      definition: toPublicDefinition(version.definition),
    };
  }

  async uploadFile({
    origin,
    slug,
    body,
    file,
    ip,
  }: {
    origin: string;
    slug: string;
    body: Record<string, unknown>;
    file: { buffer: Buffer; originalname: string; mimetype: string };
    ip: string | null;
  }): Promise<FileAnswer> {
    await this.throttle(
      `survey-upload:${ip ?? 'unknown'}`,
      SURVEY_UPLOAD_RATE_LIMIT_PER_IP,
    );

    const submissionKey =
      typeof body.submissionKey === 'string'
        ? body.submissionKey.toLowerCase()
        : '';
    const questionId =
      typeof body.questionId === 'string' ? body.questionId : '';
    const versionNumber = Number(body.versionNumber);
    const inviteToken =
      typeof body.inviteToken === 'string' && body.inviteToken !== ''
        ? body.inviteToken
        : null;

    const resolved = await this.resolveForm({ origin, slug, inviteToken });

    if (resolved === null || resolved.state !== 'OPEN') {
      throw new SurveyException(
        'This form is not accepting responses',
        SurveyExceptionCode.FORM_NOT_OPEN,
        { state: resolved?.state ?? 'INVALID' },
      );
    }

    const version = Number.isInteger(versionNumber)
      ? await this.surveyRecordsService.findVersion(resolved.workspaceId, {
          formId: resolved.form.id,
          versionNumber,
        })
      : null;
    const question =
      version?.definition === null || version === null
        ? undefined
        : buildQuestionIndex(toPublicDefinition(version.definition)).get(
            questionId,
          );

    if (
      question === undefined ||
      question.type !== 'file' ||
      !/^[0-9a-f-]{36}$/.test(submissionKey)
    ) {
      throw new SurveyException(
        'Invalid upload',
        SurveyExceptionCode.INVALID_FILE,
      );
    }

    return this.surveyUploadService.storePublicUpload({
      workspaceId: resolved.workspaceId,
      formId: resolved.form.id,
      question,
      submissionKey,
      buffer: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype,
    });
  }

  async submit({
    origin,
    slug,
    body,
    ip,
  }: {
    origin: string;
    slug: string;
    body: unknown;
    ip: string | null;
  }): Promise<PublicSubmissionResult> {
    const submission = parsePublicSubmission(body);

    // Coarse per-address cap first; the stricter per-form cap below only
    // applies to new responses, so replaying an accepted submission (a retry
    // after a dropped connection) is never throttled away.
    await this.throttle(
      `survey-submit-any:${ip ?? 'unknown'}`,
      SURVEY_SUBMIT_RATE_LIMIT_PER_IP_ANY_FORM,
    );

    const resolved = await this.resolveForm({
      origin,
      slug,
      inviteToken: submission.inviteToken,
    });

    if (resolved === null) {
      throw new SurveyException(
        'This form is not accepting responses',
        SurveyExceptionCode.FORM_NOT_OPEN,
        { state: 'INVALID' },
      );
    }

    const { workspaceId, form, invitation } = resolved;

    // A retry of a submission that already went through gets the same answer
    // back and changes nothing — even if the form has closed since.
    const existing = await this.findResponseBySubmissionKey(
      workspaceId,
      submission.submissionKey,
    );

    if (existing !== null) {
      return this.replayResult(workspaceId, form, existing);
    }

    if (resolved.state !== 'OPEN') {
      throw new SurveyException(
        'This form is not accepting responses',
        SurveyExceptionCode.FORM_NOT_OPEN,
        { state: resolved.state },
      );
    }

    await this.throttle(
      `survey-submit:${form.id}:${ip ?? 'unknown'}`,
      SURVEY_SUBMIT_RATE_LIMIT_PER_IP,
    );
    await this.throttle(
      `survey-submit-form:${workspaceId}:${form.id}`,
      SURVEY_SUBMIT_RATE_LIMIT_PER_FORM,
    );

    // Respondents finish the version they started, even if a newer one was
    // published meanwhile.
    const version = await this.surveyRecordsService.findVersion(workspaceId, {
      formId: form.id,
      versionNumber: submission.versionNumber,
    });

    if (version === null || version.definition === null) {
      throw new SurveyException(
        'This version of the form no longer exists. Reload the page.',
        SurveyExceptionCode.INVALID_SUBMISSION,
      );
    }

    const definition = version.definition;
    const validation = validateResponse(definition, submission.answers, {
      audience: 'PUBLIC',
      mode: 'COMPLETE',
    });

    if (validation.errors.length > 0) {
      throw new SurveyException(
        'Some answers need attention',
        SurveyExceptionCode.INVALID_SUBMISSION,
        { errors: validation.errors },
      );
    }

    const questionsById = buildQuestionIndex(definition);
    const fileAnswers: Record<string, FileAnswer[]> = {};

    for (const [questionId, value] of Object.entries(validation.cleanAnswers)) {
      if (questionsById.get(questionId)?.type === 'file') {
        fileAnswers[questionId] = value as FileAnswer[];
      }
    }

    const uploads = await this.surveyUploadService.redeemPublicUploads({
      workspaceId,
      formId: form.id,
      submissionKey: submission.submissionKey,
      fileAnswers,
    });

    const isSpam =
      submission.honeypotFilled ||
      (submission.startedAtMs !== null &&
        Date.now() - submission.startedAtMs < SURVEY_MIN_FILL_MILLISECONDS);
    const campaignId = await this.resolveCampaignId(
      workspaceId,
      form.id,
      submission.campaignCode,
    );
    const now = new Date().toISOString();

    const suggestions: SurveyCrmAction[] =
      invitation === undefined || invitation === null
        ? []
        : (['company', 'person', 'opportunity'] as const)
            .map((target) => ({ target, recordId: invitation[`${target}Id`] }))
            .filter(({ recordId }) => recordId !== null)
            .map(({ target, recordId }) => ({
              key: `suggest:${target}`,
              type: 'SUGGESTED_LINK',
              status: 'SUGGESTED' as const,
              at: now,
              by: null,
              target,
              recordId,
            }));

    let response: SurveyResponseRecord;

    try {
      response = await this.surveyRecordsService.withRepository<
        SurveyResponseRecord,
        SurveyResponseRecord
      >(
        workspaceId,
        'surveyResponse',
        async (repository) =>
          (await repository.save(
            buildSurveyRecordValues(
              {
                name: deriveSurveyResponseName(
                  definition,
                  validation.cleanAnswers,
                  `پاسخ آنلاین — ${form.name ?? ''}`.trim(),
                ),
                formId: form.id,
                formVersionId: version.id,
                versionNumber: version.versionNumber,
                submissionKey: submission.submissionKey,
                answers: validation.cleanAnswers,
                skippedByLogic: validation.skippedByLogic,
                language: submission.language,
                completionStatus: 'COMPLETED',
                // A forwarded invitation is not proof of identity, so its
                // intended records are suggestions staff confirm.
                reviewStatus: isSpam
                  ? 'SPAM'
                  : invitation !== undefined
                    ? 'NEEDS_REVIEW'
                    : 'NEW',
                source: invitation !== undefined ? 'INVITATION' : 'PUBLIC_LINK',
                submittedAt: now,
                collectedAt: now,
                campaignId,
                invitationId: invitation?.id ?? null,
                crmActions: suggestions,
              },
              PUBLIC_ACTOR,
            ) as Partial<SurveyResponseRecord>,
          )) as SurveyResponseRecord,
      );
    } catch (error) {
      // Two identical requests raced past the lookup above; the unique
      // submission key let exactly one of them in.
      if (isUniqueViolation(error)) {
        const winner = await this.findResponseBySubmissionKey(
          workspaceId,
          submission.submissionKey,
        );

        if (winner !== null) {
          return this.replayResult(workspaceId, form, winner);
        }
      }

      throw error;
    }

    await this.attachUploads(
      workspaceId,
      response,
      validation.cleanAnswers,
      uploads,
    );

    if (invitation !== undefined && invitation !== null) {
      await this.surveyInvitationService.markUsed(workspaceId, invitation.id);
    }

    if (!isSpam && definition.automations.some((rule) => rule.enabled)) {
      await this.surveyAutomationService
        .run({
          workspaceId,
          response,
          definition,
          formName: form.name ?? '',
          actor: PUBLIC_ACTOR,
        })
        .catch((error: unknown) =>
          this.logger.error(`Survey automations crashed: ${error}`),
        );
    }

    return {
      ok: true,
      ending: this.pickEnding(definition, validation.endingId),
    };
  }

  private async resolveForm({
    origin,
    slug,
    inviteToken,
  }: {
    origin: string;
    slug: string;
    inviteToken: string | null;
  }): Promise<ResolvedForm | null> {
    if (!isWellFormedPublicSlug(slug)) {
      return null;
    }

    let workspaceId: string | undefined;

    try {
      workspaceId = (
        await this.workspaceDomainsService.getWorkspaceByOriginOrDefaultWorkspace(
          origin,
        )
      )?.id;
    } catch {
      return null;
    }

    if (
      workspaceId === undefined ||
      (await this.surveyRecordsService.getSurveyObjectIds(workspaceId)) === null
    ) {
      return null;
    }

    const form = await this.surveyRecordsService.findFormBySlug(
      workspaceId,
      slug,
    );

    if (form === null) {
      return null;
    }

    const invitation = await this.surveyInvitationService.findByToken(
      workspaceId,
      form.id,
      inviteToken,
    );
    const completedResponses =
      typeof form.responseLimit === 'number' && form.responseLimit > 0
        ? await this.surveyRecordsService.countCompletedResponses(
            workspaceId,
            form.id,
          )
        : 0;

    return {
      workspaceId,
      form,
      invitation,
      state: computeSurveyPublicState({
        form,
        now: Date.now(),
        completedResponses,
        invitation,
      }),
    };
  }

  private async findResponseBySubmissionKey(
    workspaceId: string,
    submissionKey: string,
  ): Promise<SurveyResponseRecord | null> {
    return this.surveyRecordsService.withRepository<
      SurveyResponseRecord,
      SurveyResponseRecord | null
    >(workspaceId, 'surveyResponse', (repository) =>
      repository.findOne({ where: { submissionKey }, withDeleted: true }),
    );
  }

  private async replayResult(
    workspaceId: string,
    form: SurveyFormRecord,
    existing: SurveyResponseRecord,
  ): Promise<PublicSubmissionResult> {
    if (existing.formId !== form.id) {
      throw new SurveyException(
        'Invalid submission',
        SurveyExceptionCode.INVALID_SUBMISSION,
      );
    }

    const version =
      existing.formVersionId === null
        ? null
        : await this.surveyRecordsService.findVersion(workspaceId, {
            id: existing.formVersionId,
          });

    if (version?.definition === null || version === null) {
      return { ok: true, ending: null };
    }

    const evaluation = evaluateForm(
      version.definition,
      existing.answers ?? {},
      {
        audience: 'PUBLIC',
      },
    );

    return {
      ok: true,
      ending: this.pickEnding(version.definition, evaluation.endingId),
    };
  }

  private pickEnding(
    definition: FormDefinition,
    endingId: string | null,
  ): Pick<FormEnding, 'title' | 'message'> | null {
    const ending =
      definition.endings.find((candidate) => candidate.id === endingId) ??
      definition.endings[0];

    return ending === undefined
      ? null
      : { title: ending.title, message: ending.message };
  }

  // Attribution codes are only honoured for an active campaign that this form
  // belongs to; anything else in the URL is ignored.
  private async resolveCampaignId(
    workspaceId: string,
    formId: string,
    campaignCode: string | null,
  ): Promise<string | null> {
    if (campaignCode === null || !/^[A-Za-z0-9]{4,32}$/.test(campaignCode)) {
      return null;
    }

    const campaign = await this.surveyRecordsService.withRepository<
      SurveyCampaignRecord,
      SurveyCampaignRecord | null
    >(workspaceId, 'surveyCampaign', (repository) =>
      repository.findOne({ where: { publicCode: campaignCode } }),
    );

    return campaign !== null &&
      campaign.campaignStatus === 'ACTIVE' &&
      Array.isArray(campaign.formIds) &&
      campaign.formIds.includes(formId)
      ? campaign.id
      : null;
  }

  // Creates the attachment records and swaps each file answer's upload
  // reference (a short-lived secret) for its permanent attachment id.
  private async attachUploads(
    workspaceId: string,
    response: SurveyResponseRecord,
    cleanAnswers: Record<string, AnswerValue>,
    uploads: Record<string, PendingSurveyUpload[]>,
  ): Promise<void> {
    const allUploads = Object.values(uploads).flat();

    if (allUploads.length === 0) {
      return;
    }

    const attachmentIds = await this.surveyUploadService.attachToResponse({
      workspaceId,
      responseId: response.id,
      uploads: allUploads,
      actor: PUBLIC_ACTOR,
    });

    const answers = { ...cleanAnswers };

    for (const [questionId, pending] of Object.entries(uploads)) {
      answers[questionId] = pending.map((upload) => ({
        ref: `attachment:${attachmentIds.get(upload.fileId) ?? ''}`,
        name: upload.name,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
      }));
    }

    await this.surveyRecordsService.withRepository<
      SurveyResponseRecord,
      unknown
    >(workspaceId, 'surveyResponse', (repository) =>
      repository.update(response.id, { answers }),
    );
  }

  private async throttle(
    key: string,
    { maxTokens, windowMs }: { maxTokens: number; windowMs: number },
  ): Promise<void> {
    try {
      await this.throttlerService.tokenBucketThrottleOrThrow(
        key,
        1,
        maxTokens,
        windowMs,
      );
    } catch {
      throw new SurveyException(
        'Too many requests. Please wait a few minutes and try again.',
        SurveyExceptionCode.RATE_LIMITED,
      );
    }
  }
}
