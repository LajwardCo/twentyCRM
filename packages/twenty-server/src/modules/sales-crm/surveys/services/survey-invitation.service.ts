import { Injectable } from '@nestjs/common';

import { SURVEY_MAX_INVITATIONS_PER_REQUEST } from 'src/modules/sales-crm/surveys/constants/survey.constants';
import { SurveyRecordsService } from 'src/modules/sales-crm/surveys/services/survey-records.service';
import {
  SurveyException,
  SurveyExceptionCode,
} from 'src/modules/sales-crm/surveys/survey.exception';
import {
  type SurveyCampaignRecord,
  type SurveyInvitationRecord,
} from 'src/modules/sales-crm/surveys/types/survey-records.type';
import {
  buildSurveyRecordValues,
  type SurveyActor,
} from 'src/modules/sales-crm/surveys/utils/build-survey-record-values.util';
import {
  generateSecretToken,
  hashSecretToken,
  isWellFormedSecretToken,
} from 'src/modules/sales-crm/surveys/utils/survey-tokens.util';

export type InvitationTarget = {
  label?: string;
  companyId?: string;
  personId?: string;
  opportunityId?: string;
};

export type CreatedInvitation = {
  id: string;
  label: string;
  url: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const optionalUuid = (value: unknown): string | null =>
  typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;

// Builds the Sales App's public form URL on the caller's own origin.
export const buildPublicFormUrl = (
  origin: string,
  publicSlug: string,
  query: Record<string, string> = {},
): string => {
  const parsed = new URL(origin);

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new SurveyException(
      'Invalid origin',
      SurveyExceptionCode.INVALID_SUBMISSION,
    );
  }

  const search = new URLSearchParams(query).toString();

  return `${parsed.origin}/sales/#/f/${publicSlug}${search === '' ? '' : `?${search}`}`;
};

@Injectable()
export class SurveyInvitationService {
  constructor(private readonly surveyRecordsService: SurveyRecordsService) {}

  // The plain token exists only in the returned URLs; the database keeps its
  // hash, so the links cannot be recovered or re-sent from stored data.
  async createInvitations({
    workspaceId,
    actor,
    formId,
    campaignId,
    expiresAt,
    targets,
    origin,
  }: {
    workspaceId: string;
    actor: SurveyActor;
    formId: string;
    campaignId: string | null;
    expiresAt: string | null;
    targets: InvitationTarget[];
    origin: string;
  }): Promise<CreatedInvitation[]> {
    if (
      targets.length === 0 ||
      targets.length > SURVEY_MAX_INVITATIONS_PER_REQUEST
    ) {
      throw new SurveyException(
        `Create between 1 and ${SURVEY_MAX_INVITATIONS_PER_REQUEST} invitations at a time`,
        SurveyExceptionCode.INVALID_SUBMISSION,
      );
    }

    const form = await this.surveyRecordsService.findFormById(
      workspaceId,
      formId,
    );

    if (form.publicSlug === null || form.publishedVersionId === null) {
      throw new SurveyException(
        'Publish the form before creating invitations',
        SurveyExceptionCode.FORM_NOT_OPEN,
      );
    }

    const validCampaignId = optionalUuid(campaignId);

    if (validCampaignId !== null) {
      const campaign = await this.surveyRecordsService.withRepository<
        SurveyCampaignRecord,
        SurveyCampaignRecord | null
      >(workspaceId, 'surveyCampaign', (repository) =>
        repository.findOne({ where: { id: validCampaignId } }),
      );

      if (campaign === null) {
        throw new SurveyException(
          'Campaign not found',
          SurveyExceptionCode.FORM_NOT_FOUND,
        );
      }
    }

    const expiry =
      expiresAt !== null && !Number.isNaN(Date.parse(expiresAt))
        ? new Date(expiresAt).toISOString()
        : null;

    const publicSlug = form.publicSlug;

    return this.surveyRecordsService.withRepository<
      SurveyInvitationRecord,
      CreatedInvitation[]
    >(workspaceId, 'surveyInvitation', async (repository) => {
      const created: CreatedInvitation[] = [];

      for (const [index, target] of targets.entries()) {
        const token = generateSecretToken();
        const label =
          typeof target.label === 'string' && target.label.trim() !== ''
            ? target.label.trim().slice(0, 200)
            : `دعوت ${index + 1}`;

        const saved = (await repository.save(
          buildSurveyRecordValues(
            {
              name: label,
              formId,
              campaignId: validCampaignId,
              companyId: optionalUuid(target.companyId),
              personId: optionalUuid(target.personId),
              opportunityId: optionalUuid(target.opportunityId),
              tokenHash: hashSecretToken(token),
              invitationStatus: 'ACTIVE',
              expiresAt: expiry,
            },
            actor,
          ) as Partial<SurveyInvitationRecord>,
        )) as SurveyInvitationRecord;

        created.push({
          id: saved.id,
          label,
          url: buildPublicFormUrl(origin, publicSlug, { i: token }),
        });
      }

      return created;
    });
  }

  // undefined = no token supplied; null = supplied but unknown / other form.
  async findByToken(
    workspaceId: string,
    formId: string,
    token: string | null,
  ): Promise<SurveyInvitationRecord | null | undefined> {
    if (token === null) {
      return undefined;
    }

    if (!isWellFormedSecretToken(token)) {
      return null;
    }

    const invitation = await this.surveyRecordsService.withRepository<
      SurveyInvitationRecord,
      SurveyInvitationRecord | null
    >(workspaceId, 'surveyInvitation', (repository) =>
      repository.findOne({ where: { tokenHash: hashSecretToken(token) } }),
    );

    return invitation !== null && invitation.formId === formId
      ? invitation
      : null;
  }

  async markUsed(workspaceId: string, invitationId: string): Promise<void> {
    await this.surveyRecordsService.withRepository<
      SurveyInvitationRecord,
      unknown
    >(workspaceId, 'surveyInvitation', (repository) =>
      repository.update(invitationId, {
        invitationStatus: 'USED',
        usedAt: new Date().toISOString(),
      }),
    );
  }
}
