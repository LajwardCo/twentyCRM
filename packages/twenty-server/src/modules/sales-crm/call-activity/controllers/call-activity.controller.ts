import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Query,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { RestApiExceptionFilter } from 'src/engine/api/rest/rest-api-exception.filter';
import type { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { CreateCallActivityInput } from 'src/modules/sales-crm/call-activity/dtos/create-call-activity.input';
import { CallActivityIngestService } from 'src/modules/sales-crm/call-activity/services/call-activity-ingest.service';
import { CallActivityReportService } from 'src/modules/sales-crm/call-activity/services/call-activity-report.service';
import { CallTranscriptionService } from 'src/modules/sales-crm/call-activity/services/call-transcription.service';
import { PhoneIndexService } from 'src/modules/sales-crm/call-activity/services/phone-index.service';

// Minimal shape of a Multer-parsed upload (avoids depending on @types/multer).
type UploadedMulterFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

/** Recordings of a phone call; nginx caps the request body first in production. */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

@Controller('rest/sales')
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard)
@UseFilters(RestApiExceptionFilter)
export class CallActivityController {
  constructor(
    private readonly callActivityIngestService: CallActivityIngestService,
    private readonly callActivityReportService: CallActivityReportService,
    private readonly phoneIndexService: PhoneIndexService,
    private readonly callTranscriptionService: CallTranscriptionService,
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

  /**
   * Transcribes an uploaded recording and stores the text on the call.
   *
   * The device posts the audio directly rather than the server pulling it from
   * object storage: the phone already holds the file, and this keeps the
   * transcription path working before recording upload to Spaces is wired.
   */
  @Post('call-activities/:id/transcribe')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_AUDIO_BYTES } }),
  )
  async transcribeCallActivity(
    @Param('id') callActivityId: string,
    @UploadedFile() file: UploadedMulterFile | undefined,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ) {
    if (!file) {
      throw new HttpException({ message: 'Missing audio file' }, 400);
    }

    if (!this.callTranscriptionService.isConfigured()) {
      throw new HttpException(
        { message: 'Transcription is not configured on this server' },
        503,
      );
    }

    const result = await this.callTranscriptionService.transcribe({
      audio: file.buffer,
      filename: file.originalname || 'call.m4a',
      mimeType: file.mimetype || 'audio/mpeg',
    });

    await this.callActivityIngestService.saveTranscript({
      workspaceId: workspace.id,
      callActivityId,
      transcript: result.text,
      language: result.language,
    });

    return { transcript: result.text, language: result.language };
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
