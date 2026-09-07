import { Injectable, Logger } from '@nestjs/common';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  isMissingAuditObjectError,
  type SanitizedAuditEvent,
} from 'src/modules/sales-crm/audit-log/utils/sanitize-audit-event.util';

/** Shown in Twenty's "created by" column for rows this endpoint writes. */
const CREATED_BY_NAME = 'Audit';

const SYSTEM_CREATED_BY = {
  source: 'SYSTEM',
  name: CREATED_BY_NAME,
  context: {},
};

export type AuditActorContext = {
  workspaceId: string;
  workspaceMemberId: string;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  ipAddress: string | null;
};

/**
 * Writes the sales app's activity log.
 *
 * Two things make this worth a server endpoint rather than a mutation the app
 * sends with the user's own credentials:
 *
 *   1. The actor is taken from the caller's token, here, and the client's
 *      claim about who it is is discarded. A seller cannot file an event as
 *      their manager.
 *   2. The write bypasses object permissions, which is what lets the
 *      `auditEvent` object be readable by nobody but admins. Twenty refuses a
 *      role that can write an object it cannot read, so a client-credentialed
 *      log would have to be a log every seller could read in full.
 *
 * What it still cannot do is force a client to report honestly: a user with
 * developer tools can drop events before they are sent. Detecting that is out
 * of reach of any browser app, which is why the reviewable signals -- session
 * gaps, buffer-overflow rows, clock skew -- matter as much as the events.
 */
@Injectable()
export class AuditLogIngestService {
  private readonly logger = new Logger(AuditLogIngestService.name);

  // Workspaces that have not run provision-audit-log.mjs have no auditEvent
  // object. Learn that once per workspace and stop asking, instead of logging
  // a stack trace per batch per user for the life of the process.
  //
  // Per workspace, not one flag: a shared instance can hold a provisioned
  // workspace next to an unprovisioned one, and a global flag would let the
  // second silently switch off auditing for the first.
  private readonly workspacesWithoutObject = new Set<string>();

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  /**
   * Writes one event attributed to the system rather than a person.
   *
   * Used by retention pruning: deleting audit rows must itself leave an audit
   * row, or the cheapest way to erase a trail is to wait for the cleaner.
   */
  async recordSystemEvent({
    workspaceId,
    eventType,
    severity,
    detail,
  }: {
    workspaceId: string;
    eventType: string;
    severity: string;
    detail: Record<string, unknown>;
  }): Promise<void> {
    if (this.workspacesWithoutObject.has(workspaceId)) return;

    try {
      await this.insertRows(workspaceId, [
        {
          name: `${eventType} — سیستم`,
          occurredAt: new Date(),
          eventType,
          category: 'security',
          severity,
          actorName: 'سیستم',
          actorEmail: '',
          actorRole: 'system',
          actorId: null,
          ipAddress: null,
          targetType: 'auditEvent',
          targetId: null,
          targetLabel: null,
          route: null,
          detail: JSON.stringify(detail),
          sessionId: 'system',
          device: null,
          createdBy: SYSTEM_CREATED_BY,
          updatedBy: SYSTEM_CREATED_BY,
        },
      ]);
    } catch (error) {
      // A failure here must not abort the pruning that produced it; the
      // deletion counts are still in the job's own log line.
      this.logger.warn(
        `Could not record ${eventType}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async insertRows(
    workspaceId: string,
    rows: Record<string, unknown>[],
  ): Promise<void> {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const repository = await this.globalWorkspaceOrmManager.getRepository(
        workspaceId,
        'auditEvent',
        { shouldBypassPermissionChecks: true },
      );

      await repository.insert(rows);
    }, authContext);
  }

  async ingest({
    actor,
    events,
  }: {
    actor: AuditActorContext;
    events: SanitizedAuditEvent[];
  }): Promise<{ stored: number; supported: boolean }> {
    const known = !this.workspacesWithoutObject.has(actor.workspaceId);

    if (events.length === 0) return { stored: 0, supported: known };
    if (!known) return { stored: 0, supported: false };

    const authContext = buildSystemAuthContext(actor.workspaceId);

    try {
      return await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const repository = await this.globalWorkspaceOrmManager.getRepository(
            actor.workspaceId,
            'auditEvent',
            { shouldBypassPermissionChecks: true },
          );

          const rows = events.map((event) => ({
            name: `${event.eventType} — ${actor.actorName}`,
            occurredAt: event.occurredAt,
            eventType: event.eventType,
            category: event.category,
            severity: event.severity,
            // Server-stamped identity: whatever the body said is gone by now.
            actorName: actor.actorName,
            actorEmail: actor.actorEmail,
            actorRole: actor.actorRole,
            actorId: actor.workspaceMemberId,
            ipAddress: actor.ipAddress,
            targetType: event.targetType,
            targetId: event.targetId,
            targetLabel: event.targetLabel,
            route: event.route,
            detail: event.detail,
            sessionId: event.sessionId,
            device: event.device,
            createdBy: {
              source: 'API',
              workspaceMemberId: actor.workspaceMemberId,
              name: CREATED_BY_NAME,
              context: {},
            },
            updatedBy: {
              source: 'API',
              workspaceMemberId: actor.workspaceMemberId,
              name: CREATED_BY_NAME,
              context: {},
            },
          }));

          await repository.insert(rows);

          return { stored: rows.length, supported: true };
        },
        authContext,
      );
    } catch (error) {
      if (isMissingAuditObjectError(error)) {
        this.workspacesWithoutObject.add(actor.workspaceId);
        this.logger.warn(
          `auditEvent object is missing in workspace ${actor.workspaceId}; run tools/sales-crm/provision-audit-log.mjs. Audit ingest is disabled for it until restart.`,
        );

        return { stored: 0, supported: false };
      }

      // Rethrow: the client's queue keeps the batch and retries, which is the
      // behaviour that stops a transient database blip from erasing a trail.
      throw error;
    }
  }
}
