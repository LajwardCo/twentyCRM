import { applyOwnerScopeFilter } from 'src/engine/twenty-orm/owner-scope/apply-owner-scope-filter.util';

const makeQb = () => {
  const calls: { sql: string; params?: object }[] = [];

  return {
    calls,
    andWhere(sql: string, params?: object) {
      calls.push({ sql, params });

      return this;
    },
  };
};

const userCtx = { type: 'user', workspaceMemberId: 'wm-1' } as any;

const SCHEMA = 'workspace_1wgvd1injqtife6y4rvfbu3h5';

// Stand-in for the ORM connection. Rules resolve both their table and their
// columns through TypeORM's registry, so an entity or column missing here
// models a workspace where that piece was never provisioned.
type FakeEntity = { tableName: string; columns: string[] };

const DEFAULT_ENTITIES: Record<string, FakeEntity> = {
  person: { tableName: 'person', columns: ['ownerId'] },
  opportunity: {
    tableName: 'opportunity',
    columns: ['ownerId', 'marketerPartnerId', 'referrerId'],
  },
  partner: { tableName: '_partner', columns: ['memberId'] },
};

const makeConnection = (
  entities: Record<string, FakeEntity> = DEFAULT_ENTITIES,
) =>
  ({
    hasMetadata: (name: string) => entities[name] !== undefined,
    getMetadata: (name: string) => ({
      schema: SCHEMA,
      tableName: entities[name]?.tableName,
      findColumnWithDatabaseName: (column: string) =>
        entities[name]?.columns.includes(column)
          ? { databaseName: column }
          : undefined,
    }),
  }) as any;

const withoutPartner = (): Record<string, FakeEntity> => ({
  person: DEFAULT_ENTITIES.person,
  opportunity: DEFAULT_ENTITIES.opportunity,
});

const scoped = (objectMetadataId: string) =>
  ({ [objectMetadataId]: { canOnlyAccessOwnedRecords: true } }) as any;

