import {
  Body,
  Controller,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import { RestApiExceptionFilter } from 'src/engine/api/rest/rest-api-exception.filter';
import type { UserEntity } from 'src/engine/core-modules/user/user.entity';
import type { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { CreateAuditEventsInput } from 'src/modules/sales-crm/audit-log/dtos/create-audit-events.input';
import { AuditLogIngestService } from 'src/modules/sales-crm/audit-log/services/audit-log-ingest.service';
import {
  clientIpFrom,
  sanitizeAuditEvents,
} from 'src/modules/sales-crm/audit-log/utils/sanitize-audit-event.util';

type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
};

@Controller('rest/sales')
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard)
@UseFilters(RestApiExceptionFilter)
export class AuditLogController {
  constructor(private readonly auditLogIngestService: AuditLogIngestService) {}

  /**
   * Files a batch of activity events for the calling user.
   *
   * Note what is NOT read from the body: who did it. The token decides that,
   * so the log cannot be poisoned with events attributed to someone else --
   * which would be the cheapest way to make a genuine trail useless.
   */
  // NoPermissionGuard is deliberate, not an omission: filing your own activity
  // is a self-service operation. Every signed-in member must be able to do it
  // for the log to be complete, and no member gains anything by it -- the rows
  // are written with the server's own privileges and readable only by admins.
  @Post('audit-events')
  @UseGuards(NoPermissionGuard)
  async createAuditEvents(
    @Body() body: CreateAuditEventsInput,
    @Req() request: RequestLike,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUser() user: UserEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ) {
    const events = sanitizeAuditEvents(body?.events);

    const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();

    return this.auditLogIngestService.ingest({
      actor: {
        workspaceId: workspace.id,
        workspaceMemberId,
        actorName: name === '' ? (user.email ?? 'unknown') : name,
        actorEmail: user.email ?? '',
        // The app's own notion of role is presentation; what the server can
        // assert here is only the identity, so the role stays a client hint
        // and reviewers read the member's real role from the Admin screen.
        actorRole: 'member',
        ipAddress: clientIpFrom(
          request.headers ?? {},
          request.ip ?? request.socket?.remoteAddress,
        ),
      },
      events,
    });
  }
}
