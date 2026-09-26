// Draft autosave, independent of React so its timing rules are testable:
//  * edits are debounced (the save starts after `delayMs` of quiet);
//  * at most one save is in flight — a save requested meanwhile waits for it;
//  * every save sends the revision it builds on plus one, and adopts the
//    revision the server returns;
//  * a conflict (someone else saved) stops autosaving for good — only a
//    reset with the server's copy resumes it — so nothing is overwritten.

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';

export type AutosaveState = {
  status: AutosaveStatus;
  revision: number;
  error: string | null;
  // Edits exist that the server has not confirmed yet.
  dirty: boolean;
};

type AutosaveOptions<TDocument> = {
  initialDocument: TDocument;
  initialRevision: number;
  delayMs: number;
  save: (document: TDocument, nextRevision: number) => Promise<{ revision: number }>;
  isConflict: (error: unknown) => boolean;
  onChange: (state: AutosaveState) => void;
};

export type AutosaveController<TDocument> = {
  edit: (document: TDocument) => void;
  // Saves now; resolves true once everything is on the server.
  flush: () => Promise<boolean>;
  retry: () => Promise<boolean>;
  reset: (document: TDocument, revision: number) => void;
  getState: () => AutosaveState;
  dispose: () => void;
};

export const createAutosave = <TDocument>({
  initialDocument,
  initialRevision,
  delayMs,
  save,
  isConflict,
  onChange,
}: AutosaveOptions<TDocument>): AutosaveController<TDocument> => {
  let latest = initialDocument;
  let saved = initialDocument;
  let revision = initialRevision;
  let status: AutosaveStatus = 'idle';
  let error: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  // Bumped by reset so a save that started before it cannot touch new state.
  let generation = 0;

  const getState = (): AutosaveState => ({
    status,
    revision,
    error,
    dirty: latest !== saved,
  });
  const emit = () => onChange(getState());

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  // One attempt. Resolves false when the save failed or was refused.
  const run = async (): Promise<boolean> => {
    while (inFlight !== null) {
      await inFlight;
    }

    if (status === 'conflict') return false;
    if (latest === saved) return true;

    const document = latest;
    const startedIn = generation;
    let succeeded = false;

    status = 'saving';
    emit();

    inFlight = save(document, revision + 1)
      .then(
        (result) => {
          if (startedIn !== generation) return;
          revision = result.revision;
          saved = document;
          error = null;
          succeeded = true;
          status = latest === saved ? 'saved' : 'pending';
        },
        (failure: unknown) => {
          if (startedIn !== generation) return;
          if (isConflict(failure)) {
            status = 'conflict';
            clearTimer();
          } else {
            status = 'error';
            error = failure instanceof Error ? failure.message : String(failure);
          }
        },
      )
      .finally(() => {
        inFlight = null;
        emit();
      });

    await inFlight;

    return succeeded;
  };

  const schedule = () => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, delayMs);
  };

  return {
    edit: (document) => {
      latest = document;

      if (status !== 'conflict') {
        if (status !== 'saving') status = 'pending';
        schedule();
      }

      emit();
    },
    flush: async () => {
      clearTimer();

      while (latest !== saved) {
        if (!(await run())) return false;
      }

      while (inFlight !== null) {
        await inFlight;
      }

      return status !== 'conflict' && status !== 'error';
    },
    retry: () => {
      clearTimer();

      return run();
    },
    reset: (document, nextRevision) => {
      clearTimer();
      generation += 1;
      inFlight = null;
      latest = document;
      saved = document;
      revision = nextRevision;
      status = 'idle';
      error = null;
      emit();
    },
    getState,
    dispose: clearTimer,
  };
};
