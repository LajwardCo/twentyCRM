import { Injectable, Logger } from '@nestjs/common';

import { In, LessThan } from 'typeorm';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  AUDIT_LOG_RETENTION_BATCH_SIZE,
  AUDIT_LOG_RETENTION_MAX_DELETIONS_PER_RUN,
} from 'src/modules/sales-crm/audit-log/constants/audit-log-retention.constant';
import { AuditLogIngestService } from 'src/modules/sales-crm/audit-log/services/audit-log-ingest.service';
import {
  cutoffDateFor,
  resolveAuditRetention,
} from 'src/modules/sales-crm/audit-log/utils/resolve-audit-retention.util';
import {
  AUDIT_SEVERITIES,
  isMissingAuditObjectError,
} from 'src/modules/sales-crm/audit-log/utils/sanitize-audit-event.util';

export type PrunedBySeverity = Record<string, number>;

/**
 * Deletes audit rows once they are older than their severity's retention.
 *
 * Two rules govern everything here, and both exist because this is the only
 * code in the system that destroys audit evidence:
 *
 *   1. **A deletion is itself audited.** Every run that removes anything
 *      writes an `audit.retention_pruned` row saying how many rows of each
 *      severity went and from what date. Without it, "wait for the nightly
 *      cleaner" would be a way to erase a trail and leave no trace of the
 *      erasure.
 *   2. **Nothing is deleted that is not demonstrably expired.** Rows are
 *      selected by `occurredAt` older than a midnight-anchored cutoff, in
 *      batches, capped per run. A misconfiguration cannot empty the table in
 *      one night, and the minimum-days floor means it cannot target anything
 *      recent at all.
 */
@Injectable()
export class AuditLogRetentionService {
  private readonly logger = new Logger(AuditLogRetentionService.name);

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly auditLogIngestService: AuditLogIngestService,
  ) {}

  async pruneWorkspace(workspaceId: string): Promise<PrunedBySeverity> {
    const { policy, warnings } = resolveAuditRetention(process.env);

    for (const warning of warnings) {
      this.logger.warn(`Audit retention config: ${warning}`);
    }

    const now = new Date();
    const pruned: PrunedBySeverity = {};
    const cutoffs: Record<string, string> = {};
    let budget = AUDIT_LOG_RETENTION_MAX_DELETIONS_PER_RUN;

    // Oldest-first by severity so that when the budget runs out it is the
    // low-value navigation noise that got cleaned, not the evidence.
    for (const severity of AUDIT_SEVERITIES) {
      if (budget <= 0) break;

      const cutoff = cutoffDateFor(policy[severity], now);

      if (cutoff === null) continue;

      let deleted: number;

      try {
        deleted = await this.deleteExpired({
          workspaceId,
          severity,
          cutoff,
          budget,
        });
      } catch (error) {
        // A workspace that never provisioned the sales app has no auditEvent
        // object. The cron visits every active workspace, so this is the
        // normal case on a shared instance, not a failure -- throwing would
        // mean a failed job per unprovisioned workspace per night.
        if (isMissingAuditObjectError(error)) {
          this.logger.debug(
            `Workspace ${workspaceId} has no auditEvent object; nothing to prune.`,
          );

          return {};
        }

        throw error;
      }

      if (deleted > 0) {
        pruned[severity] = deleted;
        cutoffs[severity] = cutoff.toISOString();
        budget -= deleted;
      }
    }

    const total = Object.values(pruned).reduce((sum, n) => sum + n, 0);

    if (total === 0) return pruned;

    this.logger.log(
      `Pruned ${total} audit event(s) from workspace ${workspaceId}: ${JSON.stringify(pruned)}`,
    );

    await this.auditLogIngestService.recordSystemEvent({
      workspaceId,
      eventType: 'audit.retention_pruned',
      // Critical, not informational: a reviewer looking at a period with
      // missing rows needs this to be impossible to scroll past.
      severity: 'critical',
      detail: {
        deletedBySeverity: pruned,
        totalDeleted: total,
        cutoffs,
        retentionDays: policy,
        // True when the cap stopped the run, i.e. there is more to delete and
        // tomorrow's run will continue. Without this a reviewer could read a
        // capped run as "that is all there was".
        reachedRunCap: budget <= 0,
      },
    });

    return pruned;
  }

  private async deleteExpired({
    workspaceId,
    severity,
    cutoff,
    budget,
  }: {
    workspaceId: string;
    severity: string;
    cutoff: Date;
    budget: number;
  }): Promise<number> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repository = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'auditEvent',
          { shouldBypassPermissionChecks: true },
        );

        let deleted = 0;

        while (deleted < budget) {
          const take = Math.min(
            AUDIT_LOG_RETENTION_BATCH_SIZE,
            budget - deleted,
          );

          const expired = await repository.find({
            select: ['id'],
            where: { severity, occurredAt: LessThan(cutoff) },
            order: { occurredAt: 'ASC' },
            take,
            loadEagerRelations: false,
          });

          if (expired.length === 0) break;

          await repository.delete({
            id: In(expired.map((row: { id: string }) => row.id)),
          });

          deleted += expired.length;
        }

        return deleted;
      },
      authContext,
    );
  }
}
