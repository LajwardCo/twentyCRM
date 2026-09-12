import { afterEach, describe, expect, it, vi } from 'vitest';

const metadataQuery = vi.fn();
vi.mock('./client', () => ({
  metadataQuery: (...args: unknown[]) => metadataQuery(...args),
}));

const objects = (fields: string[]) => ({
  objects: {
    edges: [
      {
        node: {
          nameSingular: 'task',
          fields: { edges: fields.map((name) => ({ node: { name } })) },
        },
      },
    ],
  },
});

describe('isRemindersProvisioned', () => {
  afterEach(() => {
    vi.resetModules();
    metadataQuery.mockReset();
  });

  it('is true when task.remindAt exists and caches the answer for the session', async () => {
    metadataQuery.mockResolvedValueOnce(objects(['dueAt', 'remindAt']));
    const { isRemindersProvisioned } = await import('./remindersSupport');
    expect(await isRemindersProvisioned()).toBe(true);
    expect(await isRemindersProvisioned()).toBe(true);
    expect(metadataQuery).toHaveBeenCalledTimes(1);
  });

  it('is false when the field is missing', async () => {
    metadataQuery.mockResolvedValueOnce(objects(['dueAt']));
    const { isRemindersProvisioned } = await import('./remindersSupport');
    expect(await isRemindersProvisioned()).toBe(false);
  });

  it('does not cache a failed probe', async () => {
    metadataQuery.mockRejectedValueOnce(new Error('offline'));
    metadataQuery.mockResolvedValueOnce(objects(['remindAt']));
    const { isRemindersProvisioned } = await import('./remindersSupport');
    expect(await isRemindersProvisioned()).toBe(false);
    expect(await isRemindersProvisioned()).toBe(true);
    expect(metadataQuery).toHaveBeenCalledTimes(2);
  });
});
