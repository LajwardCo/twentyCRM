import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Command, CommandRunner, Option } from 'nest-commander';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { Repository } from 'typeorm';

import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuditLogRetentionService } from 'src/modules/sales-crm/audit-log/services/audit-log-retention.service';
import { resolveAuditRetention } from 'src/modules/sales-crm/audit-log/utils/resolve-audit-retention.util';

type AuditLogPruneOptions = {
  workspaceId?: string;
  dryRun?: boolean;
};

/**
 * Runs audit retention now, instead of waiting for the nightly cron.
 *
 * Worth having beyond testing: after changing a `SALES_AUDIT_RETENTION_DAYS_*`
 * setting you want to see what the new policy would remove before it removes
 * it, which is what `--dry-run` prints. It is also how a first prune of a log
 * that has never been cleaned gets worked through under supervision.
 */
@Command({
  name: 'sales:audit-log:prune',
  description:
    'Prune expired sales app audit events now (use --dry-run to preview the policy)',
})
export class AuditLogPruneCommand extends CommandRunner {
  private readonly logger = new Logger(AuditLogPruneCommand.name);

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly auditLogRetentionService: AuditLogRetentionService,
  ) {
    super();
  }

  @Option({
    flags: '--workspace-id [workspaceId]',
    description: 'Prune a single workspace instead of every active one',
  })
  parseWorkspaceId(value: string): string {
    return value;
  }

  @Option({
    flags: '--dry-run',
    description: 'Print the resolved retention policy and delete nothing',
  })
  parseDryRun(): boolean {
    return true;
  }

  async run(
    _passedParams: string[],
    options: AuditLogPruneOptions,
  ): Promise<void> {
    const { policy, warnings } = resolveAuditRetention(process.env);

    for (const warning of warnings) {
      this.logger.warn(warning);
    }

    this.logger.log(
      `Retention policy (days, 0 = keep forever): ${JSON.stringify(policy)}`,
    );

    if (options.dryRun === true) {
      this.logger.log('Dry run: nothing deleted.');

      return;
    }

    const workspaces =
      options.workspaceId !== undefined
        ? [{ id: options.workspaceId }]
        : await this.workspaceRepository.find({
            where: { activationStatus: WorkspaceActivationStatus.ACTIVE },
            select: ['id'],
            order: { id: 'ASC' },
          });

    for (const workspace of workspaces) {
      const pruned = await this.auditLogRetentionService.pruneWorkspace(
        workspace.id,
      );
      const total = Object.values(pruned).reduce((sum, n) => sum + n, 0);

      this.logger.log(
        `Workspace ${workspace.id}: deleted ${total} audit event(s) ${JSON.stringify(pruned)}`,
      );
    }
  }
}
