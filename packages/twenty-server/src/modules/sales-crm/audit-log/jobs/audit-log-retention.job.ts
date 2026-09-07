import { Injectable, Logger } from '@nestjs/common';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { AuditLogRetentionService } from 'src/modules/sales-crm/audit-log/services/audit-log-retention.service';

export type AuditLogRetentionJobData = {
  workspaceId: string;
};

@Injectable()
@Processor(MessageQueue.workspaceQueue)
export class AuditLogRetentionJob {
  private readonly logger = new Logger(AuditLogRetentionJob.name);

  constructor(
    private readonly auditLogRetentionService: AuditLogRetentionService,
  ) {}

  @Process(AuditLogRetentionJob.name)
  async handle(data: AuditLogRetentionJobData): Promise<void> {
    const { workspaceId } = data;

    try {
      await this.auditLogRetentionService.pruneWorkspace(workspaceId);
    } catch (error) {
      this.logger.error(
        `Audit log retention failed for workspace ${workspaceId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
