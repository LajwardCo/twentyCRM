import { Injectable } from '@nestjs/common';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type CreateManyResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { SurveyWriteGuardService } from 'src/modules/sales-crm/surveys/services/survey-write-guard.service';

@Injectable()
@WorkspaceQueryHook(`surveyResponse.createMany`)
export class SurveyResponseCreateManyPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly surveyWriteGuardService: SurveyWriteGuardService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CreateManyResolverArgs,
  ): Promise<CreateManyResolverArgs> {
    if (payload.upsert === true) {
      this.surveyWriteGuardService.rejectDirectWrite('surveyResponse');
    }

    const data: CreateManyResolverArgs['data'] = [];

    for (const record of payload.data) {
      data.push(
        (await this.surveyWriteGuardService.prepareResponseCreate(
          authContext,
          record as Record<string, unknown>,
        )) as CreateManyResolverArgs['data'][number],
      );
    }

    return { ...payload, data };
  }
}
