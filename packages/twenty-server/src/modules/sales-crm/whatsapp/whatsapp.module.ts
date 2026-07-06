import { Module } from '@nestjs/common';

import { TwentyORMModule } from 'src/engine/twenty-orm/twenty-orm.module';
import { WhatsappResolver } from 'src/modules/sales-crm/whatsapp/resolvers/whatsapp.resolver';
import { WhatsappCloudApiClientService } from 'src/modules/sales-crm/whatsapp/services/whatsapp-cloud-api-client.service';
import { WhatsappSendMessageService } from 'src/modules/sales-crm/whatsapp/services/whatsapp-send-message.service';

@Module({
  imports: [TwentyORMModule],
  providers: [
    WhatsappCloudApiClientService,
    WhatsappSendMessageService,
    WhatsappResolver,
  ],
})
export class WhatsappModule {}
