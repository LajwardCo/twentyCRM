import { type CompletionStatus } from '../../../api/surveys';

// "Save incomplete" and "submit" write the same response. Run concurrently
// they race: two creates before either stored the response id, attachments
// linked twice, or a late PARTIAL landing on top of a COMPLETED. The gate
// allows one save at a time:
// - a repeat of the running save shares its promise (double click);
// - submit pressed while a partial save runs waits for it, then completes;
// - nothing may follow a completing save: a partial save pressed during it
//   just shares the completion's outcome.
export const createExclusiveSave = <TResult>(
  run: (status: CompletionStatus) => Promise<TResult>,
  onRunningChange: (status: CompletionStatus | null) => void = () => undefined,
) => {
  let current: { status: CompletionStatus; promise: Promise<TResult> } | null = null;

  const start = (status: CompletionStatus): Promise<TResult> => {
    const promise: Promise<TResult> = run(status).finally(() => {
      if (current?.promise === promise) {
        current = null;
        onRunningChange(null);
      }
    });

    current = { status, promise };
    onRunningChange(status);

    return promise;
  };

  const save = (status: CompletionStatus): Promise<TResult> => {
    if (current === null) return start(status);
    if (current.status === status || current.status === 'COMPLETED') return current.promise;

    return current.promise.then(
      () => save(status),
      () => save(status),
    );
  };

  return save;
};
