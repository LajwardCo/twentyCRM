import { Injectable } from '@nestjs/common';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type CreateManyResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { SurveyWriteGuardService } from 'src/modules/sales-crm/surveys/services/survey-write-guard.service';

@Injectable()
@WorkspaceQueryHook(`surveyCampaign.createMany`)
export class SurveyCampaignCreateManyPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly surveyWriteGuardService: SurveyWriteGuardService,
  ) {}

  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CreateManyResolverArgs,
  ): Promise<CreateManyResolverArgs> {
    if (payload.upsert === true) {
      this.surveyWriteGuardService.rejectDirectWrite('surveyCampaign');
    }

    return {
      ...payload,
      data: payload.data.map(
        (data) =>
          this.surveyWriteGuardService.prepareCampaignCreate(
            data as Record<string, unknown>,
          ) as CreateManyResolverArgs['data'][number],
      ),
    };
  }
}
