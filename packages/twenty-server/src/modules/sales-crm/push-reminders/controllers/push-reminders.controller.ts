import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import { RestApiExceptionFilter } from 'src/engine/api/rest/rest-api-exception.filter';
import type { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import {
  RegisterPushSubscriptionInput,
  UnregisterPushSubscriptionInput,
} from 'src/modules/sales-crm/push-reminders/dtos/push-subscription.input';
import { PushSenderService } from 'src/modules/sales-crm/push-reminders/services/push-sender.service';
import { PushSubscriptionService } from 'src/modules/sales-crm/push-reminders/services/push-subscription.service';

type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
};

// Self-service, like filing audit events: every signed-in member may register
// their own device and nobody gains anything by it -- the server only ever
// pushes a member's own reminders to a member's own subscriptions.
@Controller('rest/sales/push')
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard, NoPermissionGuard)
@UseFilters(RestApiExceptionFilter)
export class PushRemindersController {
  constructor(
    private readonly pushSenderService: PushSenderService,
    private readonly pushSubscriptionService: PushSubscriptionService,
  ) {}

  // The app reads this before subscribing; `enabled:false` (keys not
  // configured) means "stay in-app only" and is not an error.
  @Get('config')
  getConfig(): { enabled: boolean; vapidPublicKey: string | null } {
    const config = this.pushSenderService.getConfig();

    return config.enabled
      ? { enabled: true, vapidPublicKey: config.publicKey }
      : { enabled: false, vapidPublicKey: null };
  }

  @Post('subscriptions')
  register(
    @Body() body: RegisterPushSubscriptionInput,
    @Req() request: RequestLike,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<{ id: string }> {
    const headerAgent = request.headers?.['user-agent'];
    const userAgent =
      body.userAgent ??
      (Array.isArray(headerAgent) ? headerAgent[0] : headerAgent) ??
      null;

    return this.pushSubscriptionService.register({
      workspaceId: workspace.id,
      workspaceMemberId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: userAgent === null ? null : userAgent.slice(0, 512),
    });
  }

  @Delete('subscriptions')
  unregister(
    @Body() body: UnregisterPushSubscriptionInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<{ deleted: boolean }> {
    return this.pushSubscriptionService.unregister({
      workspaceId: workspace.id,
      workspaceMemberId,
      endpoint: body.endpoint,
    });
  }
}
