import { Injectable } from '@nestjs/common';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type DeleteOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { SurveyWriteGuardService } from 'src/modules/sales-crm/surveys/services/survey-write-guard.service';

@Injectable()
@WorkspaceQueryHook(`surveyFormVersion.deleteOne`)
export class SurveyFormVersionDeleteOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly surveyWriteGuardService: SurveyWriteGuardService,
  ) {}

  execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    _payload: DeleteOneResolverArgs,
  ): never {
    return this.surveyWriteGuardService.rejectDirectWrite('surveyFormVersion');
  }
}