describe('applyOwnerScopeFilter', () => {
  it('adds owner filter for a scoped object + user context', () => {
    const qb = makeQb();

    applyOwnerScopeFilter({
      queryBuilder: qb as any,
      alias: 'person',
      objectMetadataNameSingular: 'person',
      objectMetadataId: 'obj-person',
      objectRecordsPermissions: scoped('obj-person'),
      authContext: userCtx,
      shouldBypassPermissionChecks: false,
      connection: makeConnection(),
    });

    expect(qb.calls).toHaveLength(1);
    expect(qb.calls[0].sql).toContain('"ownerId"');
    expect(qb.calls[0].params).toEqual({ ownerScopeWorkspaceMemberId: 'wm-1' });
  });

  it('does nothing when the flag is off', () => {
    const qb = makeQb();

    applyOwnerScopeFilter({
      queryBuilder: qb as any,
      alias: 'person',
      objectMetadataNameSingular: 'person',
      objectMetadataId: 'obj-person',
      objectRecordsPermissions: {
        'obj-person': { canOnlyAccessOwnedRecords: false },
      } as any,
      authContext: userCtx,
      shouldBypassPermissionChecks: false,
      connection: makeConnection(),
    });

    expect(qb.calls).toHaveLength(0);
  });

  it('does nothing when bypassing permission checks', () => {
    const qb = makeQb();

    applyOwnerScopeFilter({
      queryBuilder: qb as any,
      alias: 'person',
      objectMetadataNameSingular: 'person',
      objectMetadataId: 'obj-person',
      objectRecordsPermissions: scoped('obj-person'),
      authContext: userCtx,
      shouldBypassPermissionChecks: true,
      connection: makeConnection(),
    });

    expect(qb.calls).toHaveLength(0);
  });

  it('denies all when scoped role has no workspace member (e.g. api key)', () => {
    const qb = makeQb();

    applyOwnerScopeFilter({
      queryBuilder: qb as any,
      alias: 'person',
      objectMetadataNameSingular: 'person',
      objectMetadataId: 'obj-person',
      objectRecordsPermissions: scoped('obj-person'),
      authContext: { type: 'apiKey' } as any,
      shouldBypassPermissionChecks: false,
      connection: makeConnection(),
    });

    expect(qb.calls).toHaveLength(1);
    expect(qb.calls[0].sql).toBe('1 = 0');
  });

  it('does nothing for an object not in OWNER_SCOPED_OBJECTS', () => {
    const qb = makeQb();

    applyOwnerScopeFilter({
      queryBuilder: qb as any,
      alias: 'workflow',
      objectMetadataNameSingular: 'workflow',
      objectMetadataId: 'obj-workflow',
      objectRecordsPermissions: scoped('obj-workflow'),
      authContext: userCtx,
      shouldBypassPermissionChecks: false,
      connection: makeConnection(),
    });

    expect(qb.calls).toHaveLength(0);
  });

  describe('multi-rule objects', () => {
    const applyToOpportunity = (connection: any) => {
      const qb = makeQb();

      applyOwnerScopeFilter({
        queryBuilder: qb as any,
        alias: 'opportunity',
        objectMetadataNameSingular: 'opportunity',
        objectMetadataId: 'obj-opportunity',
        objectRecordsPermissions: scoped('obj-opportunity'),
        authContext: userCtx,
        shouldBypassPermissionChecks: false,
        connection,
      });

      return qb;
    };

    it('ORs owner, marketer and referrer into a single clause', () => {
      const qb = applyToOpportunity(makeConnection());

      expect(qb.calls).toHaveLength(1);

      const { sql } = qb.calls[0];

      expect(sql).toContain(
        'opportunity."ownerId" = :ownerScopeWorkspaceMemberId',
      );
      expect(sql).toContain('opportunity."marketerPartnerId" IN');
      expect(sql).toContain('opportunity."referrerId" IN');
      expect(sql.split(' OR ')).toHaveLength(3);
      expect(qb.calls[0].params).toEqual({
        ownerScopeWorkspaceMemberId: 'wm-1',
      });
    });

    it('resolves the partner subquery against the workspace schema and custom table prefix', () => {
      const { sql } = applyToOpportunity(makeConnection()).calls[0];

      expect(sql).toContain(`"${SCHEMA}"."_partner"`);
      expect(sql).toContain('"memberId" = :ownerScopeWorkspaceMemberId');
    });

    it('uses whatever table name the ORM registered for the target object', () => {
      const { sql } = applyToOpportunity(
        makeConnection({
          ...DEFAULT_ENTITIES,
          partner: { tableName: 'partner', columns: ['memberId'] },
        }),
      ).calls[0];

      expect(sql).toContain(`"${SCHEMA}"."partner"`);
    });

    it('drops a rule whose own column is absent from this workspace', () => {
      const qb = applyToOpportunity(
        makeConnection({
          ...DEFAULT_ENTITIES,
          // A workspace that never provisioned the referrer field.
          opportunity: {
            tableName: 'opportunity',
            columns: ['ownerId', 'marketerPartnerId'],
          },
        }),
      );

      expect(qb.calls[0].sql).not.toContain('referrerId');
      expect(qb.calls[0].sql).toContain('marketerPartnerId');
    });

    it('drops a via rule when the target object lacks the member column', () => {
      const qb = applyToOpportunity(
        makeConnection({
          ...DEFAULT_ENTITIES,
          partner: { tableName: '_partner', columns: [] },
        }),
      );

      expect(qb.calls[0].sql).toContain('"ownerId"');
      expect(qb.calls[0].sql).not.toContain('IN (');
    });

    it('ignores soft-deleted partners', () => {
      const { sql } = applyToOpportunity(makeConnection()).calls[0];

      expect(sql).toContain('"deletedAt" IS NULL');
    });

    it('drops via rules whose target object is not provisioned, keeping the column rule', () => {
      const qb = applyToOpportunity(makeConnection(withoutPartner()));

      expect(qb.calls).toHaveLength(1);
      expect(qb.calls[0].sql).toContain('"ownerId"');
      expect(qb.calls[0].sql).not.toContain('IN (');
    });
  });

  // An object configured as scoped whose rules all fail to resolve must deny,
  // not fall through to an unfiltered query. No shipped object has an
  // all-`via` rule set, so the config is stubbed to reach the branch.
  it('denies all when every rule for a scoped object is unresolvable', () => {
    jest.resetModules();
    jest.doMock(
      'src/engine/twenty-orm/owner-scope/owner-scoped-objects.constant',
      () => ({
        OWNER_SCOPED_OBJECTS: {
          leadReferrer: [
            {
              kind: 'via',
              column: 'partnerId',
              targetObjectNameSingular: 'partner',
              targetMemberColumn: 'memberId',
            },
          ],
        },
      }),
    );

    const {
      applyOwnerScopeFilter: applyWithStubbedConfig,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require('src/engine/twenty-orm/owner-scope/apply-owner-scope-filter.util');

    const qb = makeQb();

    applyWithStubbedConfig({
      queryBuilder: qb as any,
      alias: 'leadReferrer',
      objectMetadataNameSingular: 'leadReferrer',
      objectMetadataId: 'obj-leadReferrer',
      objectRecordsPermissions: scoped('obj-leadReferrer'),
      authContext: userCtx,
      shouldBypassPermissionChecks: false,
      connection: makeConnection(withoutPartner()),
    });

    jest.dontMock(
      'src/engine/twenty-orm/owner-scope/owner-scoped-objects.constant',
    );
    jest.resetModules();

    expect(qb.calls).toHaveLength(1);
    expect(qb.calls[0].sql).toBe('1 = 0');
  });
});
