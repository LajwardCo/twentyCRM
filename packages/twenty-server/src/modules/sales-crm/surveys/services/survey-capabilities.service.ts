import { Injectable } from '@nestjs/common';

import { PermissionFlagType } from 'twenty-shared/constants';

import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { SurveyRecordsService } from 'src/modules/sales-crm/surveys/services/survey-records.service';
import {
  SurveyException,
  SurveyExceptionCode,
} from 'src/modules/sales-crm/surveys/survey.exception';

export type SurveyCapabilities = {
  supported: boolean;
  canViewForms: boolean;
  canBuild: boolean;
  canPublish: boolean;
  canManageCampaigns: boolean;
  canCollect: boolean;
  canInvite: boolean;
  canEditResponses: boolean;
  canExport: boolean;
  // Owner-scoped roles (Marketer, Partner) only act on responses they
  // collected or entered themselves.
  ownResponsesOnly: boolean;
};

export type SurveyCapability = Exclude<keyof SurveyCapabilities, 'supported'>;

const NONE: SurveyCapabilities = {
  supported: false,
  canViewForms: false,
  canBuild: false,
  canPublish: false,
  canManageCampaigns: false,
  canCollect: false,
  canInvite: false,
  canEditResponses: false,
  canExport: false,
  ownResponsesOnly: true,
};

// Survey permissions are ordinary Twenty object permissions, so they are
// managed on the Roles screen like everything else. This translates them into
// the capabilities the UI and the endpoints reason about:
//   publish = update on surveyFormVersion (versions are only ever written by
//   the publish endpoint, so the grant is otherwise meaningless — a clean
//   place to express "may publish").
@Injectable()
export class SurveyCapabilitiesService {
  constructor(
    private readonly permissionsService: PermissionsService,
    private readonly surveyRecordsService: SurveyRecordsService,
  ) {}

  async getCapabilities({
    workspaceId,
    userWorkspaceId,
  }: {
    workspaceId: string;
    userWorkspaceId: string;
  }): Promise<SurveyCapabilities> {
    const objectIds =
      await this.surveyRecordsService.getSurveyObjectIds(workspaceId);

    if (objectIds === null) {
      return NONE;
    }

    const { objectsPermissions, permissionFlags } =
      await this.permissionsService.getUserWorkspacePermissions({
        userWorkspaceId,
        workspaceId,
      });

    const can = (
      objectName: keyof typeof objectIds,
      action: 'read' | 'update',
    ): boolean => {
      const permissions = objectsPermissions[objectIds[objectName]];

      if (permissions === undefined) {
        return false;
      }

      return action === 'read'
        ? permissions.canReadObjectRecords
        : permissions.canReadObjectRecords &&
            permissions.canUpdateObjectRecords;
    };

    return {
      supported: true,
      canViewForms: can('surveyForm', 'read'),
      canBuild: can('surveyForm', 'update'),
      canPublish:
        can('surveyForm', 'update') && can('surveyFormVersion', 'update'),
      canManageCampaigns: can('surveyCampaign', 'update'),
      canCollect: can('surveyForm', 'read') && can('surveyResponse', 'update'),
      canInvite: can('surveyInvitation', 'update'),
      canEditResponses: can('surveyResponse', 'update'),
      canExport:
        can('surveyResponse', 'read') &&
        permissionFlags[PermissionFlagType.EXPORT_CSV] === true,
      ownResponsesOnly:
        objectsPermissions[objectIds.surveyResponse]
          ?.canOnlyAccessOwnedRecords === true,
    };
  }

  async assertCapability(
    context: { workspaceId: string; userWorkspaceId: string },
    capability: SurveyCapability,
  ): Promise<SurveyCapabilities> {
    const capabilities = await this.getCapabilities(context);

    if (!capabilities.supported) {
      throw new SurveyException(
        'Surveys are not set up in this workspace',
        SurveyExceptionCode.NOT_PROVISIONED,
      );
    }

    if (!capabilities[capability]) {
      throw new SurveyException(
        'You do not have permission to do this',
        SurveyExceptionCode.FORBIDDEN,
      );
    }

    return capabilities;
  }
}
