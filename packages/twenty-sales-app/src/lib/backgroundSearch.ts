import { useEffect, useState } from 'react';

import { advancedSearch, type AdvancedHit } from '../api/advancedSearch';
import { dockAdd } from './workbench';

// Background deep-search: on large datasets a full-text sweep can take a
// while, so a seller can park the search as a dock tab, keep working, and get
// notified when the results are in.

export type BackgroundSearch = {
  id: string;
  query: string;
  status: 'running' | 'done' | 'error';
  results: AdvancedHit[];
  startedAt: number;
  finishedAt: number | null;
};

let searches: BackgroundSearch[] = [];
const listeners = new Set<() => void>();
// completion events for the app-level toast
const completionListeners = new Set<(search: BackgroundSearch) => void>();
let counter = 0;

const emit = () => listeners.forEach((fn) => fn());

export const getSearch = (id: string): BackgroundSearch | null =>
  searches.find((s) => s.id === id) ?? null;

export const useBackgroundSearch = (id: string): BackgroundSearch | null => {
  const [value, setValue] = useState(() => getSearch(id));
  useEffect(() => {
    const onChange = () => setValue(getSearch(id));
    onChange();
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, [id]);
  return value;
};

export const onSearchDone = (fn: (search: BackgroundSearch) => void) => {
  completionListeners.add(fn);
  return () => {
    completionListeners.delete(fn);
  };
};

const dockLabel = (search: BackgroundSearch): string => {
  if (search.status === 'running') return `جستجو: ${search.query} …`;
  if (search.status === 'error') return `جستجو: ${search.query} ⚠️`;
  return `جستجو: ${search.query} (${search.results.length})`;
};

export const startBackgroundSearch = (query: string): string => {
  const id = `s${Date.now().toString(36)}${counter++}`;
  const search: BackgroundSearch = {
    id,
    query,
    status: 'running',
    results: [],
    startedAt: Date.now(),
    finishedAt: null,
  };
  searches = [...searches, search];
  emit();
  // park it in the dock right away so the seller can navigate anywhere
  dockAdd({ route: `/search/${id}`, kind: 'search', label: dockLabel(search) });

  void (async () => {
    try {
      const results = await advancedSearch(query, 40);
      searches = searches.map((s) =>
        s.id === id
          ? { ...s, status: 'done', results, finishedAt: Date.now() }
          : s,
      );
    } catch {
      searches = searches.map((s) =>
        s.id === id ? { ...s, status: 'error', finishedAt: Date.now() } : s,
      );
    }
    const finished = getSearch(id);
    if (finished) {
      dockAdd({
        route: `/search/${id}`,
        kind: 'search',
        label: dockLabel(finished),
      });
      completionListeners.forEach((fn) => fn(finished));
    }
    emit();
  })();

  return id;
};
