import { Injectable } from '@nestjs/common';

import { In } from 'typeorm';
import { phoneMatchKey } from 'twenty-shared/utils';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  type PersonMatchCandidate,
  pickBestPersonMatch,
} from 'src/modules/sales-crm/utils/pick-best-person-match.util';

export type PhoneIndexEntry = {
  /** Canonical match key, e.g. '+93790123456'. */
  e164: string;
  personId: string;
  displayName: string;
};

type PhoneBearingPerson = {
  id: string;
  updatedAt: Date | string;
  name: { firstName?: string | null; lastName?: string | null } | null;
  phones: {
    primaryPhoneCallingCode?: string | null;
    primaryPhoneNumber?: string | null;
    additionalPhones?: unknown;
  } | null;
};

/** Twenty's terminal Opportunity stage; see tools/sales-crm/update-stages.mjs. */
const TERMINAL_STAGE = 'LOST_MISSED';

/**
 * Every phone number a Person carries: the primary, plus any entries in the
 * `additionalPhones` composite. Sellers add second numbers to an existing
 * contact rather than creating a duplicate Person, so an index that only read
 * the primary would fail to match exactly the calls this feature exists to
 * capture.
 */
const phoneKeysForPerson = (person: PhoneBearingPerson): string[] => {
  const keys: string[] = [];

  const primary = `${person.phones?.primaryPhoneCallingCode ?? ''}${person.phones?.primaryPhoneNumber ?? ''}`;
  const primaryKey = phoneMatchKey(primary);

  if (primaryKey !== null) {
    keys.push(primaryKey);
  }

  const additional = person.phones?.additionalPhones;

  if (Array.isArray(additional)) {
    for (const entry of additional) {
      if (typeof entry !== 'object' || entry === null) {
        continue;
      }

      const record = entry as Record<string, unknown>;
      const callingCode =
        typeof record.callingCode === 'string' ? record.callingCode : '';
      const number = typeof record.number === 'string' ? record.number : '';
      const key = phoneMatchKey(`${callingCode}${number}`);

      if (key !== null && !keys.includes(key)) {
        keys.push(key);
      }
    }
  }

  return keys;
};

const displayNameFor = (person: PhoneBearingPerson): string =>
  `${person.name?.firstName ?? ''} ${person.name?.lastName ?? ''}`.trim();

@Injectable()
export class PhoneIndexService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  /**
   * Every CRM number the device may match a call against. Sent to the device so
   * matching happens locally — the server must never receive an agent's call
   * log, and the only way to guarantee that is to never ask for it.
   */
  async listForWorkspace(workspaceId: string): Promise<PhoneIndexEntry[]> {
    const people = await this.loadPhoneBearingPeople(workspaceId);

    return people.flatMap((person) =>
      phoneKeysForPerson(person).map((e164) => ({
        e164,
        personId: person.id,
        displayName: displayNameFor(person),
      })),
    );
  }

  /**
   * Resolves one number to the Person it belongs to, re-doing on the server the
   * match the device already made — a client is never trusted to assert which
   * lead a call belongs to.
   *
   * Matching runs in application code rather than as a SQL predicate because
   * Twenty stores `phones` as a composite that is flattened into separate
   * columns, and no `where` clause anywhere in the server queries one. Doing it
   * here also means the device and the server share one matching rule, which is
   * the whole point of the shared normalizer.
   *
   * The person scan is bounded by workspace size (~1.2k rows today). If that
   * grows by an order of magnitude, narrow it with a query on the flattened
   * `phonesPrimaryPhoneNumber` column before reaching for a cache.
   */
  async findPersonByPhone(
    workspaceId: string,
    e164: string,
  ): Promise<PersonMatchCandidate | null> {
    const people = await this.loadPhoneBearingPeople(workspaceId);

    const matches = people.filter((person) =>
      phoneKeysForPerson(person).includes(e164),
    );

    if (matches.length === 0) {
      return null;
    }

    const openOpportunityByPersonId = await this.findOpenOpportunities(
      workspaceId,
      matches.map((person) => person.id),
    );

    return pickBestPersonMatch(
      matches.map((person) => ({
        id: person.id,
        updatedAt: new Date(person.updatedAt).toISOString(),
        openOpportunityId: openOpportunityByPersonId.get(person.id) ?? null,
      })),
    );
  }

  private async loadPhoneBearingPeople(
    workspaceId: string,
  ): Promise<PhoneBearingPerson[]> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const personRepository =
        await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'person',
          { shouldBypassPermissionChecks: true },
        );

      // No `select` projection: twenty-orm rejects composite fields ('name',
      // 'phones') in a select list, and those are exactly the ones needed here.
      return (await personRepository.find()) as unknown as PhoneBearingPerson[];
    }, authContext);
  }

  /** personId -> id of one non-terminal Opportunity they are contact for. */
  private async findOpenOpportunities(
    workspaceId: string,
    personIds: string[],
  ): Promise<Map<string, string>> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const opportunityRepository =
        await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'opportunity',
          { shouldBypassPermissionChecks: true },
        );

      const opportunities = (await opportunityRepository.find({
        where: { pointOfContactId: In(personIds) },
      })) as unknown as {
        id: string;
        stage: string | null;
        pointOfContactId: string | null;
      }[];

      const byPerson = new Map<string, string>();

      for (const opportunity of opportunities) {
        if (
          opportunity.pointOfContactId === null ||
          opportunity.stage === TERMINAL_STAGE ||
          byPerson.has(opportunity.pointOfContactId)
        ) {
          continue;
        }

        byPerson.set(opportunity.pointOfContactId, opportunity.id);
      }

      return byPerson;
    }, authContext);
  }
}
