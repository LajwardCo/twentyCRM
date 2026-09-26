import { Injectable } from '@nestjs/common';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type UpdateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { SurveyWriteGuardService } from 'src/modules/sales-crm/surveys/services/survey-write-guard.service';

@Injectable()
@WorkspaceQueryHook(`surveyFormVersion.updateOne`)
export class SurveyFormVersionUpdateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly surveyWriteGuardService: SurveyWriteGuardService,
  ) {}

  execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    _payload: UpdateOneResolverArgs,
  ): never {
    return this.surveyWriteGuardService.rejectDirectWrite('surveyFormVersion');
  }
}
