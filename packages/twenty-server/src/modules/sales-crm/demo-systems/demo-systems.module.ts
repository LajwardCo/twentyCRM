import { Module } from '@nestjs/common';

import { TokenModule } from 'src/engine/core-modules/auth/token/token.module';
import { DemoSystemsController } from 'src/modules/sales-crm/demo-systems/controllers/demo-systems.controller';
import { DemoSystemsService } from 'src/modules/sales-crm/demo-systems/services/demo-systems.service';

@Module({
  imports: [TokenModule],
  controllers: [DemoSystemsController],
  providers: [DemoSystemsService],
  exports: [DemoSystemsService],
})
export class DemoSystemsModule {}
