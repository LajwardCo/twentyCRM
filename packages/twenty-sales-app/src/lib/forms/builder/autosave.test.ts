import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type AutosaveState, createAutosave } from './autosave';

class Conflict extends Error {}

type Deferred = { resolve: (revision: number) => void; reject: (error: unknown) => void };

const setup = (initialRevision = 3) => {
  const calls: { document: string; nextRevision: number; deferred: Deferred }[] = [];
  const states: AutosaveState[] = [];
  const controller = createAutosave<string>({
    initialDocument: 'v0',
    initialRevision,
    delayMs: 1200,
    save: (document, nextRevision) =>
      new Promise((resolve, reject) => {
        calls.push({
          document,
          nextRevision,
          deferred: { resolve: (revision) => resolve({ revision }), reject },
        });
      }),
    isConflict: (error) => error instanceof Conflict,
    onChange: (state) => states.push(state),
  });

  return { controller, calls, states };
};

const settle = () => vi.advanceTimersByTimeAsync(0);

describe('autosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('should debounce edits and save the latest one with revision + 1', async () => {
    const { controller, calls } = setup();

    controller.edit('v1');
    await vi.advanceTimersByTimeAsync(1000);
    controller.edit('v2');
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(200);
    expect(calls.map((call) => [call.document, call.nextRevision])).toEqual([['v2', 4]]);
    expect(controller.getState().status).toBe('saving');

    calls[0].deferred.resolve(4);
    await settle();
    expect(controller.getState()).toEqual({ status: 'saved', revision: 4, error: null, dirty: false });
  });

  it('should keep one save in flight and follow up with edits made meanwhile', async () => {
    const { controller, calls } = setup();

    controller.edit('v1');
    await vi.advanceTimersByTimeAsync(1200);
    controller.edit('v2');
    await vi.advanceTimersByTimeAsync(1200);
    // The second save waits for the first.
    expect(calls).toHaveLength(1);

    calls[0].deferred.resolve(4);
    await settle();
    expect(calls.map((call) => [call.document, call.nextRevision])).toEqual([
      ['v1', 4],
      ['v2', 5],
    ]);

    calls[1].deferred.resolve(5);
    await settle();
    expect(controller.getState()).toMatchObject({ status: 'saved', revision: 5, dirty: false });
  });

  it('should stop for good on a conflict until reset', async () => {
    const { controller, calls } = setup();

    controller.edit('v1');
    await vi.advanceTimersByTimeAsync(1200);
    calls[0].deferred.reject(new Conflict());
    await settle();
    expect(controller.getState()).toMatchObject({ status: 'conflict', dirty: true });

    controller.edit('v2');
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(1);
    expect(await controller.flush()).toBe(false);

    controller.reset('server', 9);
    expect(controller.getState()).toEqual({ status: 'idle', revision: 9, error: null, dirty: false });
    controller.edit('v3');
    await vi.advanceTimersByTimeAsync(1200);
    expect(calls[1]).toMatchObject({ document: 'v3', nextRevision: 10 });
  });

  it('should report errors and save again on retry', async () => {
    const { controller, calls } = setup();

    controller.edit('v1');
    await vi.advanceTimersByTimeAsync(1200);
    calls[0].deferred.reject(new Error('network down'));
    await settle();
    expect(controller.getState()).toMatchObject({ status: 'error', error: 'network down', dirty: true });

    const retried = controller.retry();

    await settle();
    calls[1].deferred.resolve(4);
    expect(await retried).toBe(true);
    expect(controller.getState()).toMatchObject({ status: 'saved', revision: 4 });
  });

  it('should flush pending edits immediately', async () => {
    const { controller, calls } = setup();

    controller.edit('v1');

    const flushed = controller.flush();

    await settle();
    expect(calls).toHaveLength(1);
    calls[0].deferred.resolve(4);
    expect(await flushed).toBe(true);
    expect(controller.getState().dirty).toBe(false);
  });

  it('should ignore a save that finishes after a reset', async () => {
    const { controller, calls } = setup();

    controller.edit('v1');
    await vi.advanceTimersByTimeAsync(1200);
    controller.reset('server', 7);
    calls[0].deferred.resolve(4);
    await settle();
    expect(controller.getState()).toMatchObject({ status: 'idle', revision: 7, dirty: false });
  });
});
