import { Injectable } from '@nestjs/common';

import { Between } from 'typeorm';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  aggregateCallActivity,
  type CallActivityDailyTotals,
  type CallActivityRow,
} from 'src/modules/sales-crm/utils/aggregate-call-activity.util';

/** Sales operate out of Kabul; day boundaries follow the seller, not UTC. */
const REPORT_TIME_ZONE = 'Asia/Kabul';

@Injectable()
export class CallActivityReportService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  /**
   * Per-agent daily call totals over a date range. Aggregated here rather than
   * in the client so every viewer sees the same numbers and a phone on mobile
   * data does not download a month of rows to add them up.
   */
  async dailyTotals({
    workspaceId,
    fromIso,
    toIso,
  }: {
    workspaceId: string;
    fromIso: string;
    toIso: string;
  }): Promise<CallActivityDailyTotals[]> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const callActivityRepository =
        await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'callActivity',
          { shouldBypassPermissionChecks: true },
        );

      const rows = (await callActivityRepository.find({
        where: { startedAt: Between(new Date(fromIso), new Date(toIso)) },
      })) as unknown as {
        agentId: string | null;
        startedAt: Date | string;
        durationSeconds: number | null;
        durationSource: CallActivityRow['durationSource'];
        opportunityId: string | null;
      }[];

      return aggregateCallActivity(
        rows
          .filter((row) => row.agentId !== null)
          .map((row) => ({
            agentId: row.agentId as string,
            startedAt: new Date(row.startedAt).toISOString(),
            durationSeconds: row.durationSeconds ?? 0,
            durationSource: row.durationSource,
            opportunityId: row.opportunityId ?? null,
          })),
        REPORT_TIME_ZONE,
      );
    }, authContext);
  }
}
