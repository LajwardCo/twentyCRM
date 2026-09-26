import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { TwentyORMModule } from 'src/engine/twenty-orm/twenty-orm.module';
import { SurveyCampaignCreateManyPreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-campaign-create-many.pre-query.hook';
import { SurveyCampaignCreateOnePreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-campaign-create-one.pre-query.hook';
import { SurveyCampaignUpdateManyPreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-campaign-update-many.pre-query.hook';
import { SurveyCampaignUpdateOnePreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-campaign-update-one.pre-query.hook';
import { SurveyFormCreateManyPreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-form-create-many.pre-query.hook';
import { SurveyFormCreateOnePreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-form-create-one.pre-query.hook';
import { SurveyFormDeleteManyPreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-form-delete-many.pre-query.hook';
import { SurveyFormDeleteOnePreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-form-delete-one.pre-query.hook';
import { SurveyFormUpdateManyPreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-form-update-many.pre-query.hook';
import { SurveyFormUpdateOnePreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-form-update-one.pre-query.hook';
import { SurveyFormVersionCreateManyPreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-form-version-create-many.pre-query.hook';
import { SurveyFormVersionCreateOnePreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-form-version-create-one.pre-query.hook';
import { SurveyFormVersionDeleteManyPreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-form-version-delete-many.pre-query.hook';
import { SurveyFormVersionDeleteOnePreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-form-version-delete-one.pre-query.hook';
import { SurveyFormVersionUpdateManyPreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-form-version-update-many.pre-query.hook';
import { SurveyFormVersionUpdateOnePreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-form-version-update-one.pre-query.hook';
import { SurveyInvitationCreateManyPreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-invitation-create-many.pre-query.hook';
import { SurveyInvitationCreateOnePreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-invitation-create-one.pre-query.hook';
import { SurveyInvitationUpdateManyPreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-invitation-update-many.pre-query.hook';
import { SurveyInvitationUpdateOnePreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-invitation-update-one.pre-query.hook';
import { SurveyResponseCreateManyPreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-response-create-many.pre-query.hook';
import { SurveyResponseCreateOnePreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-response-create-one.pre-query.hook';
import { SurveyResponseUpdateManyPreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-response-update-many.pre-query.hook';
import { SurveyResponseUpdateOnePreQueryHook } from 'src/modules/sales-crm/surveys/query-hooks/survey-response-update-one.pre-query.hook';
import { SurveyRecordsService } from 'src/modules/sales-crm/surveys/services/survey-records.service';
import { SurveyWriteGuardService } from 'src/modules/sales-crm/surveys/services/survey-write-guard.service';

@Module({
  imports: [TwentyORMModule, TypeOrmModule.forFeature([ObjectMetadataEntity])],
  providers: [
    SurveyRecordsService,
    SurveyWriteGuardService,
    SurveyCampaignCreateManyPreQueryHook,
    SurveyCampaignCreateOnePreQueryHook,
    SurveyCampaignUpdateManyPreQueryHook,
    SurveyCampaignUpdateOnePreQueryHook,
    SurveyFormCreateManyPreQueryHook,
    SurveyFormCreateOnePreQueryHook,
    SurveyFormDeleteManyPreQueryHook,
    SurveyFormDeleteOnePreQueryHook,
    SurveyFormUpdateManyPreQueryHook,
    SurveyFormUpdateOnePreQueryHook,
    SurveyFormVersionCreateManyPreQueryHook,
    SurveyFormVersionCreateOnePreQueryHook,
    SurveyFormVersionDeleteManyPreQueryHook,
    SurveyFormVersionDeleteOnePreQueryHook,
    SurveyFormVersionUpdateManyPreQueryHook,
    SurveyFormVersionUpdateOnePreQueryHook,
    SurveyInvitationCreateManyPreQueryHook,
    SurveyInvitationCreateOnePreQueryHook,
    SurveyInvitationUpdateManyPreQueryHook,
    SurveyInvitationUpdateOnePreQueryHook,
    SurveyResponseCreateManyPreQueryHook,
    SurveyResponseCreateOnePreQueryHook,
    SurveyResponseUpdateManyPreQueryHook,
    SurveyResponseUpdateOnePreQueryHook,
  ],
})
export class SurveyQueryHookModule {}
