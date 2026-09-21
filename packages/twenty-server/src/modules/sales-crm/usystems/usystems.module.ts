import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TokenModule } from 'src/engine/core-modules/auth/token/token.module';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';
import { UsystemsController } from 'src/modules/sales-crm/usystems/controllers/usystems.controller';
import { UsystemsClientService } from 'src/modules/sales-crm/usystems/services/usystems-client.service';

// TokenModule and WorkspaceCacheStorageModule are what JwtAuthGuard and
// WorkspaceAuthGuard resolve their dependencies from (same as AuditLogModule).
@Module({
  imports: [
    TokenModule,
    WorkspaceCacheStorageModule,
    TypeOrmModule.forFeature([WorkspaceEntity]),
  ],
  controllers: [UsystemsController],
  providers: [UsystemsClientService],
  exports: [UsystemsClientService],
})
export class UsystemsModule {}
