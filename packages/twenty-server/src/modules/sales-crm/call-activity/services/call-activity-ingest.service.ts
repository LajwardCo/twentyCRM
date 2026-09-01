import { Injectable } from '@nestjs/common';

import { phoneMatchKey } from 'twenty-shared/utils';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type CreateCallActivityInput } from 'src/modules/sales-crm/call-activity/dtos/create-call-activity.input';
import { PhoneIndexService } from 'src/modules/sales-crm/call-activity/services/phone-index.service';

/** Shown in Twenty's "created by" column for records this endpoint writes. */
const CREATED_BY_NAME = 'Call Companion';

/**
 * A created or duplicate result carries the lead the server resolved, so the
 * device can offer to log the call as a Task without a second round trip and
 * without the client having to guess which lead a number belongs to.
 */
export type IngestResult =
  | {
      status: 'created' | 'duplicate';
      callActivityId: string;
      personId: string | null;
      opportunityId: string | null;
    }
  | { status: 'unmatched' };

@Injectable()
export class CallActivityIngestService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly phoneIndexService: PhoneIndexService,
  ) {}

  /**
   * Records one work call. The device has already matched the number against
   * its local index, but the server re-resolves it: a client is never trusted
   * to assert which lead a call belongs to.
   *
   * An unmatched number is refused rather than stored, so the server never
   * accumulates numbers that are not already CRM contacts — the guarantee that
   * keeps an agent's personal calls out of the CRM entirely.
   */
  async ingest({
    workspaceId,
    agentId,
    input,
  }: {
    workspaceId: string;
    agentId: string;
    input: CreateCallActivityInput;
  }): Promise<IngestResult> {
    const existing = await this.findExisting({
      workspaceId,
      agentId,
      deviceCallId: input.deviceCallId,
    });

    // Retries, re-syncs and reinstalls must not double-count a call: these
    // numbers are used to evaluate people.
    if (existing !== null) {
      return {
        status: 'duplicate',
        callActivityId: existing.id,
        personId: existing.personId,
        opportunityId: existing.opportunityId,
      };
    }

    const matchKey =
      input.phoneNumber === undefined || input.phoneNumber === ''
        ? null
        : phoneMatchKey(input.phoneNumber);

    const person =
      matchKey === null
        ? null
        : await this.phoneIndexService.findPersonByPhone(workspaceId, matchKey);

    if (person === null) {
      return { status: 'unmatched' };
    }

    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const callActivityRepository =
        await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'callActivity',
          { shouldBypassPermissionChecks: true },
        );

      const created = (await callActivityRepository.save({
        deviceCallId: input.deviceCallId,
        direction: input.direction,
        channel: input.channel,
        phoneNumber: matchKey,
        contactName: input.contactName ?? null,
        startedAt: new Date(input.startedAt),
        durationSeconds: input.durationSeconds,
        durationSource: input.durationSource,
        recordingStatus: 'NONE',
        agentId,
        personId: person.id,
        opportunityId: person.openOpportunityId,
        // `createdByName`/`updatedByName` are NOT NULL with no database
        // default, and buildSystemAuthContext does not populate the actor, so
        // the insert must supply it. The record is created by the Call
        // Companion app acting for the agent -- hence API, not MANUAL.
        createdBy: {
          source: 'API',
          workspaceMemberId: agentId,
          name: CREATED_BY_NAME,
          context: {},
        },
        updatedBy: {
          source: 'API',
          workspaceMemberId: agentId,
          name: CREATED_BY_NAME,
          context: {},
        },
      })) as unknown as { id: string };

      return {
        status: 'created' as const,
        callActivityId: created.id,
        personId: person.id,
        opportunityId: person.openOpportunityId,
      };
    }, authContext);
  }

  private async findExisting({
    workspaceId,
    agentId,
    deviceCallId,
  }: {
    workspaceId: string;
    agentId: string;
    deviceCallId: string;
  }): Promise<{
    id: string;
    personId: string | null;
    opportunityId: string | null;
  } | null> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const callActivityRepository =
        await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'callActivity',
          { shouldBypassPermissionChecks: true },
        );

      const found = (await callActivityRepository.findOne({
        where: { agentId, deviceCallId },
      })) as unknown as {
        id: string;
        personId: string | null;
        opportunityId: string | null;
      } | null;

      return found === null
        ? null
        : {
            id: found.id,
            personId: found.personId ?? null,
            opportunityId: found.opportunityId ?? null,
          };
    }, authContext);
  }
}
