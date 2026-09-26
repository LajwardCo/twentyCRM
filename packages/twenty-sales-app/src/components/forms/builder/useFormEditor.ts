import { type FormDefinition } from '@shared/surveys';
import { useCallback, useEffect, useRef, useState } from 'react';

import { DraftConflictError, saveDraft } from '../../../api/surveys';
import {
  type AutosaveController,
  type AutosaveState,
  createAutosave,
} from '../../../lib/forms/builder/autosave';
import { type DefinitionUpdater } from './builderTypes';

const AUTOSAVE_DELAY_MS = 1200;

const INITIAL_STATE: AutosaveState = { status: 'idle', revision: 0, error: null, dirty: false };

// Holds the draft being edited and autosaves it. `load` (re)starts from a
// server copy; edits made before a load are ignored.
export const useFormEditor = (formId: string, enabled: boolean) => {
  const [definition, setDefinition] = useState<FormDefinition | null>(null);
  const [saveState, setSaveState] = useState<AutosaveState>(INITIAL_STATE);
  const controllerRef = useRef<AutosaveController<FormDefinition> | null>(null);
  const definitionRef = useRef<FormDefinition | null>(null);
  const enabledRef = useRef(enabled);

  enabledRef.current = enabled;

  const load = useCallback(
    (serverDefinition: FormDefinition, revision: number) => {
      definitionRef.current = serverDefinition;
      setDefinition(serverDefinition);

      if (controllerRef.current === null) {
        controllerRef.current = createAutosave<FormDefinition>({
          initialDocument: serverDefinition,
          initialRevision: revision,
          delayMs: AUTOSAVE_DELAY_MS,
          save: async (document, nextRevision) => {
            const result = await saveDraft(formId, document, nextRevision);

            return { revision: result.draftRevision };
          },
          isConflict: (error) => error instanceof DraftConflictError,
          onChange: setSaveState,
        });
        setSaveState(controllerRef.current.getState());
      } else {
        controllerRef.current.reset(serverDefinition, revision);
      }
    },
    [formId],
  );

  const edit = useCallback((updater: DefinitionUpdater) => {
    const current = definitionRef.current;
    const controller = controllerRef.current;

    if (current === null || controller === null || !enabledRef.current) return;

    const next = updater(current);

    if (next === current) return;

    definitionRef.current = next;
    setDefinition(next);
    controller.edit(next);
  }, []);

  const flush = useCallback(
    () => controllerRef.current?.flush() ?? Promise.resolve(true),
    [],
  );
  const getRevision = useCallback(() => controllerRef.current?.getState().revision ?? 0, []);
  const retry = useCallback(() => {
    void controllerRef.current?.retry();
  }, []);

  // Leaving the page with unsaved edits: the browser asks first.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const state = controllerRef.current?.getState();

      if (state !== undefined && (state.dirty || state.status === 'saving')) {
        event.preventDefault();
        event.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);

    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Navigating inside the app unmounts the workspace; whatever is still
  // pending is sent right away rather than dropped.
  useEffect(
    () => () => {
      const controller = controllerRef.current;

      if (controller === null) return;

      controller.dispose();

      if (controller.getState().dirty) void controller.flush();
    },
    [],
  );

  return { definition, saveState, load, edit, flush, retry, getRevision };
};
