import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type StaffDraft,
  clearStaffDraft,
  draftHasContent,
  loadStaffDraft,
  newStaffDraft,
  safeLocalStorage,
  saveStaffDraft,
  staffDraftKey,
} from '../../../lib/forms/collect/staffDraft';

type DraftPatch = Partial<StaffDraft> | ((draft: StaffDraft) => Partial<StaffDraft>);

// The device-local draft of one staff response. Every change is written to
// localStorage straight away — a phone that locks or reloads mid-visit keeps
// what was typed. `current` always holds the latest draft, so async save code
// can read it after awaits without stale closures.
export const useStaffDraft = (
  scope: string,
  versionId: string,
  seed: (draft: StaffDraft) => StaffDraft = (draft) => draft,
) => {
  const key = staffDraftKey(scope, versionId);
  // `finished`: the response is safely on the server and the device copy has
  // been discarded; nothing may write it back.
  const [state, setState] = useState<{ draft: StaffDraft; restored: boolean; finished: boolean }>(() => {
    const stored = loadStaffDraft(safeLocalStorage(), key, versionId);

    return stored !== null && draftHasContent(stored)
      ? { draft: seed(stored), restored: true, finished: false }
      : { draft: seed(newStaffDraft(versionId)), restored: false, finished: false };
  });
  const current = useRef(state.draft);

  current.current = state.draft;

  useEffect(() => {
    if (state.finished) clearStaffDraft(safeLocalStorage(), key);
    else saveStaffDraft(safeLocalStorage(), key, state.draft);
  }, [key, state.draft, state.finished]);

  const update = useCallback((patch: DraftPatch) => {
    const next = {
      ...current.current,
      ...(typeof patch === 'function' ? patch(current.current) : patch),
    };

    current.current = next;
    setState((previous) => ({ ...previous, draft: next }));
  }, []);

  // Starts a new response: new submission key, nothing carried over except
  // what the caller seeds (e.g. the links the screen was opened with).
  const reset = useCallback(() => {
    clearStaffDraft(safeLocalStorage(), key);

    const fresh = seed(newStaffDraft(versionId));

    current.current = fresh;
    setState({ draft: fresh, restored: false, finished: false });
  }, [key, seed, versionId]);

  // Cleared synchronously: the screen usually unmounts in the same update,
  // before an effect could run.
  const finish = useCallback(() => {
    clearStaffDraft(safeLocalStorage(), key);
    setState((previous) => ({ ...previous, finished: true }));
  }, [key]);

  return { draft: state.draft, restored: state.restored, current, update, reset, finish };
};

export type StaffDraftHandle = ReturnType<typeof useStaffDraft>;
