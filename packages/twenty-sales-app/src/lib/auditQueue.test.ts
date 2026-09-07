import { describe, expect, it, vi } from 'vitest';

import { createAuditQueue, type QueueStorage } from './auditQueue';
import type { AuditRecord } from './auditEvent';

const record = (over: Partial<AuditRecord> = {}): AuditRecord => ({
  occurredAt: '2026-09-07T10:00:00.000Z',
  eventType: 'record.read',
  category: 'read',
  severity: 'sensitive',
  actorMemberId: null,
  actorName: 'x',
  actorEmail: 'x@y.z',
  actorRole: 'seller',
  targetType: 'lead',
  targetId: 'a',
  targetLabel: null,
  route: '/leads',
  detail: null,
  sessionId: 's1',
  device: null,
  ...over,
});

const memoryStorage = (initial: string | null = null): QueueStorage => {
  let value = initial;
  return {
    read: () => value,
    write: (next) => {
      value = next;
    },
    clear: () => {
      value = null;
    },
  };
};

describe('createAuditQueue', () => {
  it('batches and sends what was pushed', async () => {
    const sink = vi.fn().mockResolvedValue(undefined);
    const queue = createAuditQueue({ sink });
    queue.push(record({ targetId: 'a' }));
    queue.push(record({ targetId: 'b' }));
    expect(queue.pending()).toBe(2);

    await queue.flush();

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0][0]).toHaveLength(2);
    expect(queue.pending()).toBe(0);
  });

  it('splits an oversized backlog into batches', async () => {
    const sink = vi.fn().mockResolvedValue(undefined);
    const queue = createAuditQueue({ sink, maxBatch: 2, dedupeWindowMs: 0 });
    for (const id of ['a', 'b', 'c', 'd', 'e']) queue.push(record({ targetId: id }));

    await queue.flush();

    expect(sink.mock.calls.map((c) => c[0].length)).toEqual([2, 2, 1]);
  });

  it('folds a repeated read of the same record into one row', () => {
    let clock = 0;
    const queue = createAuditQueue({
      sink: vi.fn(),
      now: () => clock,
      dedupeWindowMs: 1000,
    });
    queue.push(record());
    queue.push(record());
    expect(queue.pending()).toBe(1);

    clock = 2000;
    queue.push(record());
    expect(queue.pending()).toBe(2);
  });

  it('keeps events when the server refuses them', async () => {
    const sink = vi.fn().mockRejectedValue(new Error('offline'));
    const queue = createAuditQueue({ sink });
    queue.push(record());

    await expect(queue.flush()).resolves.toBeUndefined();
    expect(queue.pending()).toBe(1);

    sink.mockResolvedValue(undefined);
    await queue.flush();
    expect(queue.pending()).toBe(0);
  });

  it('stops after the first failed batch instead of losing later ones', async () => {
    const sink = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('offline'));
    const queue = createAuditQueue({ sink, maxBatch: 1, dedupeWindowMs: 0 });
    queue.push(record({ targetId: 'a' }));
    queue.push(record({ targetId: 'b' }));
    queue.push(record({ targetId: 'c' }));

    await queue.flush();

    expect(queue.pending()).toBe(2);
  });

  it('survives a reload by persisting unsent events', async () => {
    const storage = memoryStorage();
    const failing = createAuditQueue({
      sink: vi.fn().mockRejectedValue(new Error('offline')),
      storage,
    });
    failing.push(record({ targetId: 'kept' }));
    await failing.flush();

    const sink = vi.fn().mockResolvedValue(undefined);
    const revived = createAuditQueue({ sink, storage });
    expect(revived.pending()).toBe(1);
    await revived.flush();
    expect(sink.mock.calls[0][0][0].targetId).toBe('kept');
    expect(storage.read()).toBeNull();
  });

  it('starts clean on a corrupt buffer rather than wedging', () => {
    const queue = createAuditQueue({
      sink: vi.fn(),
      storage: memoryStorage('not json'),
    });
    expect(queue.pending()).toBe(0);
  });

  it('records its own overflow so a gap is never silent', async () => {
    const sink = vi.fn().mockResolvedValue(undefined);
    const queue = createAuditQueue({ sink, maxBuffer: 2, dedupeWindowMs: 0, maxBatch: 10 });
    for (const id of ['a', 'b', 'c', 'd']) queue.push(record({ targetId: id }));
    expect(queue.pending()).toBe(2);
    expect(queue.droppedCount()).toBe(2);

    await queue.flush();

    const last = sink.mock.calls.at(-1)?.[0][0];
    expect(last.eventType).toBe('audit.buffer_overflow');
    expect(last.severity).toBe('critical');
    expect(JSON.parse(last.detail)).toEqual({ lostEvents: 2 });
    expect(queue.droppedCount()).toBe(0);
  });

  it('does not run two flushes at once', async () => {
    const releases: (() => void)[] = [];
    const sink = vi.fn(
      () => new Promise<void>((resolve) => {
        releases.push(resolve);
      }),
    );
    const queue = createAuditQueue({ sink, dedupeWindowMs: 0 });
    queue.push(record({ targetId: 'a' }));

    const first = queue.flush();
    const second = queue.flush();
    releases.forEach((resolve) => resolve());
    await Promise.all([first, second]);

    expect(sink).toHaveBeenCalledTimes(1);
  });

  it('never lets a broken storage break the caller', () => {
    const queue = createAuditQueue({
      sink: vi.fn(),
      storage: {
        read: () => null,
        write: () => {
          throw new Error('QuotaExceeded');
        },
        clear: () => {},
      },
    });
    expect(() => queue.push(record())).not.toThrow();
    expect(queue.pending()).toBe(1);
  });
});
