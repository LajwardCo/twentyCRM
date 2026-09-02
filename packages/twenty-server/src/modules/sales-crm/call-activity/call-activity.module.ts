import { Module } from '@nestjs/common';

import { TokenModule } from 'src/engine/core-modules/auth/token/token.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';
import { CallActivityController } from 'src/modules/sales-crm/call-activity/controllers/call-activity.controller';
import { CallActivityIngestService } from 'src/modules/sales-crm/call-activity/services/call-activity-ingest.service';
import { CallTranscriptionService } from 'src/modules/sales-crm/call-activity/services/call-transcription.service';
import { CallActivityReportService } from 'src/modules/sales-crm/call-activity/services/call-activity-report.service';
import { PhoneIndexService } from 'src/modules/sales-crm/call-activity/services/phone-index.service';

@Module({
  imports: [TokenModule, WorkspaceCacheStorageModule],
  controllers: [CallActivityController],
  providers: [
    CallActivityIngestService,
    CallActivityReportService,
    CallTranscriptionService,
    PhoneIndexService,
  ],
  exports: [
    CallActivityIngestService,
    CallActivityReportService,
    PhoneIndexService,
  ],
})
export class CallActivityModule {}
