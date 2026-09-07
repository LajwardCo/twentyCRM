import { Test, type TestingModule } from '@nestjs/testing';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { AUDIT_LOG_RETENTION_MAX_DELETIONS_PER_RUN } from 'src/modules/sales-crm/audit-log/constants/audit-log-retention.constant';
import { AuditLogIngestService } from 'src/modules/sales-crm/audit-log/services/audit-log-ingest.service';
import { AuditLogRetentionService } from 'src/modules/sales-crm/audit-log/services/audit-log-retention.service';

const WORKSPACE_ID = 'ws-1';

describe('AuditLogRetentionService', () => {
  let service: AuditLogRetentionService;
  let recordSystemEvent: jest.Mock;
  let deleteCalls: { severity: string; count: number }[];
  let envBackup: NodeJS.ProcessEnv;

  // A fake auditEvent repository holding `counts` rows per severity, all of
  // them expired.
  const buildRepository = (counts: Record<string, number>) => {
    const remaining = { ...counts };

    return {
      find: jest.fn(
        async ({
          where,
          take,
        }: {
          where: { severity: string };
          take: number;
        }) => {
          const available = remaining[where.severity] ?? 0;
          const n = Math.min(available, take);

          return Array.from({ length: n }, (_, i) => ({
            id: `${where.severity}-${i}`,
          }));
        },
      ),
      delete: jest.fn(async ({ id }: { id: { _value: string[] } }) => {
        // typeorm's In() wraps the array; read it back out generically.
        const ids: string[] =
          (id as unknown as { _value: string[] })._value ?? [];
        const severity = ids[0]?.split('-')[0] ?? '';

        remaining[severity] -= ids.length;
        deleteCalls.push({ severity, count: ids.length });
      }),
    };
  };

  const setup = async (counts: Record<string, number>) => {
    const repository = buildRepository(counts);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogRetentionService,
        {
          provide: GlobalWorkspaceOrmManager,
          useValue: {
            getRepository: jest.fn().mockResolvedValue(repository),
            executeInWorkspaceContext: jest
              .fn()
              .mockImplementation((fn: () => unknown) => fn()),
          },
        },
        {
          provide: AuditLogIngestService,
          useValue: { recordSystemEvent },
        },
      ],
    }).compile();

    service = module.get(AuditLogRetentionService);
    jest.spyOn(service['logger'], 'log').mockImplementation();
    jest.spyOn(service['logger'], 'warn').mockImplementation();

    return repository;
  };

  beforeEach(() => {
    envBackup = process.env;
    process.env = { ...envBackup };
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('SALES_AUDIT_RETENTION_DAYS')) delete process.env[key];
    }
    recordSystemEvent = jest.fn().mockResolvedValue(undefined);
    deleteCalls = [];
  });

  afterEach(() => {
    process.env = envBackup;
  });

  it('deletes expired rows of every severity', async () => {
    await setup({ info: 5, notice: 3, sensitive: 2, critical: 1 });

    const pruned = await service.pruneWorkspace(WORKSPACE_ID);

    expect(pruned).toEqual({ info: 5, notice: 3, sensitive: 2, critical: 1 });
  });

  it('records its own deletions, so a gap in the log is never silent', async () => {
    await setup({ info: 4, notice: 0, sensitive: 0, critical: 0 });

    await service.pruneWorkspace(WORKSPACE_ID);

    expect(recordSystemEvent).toHaveBeenCalledTimes(1);
    const call = recordSystemEvent.mock.calls[0][0];

    expect(call).toMatchObject({
      workspaceId: WORKSPACE_ID,
      eventType: 'audit.retention_pruned',
      severity: 'critical',
    });
    expect(call.detail.totalDeleted).toBe(4);
    expect(call.detail.deletedBySeverity).toEqual({ info: 4 });
    expect(call.detail.cutoffs.info).toEqual(expect.any(String));
    expect(call.detail.retentionDays.critical).toBeGreaterThan(
      call.detail.retentionDays.info,
    );
  });

  it('writes no marker row when it deleted nothing', async () => {
    await setup({ info: 0, notice: 0, sensitive: 0, critical: 0 });

    expect(await service.pruneWorkspace(WORKSPACE_ID)).toEqual({});
    expect(recordSystemEvent).not.toHaveBeenCalled();
  });

  it('keeps a severity forever when its retention is 0', async () => {
    process.env.SALES_AUDIT_RETENTION_DAYS_CRITICAL = '0';
    await setup({ info: 2, notice: 0, sensitive: 0, critical: 9 });

    const pruned = await service.pruneWorkspace(WORKSPACE_ID);

    expect(pruned.critical).toBeUndefined();
    expect(pruned.info).toBe(2);
    expect(deleteCalls.some((c) => c.severity === 'critical')).toBe(false);
  });

  it('spends its run budget on noise before evidence, and reports being capped', async () => {
    const cap = AUDIT_LOG_RETENTION_MAX_DELETIONS_PER_RUN;

    await setup({
      info: cap + 500,
      notice: 500,
      sensitive: 500,
      critical: 500,
    });

    const pruned = await service.pruneWorkspace(WORKSPACE_ID);

    // The whole budget went on `info`; nothing more severe was touched.
    expect(pruned.info).toBe(cap);
    expect(pruned.critical).toBeUndefined();
    expect(recordSystemEvent.mock.calls[0][0].detail.reachedRunCap).toBe(true);
  });

  it('skips a workspace that never provisioned the object, without failing', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogRetentionService,
        {
          provide: GlobalWorkspaceOrmManager,
          useValue: {
            getRepository: jest
              .fn()
              .mockRejectedValue(
                new Error(
                  'Object metadata for object "auditEvent" is missing in workspace "ws-2"',
                ),
              ),
            executeInWorkspaceContext: jest
              .fn()
              .mockImplementation((fn: () => unknown) => fn()),
          },
        },
        { provide: AuditLogIngestService, useValue: { recordSystemEvent } },
      ],
    }).compile();

    const unprovisioned = module.get(AuditLogRetentionService);

    jest.spyOn(unprovisioned['logger'], 'debug').mockImplementation();
    jest.spyOn(unprovisioned['logger'], 'log').mockImplementation();

    await expect(unprovisioned.pruneWorkspace('ws-2')).resolves.toEqual({});
    expect(recordSystemEvent).not.toHaveBeenCalled();
  });

  it('still surfaces an unrelated database failure', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogRetentionService,
        {
          provide: GlobalWorkspaceOrmManager,
          useValue: {
            getRepository: jest
              .fn()
              .mockRejectedValue(new Error('connection terminated')),
            executeInWorkspaceContext: jest
              .fn()
              .mockImplementation((fn: () => unknown) => fn()),
          },
        },
        { provide: AuditLogIngestService, useValue: { recordSystemEvent } },
      ],
    }).compile();

    const broken = module.get(AuditLogRetentionService);

    jest.spyOn(broken['logger'], 'log').mockImplementation();

    await expect(broken.pruneWorkspace('ws-3')).rejects.toThrow(
      'connection terminated',
    );
  });

  it('deletes in batches rather than one enormous statement', async () => {
    await setup({ info: 2500, notice: 0, sensitive: 0, critical: 0 });

    await service.pruneWorkspace(WORKSPACE_ID);

    const infoDeletes = deleteCalls.filter((c) => c.severity === 'info');

    expect(infoDeletes.length).toBeGreaterThan(1);
    expect(Math.max(...infoDeletes.map((c) => c.count))).toBeLessThanOrEqual(
      1000,
    );
  });
});
