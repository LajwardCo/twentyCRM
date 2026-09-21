import { Module } from '@nestjs/common';

import { TokenModule } from 'src/engine/core-modules/auth/token/token.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';
import { DemoSystemsController } from 'src/modules/sales-crm/demo-systems/controllers/demo-systems.controller';
import { DemoSystemsService } from 'src/modules/sales-crm/demo-systems/services/demo-systems.service';

// WorkspaceCacheStorageModule provides WorkspaceCacheStorageService, which
// JwtAuthGuard depends on (same as CallActivityModule) — without it Nest fails
// to resolve the guard and the server won't boot.
@Module({
  imports: [TokenModule, WorkspaceCacheStorageModule],
  controllers: [DemoSystemsController],
  providers: [DemoSystemsService],
  exports: [DemoSystemsService],
})
export class DemoSystemsModule {}
