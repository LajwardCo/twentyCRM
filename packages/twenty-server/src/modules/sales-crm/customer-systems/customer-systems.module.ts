import { Module } from '@nestjs/common';

import { TokenModule } from 'src/engine/core-modules/auth/token/token.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';
import { CustomerSystemsController } from 'src/modules/sales-crm/customer-systems/controllers/customer-systems.controller';
import { CustomerSystemsService } from 'src/modules/sales-crm/customer-systems/services/customer-systems.service';

// WorkspaceCacheStorageModule provides WorkspaceCacheStorageService, which
// JwtAuthGuard depends on (same as DemoSystemsModule) — without it Nest fails
// to resolve the guard and the server won't boot.
@Module({
  imports: [TokenModule, WorkspaceCacheStorageModule],
  controllers: [CustomerSystemsController],
  providers: [CustomerSystemsService],
  exports: [CustomerSystemsService],
})
export class CustomerSystemsModule {}
