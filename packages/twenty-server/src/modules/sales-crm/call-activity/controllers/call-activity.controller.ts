import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import { RestApiExceptionFilter } from 'src/engine/api/rest/rest-api-exception.filter';
import type { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { CreateCallActivityInput } from 'src/modules/sales-crm/call-activity/dtos/create-call-activity.input';
import { CallActivityIngestService } from 'src/modules/sales-crm/call-activity/services/call-activity-ingest.service';
import { CallActivityReportService } from 'src/modules/sales-crm/call-activity/services/call-activity-report.service';
import { PhoneIndexService } from 'src/modules/sales-crm/call-activity/services/phone-index.service';

@Controller('rest/sales')
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard)
@UseFilters(RestApiExceptionFilter)
export class CallActivityController {
  constructor(
    private readonly callActivityIngestService: CallActivityIngestService,
    private readonly callActivityReportService: CallActivityReportService,
    private readonly phoneIndexService: PhoneIndexService,
  ) {}

  @Get('phone-index')
  async getPhoneIndex(@AuthWorkspace() workspace: WorkspaceEntity) {
    return { entries: await this.phoneIndexService.listForWorkspace(workspace.id) };
  }

  @Post('call-activities')
  async createCallActivity(
    @Body() body: CreateCallActivityInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ) {
    // The agent is always the caller's own workspace member, never a value the
    // client supplies — otherwise a device could log calls as someone else.
    return this.callActivityIngestService.ingest({
      workspaceId: workspace.id,
      agentId: workspaceMemberId,
      input: body,
    });
  }

  @Get('call-activity-report')
  async getCallActivityReport(
    @Query('from') from: string,
    @Query('to') to: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ) {
    return {
      totals: await this.callActivityReportService.dailyTotals({
        workspaceId: workspace.id,
        fromIso: from,
        toIso: to,
      }),
    };
  }
}
