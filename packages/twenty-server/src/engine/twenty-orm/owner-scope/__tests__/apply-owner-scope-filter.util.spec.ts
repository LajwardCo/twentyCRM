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

describe('applyOwnerScopeFilter', () => {
  it('adds owner filter for a scoped object + user context', () => {
    const qb = makeQb();

    applyOwnerScopeFilter({
      queryBuilder: qb as any,
      alias: 'person',
      objectMetadataNameSingular: 'person',
      objectMetadataId: 'obj-person',
      objectRecordsPermissions: { 'obj-person': { canOnlyAccessOwnedRecords: true } } as any,
      authContext: userCtx,
      shouldBypassPermissionChecks: false,
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
      objectRecordsPermissions: { 'obj-person': { canOnlyAccessOwnedRecords: false } } as any,
      authContext: userCtx,
      shouldBypassPermissionChecks: false,
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
      objectRecordsPermissions: { 'obj-person': { canOnlyAccessOwnedRecords: true } } as any,
      authContext: userCtx,
      shouldBypassPermissionChecks: true,
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
      objectRecordsPermissions: { 'obj-person': { canOnlyAccessOwnedRecords: true } } as any,
      authContext: { type: 'apiKey' } as any,
      shouldBypassPermissionChecks: false,
    });

    expect(qb.calls).toHaveLength(1);
    expect(qb.calls[0].sql).toBe('1 = 0');
  });

  it('does nothing for an object not in OWNER_SCOPED_OBJECTS', () => {
    const qb = makeQb();

    applyOwnerScopeFilter({
      queryBuilder: qb as any,
      alias: 'company',
      objectMetadataNameSingular: 'company',
      objectMetadataId: 'obj-company',
      objectRecordsPermissions: { 'obj-company': { canOnlyAccessOwnedRecords: true } } as any,
      authContext: userCtx,
      shouldBypassPermissionChecks: false,
    });

    expect(qb.calls).toHaveLength(0);
  });
});
