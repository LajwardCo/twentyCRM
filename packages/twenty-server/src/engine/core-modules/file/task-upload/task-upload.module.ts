import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FilesFieldModule } from 'src/engine/core-modules/file/files-field/files-field.module';
import { TaskUploadController } from 'src/engine/core-modules/file/task-upload/controllers/task-upload.controller';
import { TaskUploadResolver } from 'src/engine/core-modules/file/task-upload/resolvers/task-upload.resolver';
import { TaskUploadService } from 'src/engine/core-modules/file/task-upload/services/task-upload.service';
import { JwtModule } from 'src/engine/core-modules/jwt/jwt.module';
import { RecordCrudModule } from 'src/engine/core-modules/record-crud/record-crud.module';
import { ThrottlerModule } from 'src/engine/core-modules/throttler/throttler.module';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';

// GlobalWorkspaceOrmManager + TwentyConfigService are provided by @Global()
// modules, so they don't need to be imported here.
@Module({
  imports: [
    JwtModule,
    FilesFieldModule,
    RecordCrudModule,
    ThrottlerModule,
    PermissionsModule,
    TypeOrmModule.forFeature([ObjectMetadataEntity, FieldMetadataEntity]),
  ],
  providers: [TaskUploadService, TaskUploadResolver],
  controllers: [TaskUploadController],
})
export class TaskUploadModule {}
