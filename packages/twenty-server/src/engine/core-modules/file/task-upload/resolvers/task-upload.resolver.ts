import { UseGuards } from '@nestjs/common';
import { Args, Mutation } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { TaskUploadTokenDTO } from 'src/engine/core-modules/file/task-upload/dtos/task-upload-token.dto';
import { TaskUploadService } from 'src/engine/core-modules/file/task-upload/services/task-upload.service';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

@UseGuards(WorkspaceAuthGuard)
@MetadataResolver()
export class TaskUploadResolver {
  constructor(private readonly taskUploadService: TaskUploadService) {}

  // Authenticated: a logged-in seller mints an upload token for one of their
  // tasks. The token is then rendered as a QR for the field/mobile upload page.
  @Mutation(() => TaskUploadTokenDTO)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.UPLOAD_FILE))
  async generateTaskUploadToken(
    @AuthWorkspace() { id: workspaceId }: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string | null,
    @Args({ name: 'taskId', type: () => String, nullable: false })
    taskId: string,
  ): Promise<TaskUploadTokenDTO> {
    return this.taskUploadService.generateToken({
      workspaceId,
      workspaceMemberId,
      taskId,
    });
  }
}
