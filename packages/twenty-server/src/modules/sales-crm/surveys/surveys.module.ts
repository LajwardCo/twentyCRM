import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TokenModule } from 'src/engine/core-modules/auth/token/token.module';
import { WorkspaceDomainsModule } from 'src/engine/core-modules/domain/workspace-domains/workspace-domains.module';
import { FilesFieldModule } from 'src/engine/core-modules/file/files-field/files-field.module';
import { ThrottlerModule } from 'src/engine/core-modules/throttler/throttler.module';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';
import { SurveyPublicController } from 'src/modules/sales-crm/surveys/controllers/survey-public.controller';
import { SurveyStaffController } from 'src/modules/sales-crm/surveys/controllers/survey-staff.controller';
import { SurveyAutomationService } from 'src/modules/sales-crm/surveys/services/survey-automation.service';
import { SurveyCapabilitiesService } from 'src/modules/sales-crm/surveys/services/survey-capabilities.service';
import { SurveyInvitationService } from 'src/modules/sales-crm/surveys/services/survey-invitation.service';
import { SurveyPublicService } from 'src/modules/sales-crm/surveys/services/survey-public.service';
import { SurveyPublishService } from 'src/modules/sales-crm/surveys/services/survey-publish.service';
import { SurveyRecordsService } from 'src/modules/sales-crm/surveys/services/survey-records.service';
import { SurveyUploadService } from 'src/modules/sales-crm/surveys/services/survey-upload.service';

// TokenModule + WorkspaceCacheStorageModule back JwtAuthGuard and
// WorkspaceAuthGuard; PermissionsModule backs the capability checks. Missing
// any of them fails the server at boot, not at request time.
@Module({
  imports: [
    TokenModule,
    WorkspaceCacheStorageModule,
    PermissionsModule,
    ThrottlerModule,
    FilesFieldModule,
    WorkspaceDomainsModule,
    TypeOrmModule.forFeature([
      WorkspaceEntity,
      ObjectMetadataEntity,
      FieldMetadataEntity,
    ]),
  ],
  controllers: [SurveyStaffController, SurveyPublicController],
  providers: [
    SurveyRecordsService,
    SurveyCapabilitiesService,
    SurveyPublishService,
    SurveyInvitationService,
    SurveyUploadService,
    SurveyAutomationService,
    SurveyPublicService,
  ],
})
export class SurveysModule {}
