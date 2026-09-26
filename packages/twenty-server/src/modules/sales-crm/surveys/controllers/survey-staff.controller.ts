import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { type FormDefinition } from 'twenty-shared/surveys';

import type { UserEntity } from 'src/engine/core-modules/user/user.entity';
import type { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { SurveyAutomationService } from 'src/modules/sales-crm/surveys/services/survey-automation.service';
import {
  type SurveyCapabilities,
  SurveyCapabilitiesService,
} from 'src/modules/sales-crm/surveys/services/survey-capabilities.service';
import {
  type CreatedInvitation,
  type InvitationTarget,
  SurveyInvitationService,
} from 'src/modules/sales-crm/surveys/services/survey-invitation.service';
import {
  type PublishResult,
  SurveyPublishService,
} from 'src/modules/sales-crm/surveys/services/survey-publish.service';
import { SurveyRecordsService } from 'src/modules/sales-crm/surveys/services/survey-records.service';
import {
  SurveyException,
  SurveyExceptionCode,
} from 'src/modules/sales-crm/surveys/survey.exception';
import {
  type SurveyCrmAction,
  type SurveyFormStatus,
  type SurveyResponseRecord,
} from 'src/modules/sales-crm/surveys/types/survey-records.type';
import { toSurveyHttpException } from 'src/modules/sales-crm/surveys/utils/to-survey-http-exception.util';

const FORM_STATUSES: SurveyFormStatus[] = [
  'DRAFT',
  'PUBLISHED',
  'CLOSED',
  'ARCHIVED',
];

const actorNameOf = (user: UserEntity): string => {
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();

  return name === '' ? (user.email ?? 'staff') : name;
};

// Staff operations that must not be done through plain record writes. Each
// checks the caller's survey capability, derived from their role.
@Controller('rest/sales/surveys')
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard, NoPermissionGuard)
export class SurveyStaffController {
  private readonly logger = new Logger(SurveyStaffController.name);

  constructor(
    private readonly surveyCapabilitiesService: SurveyCapabilitiesService,
    private readonly surveyPublishService: SurveyPublishService,
    private readonly surveyInvitationService: SurveyInvitationService,
    private readonly surveyAutomationService: SurveyAutomationService,
    private readonly surveyRecordsService: SurveyRecordsService,
  ) {}

  @Get('capabilities')
  async getCapabilities(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<SurveyCapabilities> {
    try {
      return await this.surveyCapabilitiesService.getCapabilities({
        workspaceId: workspace.id,
        userWorkspaceId,
      });
    } catch (error) {
      throw toSurveyHttpException(error, this.logger);
    }
  }

  @Post('forms/:formId/publish')
  async publish(
    @Param('formId', ParseUUIDPipe) formId: string,
    @Body() body: { expectedDraftRevision?: unknown; changeNote?: unknown },
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
    @AuthUser() user: UserEntity,
  ): Promise<PublishResult> {
    try {
      await this.surveyCapabilitiesService.assertCapability(
        { workspaceId: workspace.id, userWorkspaceId },
        'canPublish',
      );

      if (typeof body?.expectedDraftRevision !== 'number') {
        throw new SurveyException(
          'expectedDraftRevision is required',
          SurveyExceptionCode.DRAFT_CONFLICT,
        );
      }

      return await this.surveyPublishService.publish({
        workspaceId: workspace.id,
        workspaceMemberId,
        actorName: actorNameOf(user),
        formId,
        expectedDraftRevision: body.expectedDraftRevision,
        changeNote: typeof body.changeNote === 'string' ? body.changeNote : '',
      });
    } catch (error) {
      throw toSurveyHttpException(error, this.logger);
    }
  }

  @Post('forms/:formId/status')
  async changeStatus(
    @Param('formId', ParseUUIDPipe) formId: string,
    @Body() body: { status?: unknown },
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<{ formStatus: SurveyFormStatus }> {
    try {
      await this.surveyCapabilitiesService.assertCapability(
        { workspaceId: workspace.id, userWorkspaceId },
        'canPublish',
      );

      if (!FORM_STATUSES.includes(body?.status as SurveyFormStatus)) {
        throw new SurveyException(
          'Unknown status',
          SurveyExceptionCode.INVALID_STATUS_CHANGE,
        );
      }

      return await this.surveyPublishService.changeStatus({
        workspaceId: workspace.id,
        formId,
        status: body.status as SurveyFormStatus,
      });
    } catch (error) {
      throw toSurveyHttpException(error, this.logger);
    }
  }

  @Post('forms/:formId/invitations')
  async createInvitations(
    @Param('formId', ParseUUIDPipe) formId: string,
    @Body()
    body: {
      targets?: unknown;
      campaignId?: unknown;
      expiresAt?: unknown;
      origin?: unknown;
    },
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
    @AuthUser() user: UserEntity,
  ): Promise<{ invitations: CreatedInvitation[] }> {
    try {
      await this.surveyCapabilitiesService.assertCapability(
        { workspaceId: workspace.id, userWorkspaceId },
        'canInvite',
      );

      if (!Array.isArray(body?.targets) || typeof body.origin !== 'string') {
        throw new SurveyException(
          'targets and origin are required',
          SurveyExceptionCode.INVALID_SUBMISSION,
        );
      }

      const invitations = await this.surveyInvitationService.createInvitations({
        workspaceId: workspace.id,
        actor: { name: actorNameOf(user), workspaceMemberId },
        formId,
        campaignId:
          typeof body.campaignId === 'string' ? body.campaignId : null,
        expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null,
        targets: body.targets.filter(
          (target): target is InvitationTarget =>
            typeof target === 'object' && target !== null,
        ),
        origin: body.origin,
      });

      return { invitations };
    } catch (error) {
      throw toSurveyHttpException(error, this.logger);
    }
  }

  // Runs (or retries failed) automations for a response; safe to call more
  // than once — completed actions are never repeated.
  @Post('responses/:responseId/automations/run')
  async runAutomations(
    @Param('responseId', ParseUUIDPipe) responseId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
    @AuthUser() user: UserEntity,
  ): Promise<{ crmActions: SurveyCrmAction[] }> {
    try {
      await this.surveyCapabilitiesService.assertCapability(
        { workspaceId: workspace.id, userWorkspaceId },
        'canEditResponses',
      );

      const response = await this.surveyRecordsService.withRepository<
        SurveyResponseRecord,
        SurveyResponseRecord | null
      >(workspace.id, 'surveyResponse', (repository) =>
        repository.findOne({ where: { id: responseId } }),
      );

      if (response === null || response.formVersionId === null) {
        throw new SurveyException(
          'Response not found',
          SurveyExceptionCode.RESPONSE_NOT_FOUND,
        );
      }

      if (
        response.completionStatus !== 'COMPLETED' ||
        response.reviewStatus === 'SPAM'
      ) {
        return { crmActions: response.crmActions ?? [] };
      }

      const version = await this.surveyRecordsService.findVersion(
        workspace.id,
        {
          id: response.formVersionId,
        },
      );
      const form =
        response.formId === null
          ? null
          : await this.surveyRecordsService.findFormById(
              workspace.id,
              response.formId,
            );

      if (version?.definition === null || version === null) {
        return { crmActions: response.crmActions ?? [] };
      }

      const crmActions = await this.surveyAutomationService.run({
        workspaceId: workspace.id,
        response,
        definition: version.definition as FormDefinition,
        formName: form?.name ?? '',
        actor: { name: actorNameOf(user), workspaceMemberId },
      });

      return { crmActions };
    } catch (error) {
      throw toSurveyHttpException(error, this.logger);
    }
  }
}
