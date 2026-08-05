import { useCallback, useMemo, useRef, useState } from 'react';

import {
  activeFilterCount,
  clearFilter,
  decodeFilterState,
  encodeFilterState,
  setFilter,
  type FilterField,
  type FilterState,
  type FilterValue,
} from './filters';
import { loadPrefs, savePref } from './prefs';
import { replaceQuery } from './router';

// Wires a screen's filter state to the two places it has to survive: the URL
// (so a filtered list is a link a seller can send to a colleague) and prefs (so
// the screen reopens the way it was left). The URL wins on load -- an incoming
// link must show what it says, not what this browser last looked at.

const initialState = <TRow>(
  screenKey: string,
  fields: FilterField<TRow>[],
  query: string,
): FilterState => {
  const fromUrl = decodeFilterState(fields, query);
  if (Object.keys(fromUrl).length > 0) return fromUrl;
  return decodeFilterState(fields, loadPrefs().filters[screenKey] ?? '');
};

export type UseFiltersResult = {
  state: FilterState;
  count: number;
  set: (key: string, value: FilterValue) => void;
  clear: (key: string) => void;
  clearAll: () => void;
};

export const useFilters = <TRow>(
  screenKey: string,
  fields: FilterField<TRow>[],
  query: string,
): UseFiltersResult => {
  // Read the URL once, on mount. Re-reading it would fight the writes below.
  const initialQuery = useRef(query);
  const [state, setState] = useState<FilterState>(() =>
    initialState(screenKey, fields, initialQuery.current),
  );

  const persist = useCallback(
    (next: FilterState) => {
      const encoded = encodeFilterState(fields, next);
      replaceQuery(encoded);
      const filters = { ...loadPrefs().filters };
      if (encoded) filters[screenKey] = encoded;
      else delete filters[screenKey];
      savePref('filters', filters);
      setState(next);
    },
    [fields, screenKey],
  );

  const set = useCallback(
    (key: string, value: FilterValue) => {
      persist(setFilter(state, key, value));
    },
    [persist, state],
  );

  const clear = useCallback(
    (key: string) => {
      persist(clearFilter(state, key));
    },
    [persist, state],
  );

  const clearAll = useCallback(() => {
    persist({});
  }, [persist]);

  const count = useMemo(
    () => activeFilterCount(fields, state),
    [fields, state],
  );

  return { state, count, set, clear, clearAll };
};
