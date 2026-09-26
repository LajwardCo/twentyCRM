import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type SurveyFormVersion, fetchVersion } from '../../../api/surveys';
import {
  type StaffDraft,
  clearStaffDraft,
  loadStaffDraft,
  newStaffDraft,
  restoreStaffDraft,
  safeLocalStorage,
  saveStaffDraft,
  storedDraftVersionId,
} from '../../../lib/forms/collect/staffDraft';

type DraftPatch = Partial<StaffDraft> | ((draft: StaffDraft) => Partial<StaffDraft>);

// The device-local draft of one staff response. Every change is written to
// localStorage straight away — a phone that locks or reloads mid-visit keeps
// what was typed. `current` always holds the latest draft, so async save code
// can read it after awaits without stale closures. `draftKey` comes from
// staffDraftKey (member + scope).
export const useStaffDraft = (
  draftKey: string,
  versionId: string,
  seed: (draft: StaffDraft) => StaffDraft = (draft) => draft,
) => {
  // `finished`: the response is safely on the server and the device copy has
  // been discarded; nothing may write it back.
  const [state, setState] = useState<{ draft: StaffDraft; restored: boolean; finished: boolean }>(() => {
    const { draft, restored } = restoreStaffDraft(loadStaffDraft(safeLocalStorage(), draftKey), versionId);

    return { draft: seed(draft), restored, finished: false };
  });
  const current = useRef(state.draft);

  current.current = state.draft;

  useEffect(() => {
    if (state.finished) clearStaffDraft(safeLocalStorage(), draftKey);
    else saveStaffDraft(safeLocalStorage(), draftKey, state.draft);
  }, [draftKey, state.draft, state.finished]);

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
    clearStaffDraft(safeLocalStorage(), draftKey);

    const fresh = seed(newStaffDraft(versionId));

    current.current = fresh;
    setState({ draft: fresh, restored: false, finished: false });
  }, [draftKey, seed, versionId]);

  // Cleared synchronously: the screen usually unmounts in the same update,
  // before an effect could run.
  const finish = useCallback(() => {
    clearStaffDraft(safeLocalStorage(), draftKey);
    setState((previous) => ({ ...previous, finished: true }));
  }, [draftKey]);

  return { draft: state.draft, restored: state.restored, current, update, reset, finish };
};

export type StaffDraftHandle = ReturnType<typeof useStaffDraft>;

export type DraftVersion =
  | { status: 'loading' }
  | { status: 'ready'; version: SurveyFormVersion; olderThan: SurveyFormVersion | null };

// Which version the form should open on. Normally the one the screen loaded;
// but a draft started before the form was republished is finished on the
// version it was started on (the server accepts older versions), so an
// unfinished response is never orphaned. `olderThan` is the loaded version
// when the draft's older one is used. `switchToCurrent` drops back to the loaded
// version once the user discards that draft.
export const useDraftVersion = (draftKey: string, loaded: SurveyFormVersion) => {
  const [discarded, setDiscarded] = useState(false);
  const storedVersionId = useMemo(() => storedDraftVersionId(safeLocalStorage(), draftKey), [draftKey]);
  const needsOlder = !discarded && storedVersionId !== null && storedVersionId !== loaded.id;
  const [older, setOlder] = useState<SurveyFormVersion | 'failed' | null>(null);

  useEffect(() => {
    if (!needsOlder || storedVersionId === null) return;

    let cancelled = false;

    fetchVersion(storedVersionId)
      .then((version) => {
        if (!cancelled) setOlder(version !== null && version.formId === loaded.formId ? version : 'failed');
      })
      .catch(() => {
        if (!cancelled) setOlder('failed');
      });

    return () => {
      cancelled = true;
    };
  }, [needsOlder, storedVersionId, loaded.formId]);

  const state: DraftVersion = !needsOlder
    ? { status: 'ready', version: loaded, olderThan: null }
    : older === null
      ? { status: 'loading' }
      : older === 'failed'
        ? { status: 'ready', version: loaded, olderThan: null }
        : { status: 'ready', version: older, olderThan: loaded };

  return { state, switchToCurrent: () => setDiscarded(true) };
};
