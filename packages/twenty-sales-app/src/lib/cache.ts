import { useCallback, useEffect, useRef, useState } from 'react';

// Tiny stale-while-revalidate cache: views render instantly from the last
// known data and refresh in the background. Sellers switching between tabs
// all day never see a loading flash after the first visit.
//
// Also persisted to localStorage (capped, newest-first) so the *first*
// load of the day — or any full page reload — paints from the last
// snapshot instead of a blank skeleton while it revalidates over the
// network against the live CRM.

const PERSIST_KEY = 'salesAppCache';
const PERSIST_MAX_ENTRIES = 60;

const loadPersistedEntries = (): [string, unknown][] => {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    return raw ? (JSON.parse(raw) as [string, unknown][]) : [];
  } catch {
    return [];
  }
};

const store = new Map<string, unknown>(loadPersistedEntries());

const persist = () => {
  try {
    // newest-first insertion order, capped — the most-visited screens
    // stay warm, one-off detail views age out.
    const entries = [...store.entries()].slice(-PERSIST_MAX_ENTRIES);
    localStorage.setItem(PERSIST_KEY, JSON.stringify(entries));
  } catch {
    // storage full or unavailable (private mode) — in-memory cache still
    // works for the current tab, just doesn't survive a reload.
  }
};

export const invalidateCache = (prefix?: string) => {
  if (!prefix) {
    store.clear();
    try {
      localStorage.removeItem(PERSIST_KEY);
    } catch {
      // ignore
    }
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
  persist();
};

type CachedResult<TData> = {
  data: TData | null;
  error: string | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
};

export const useCached = <TData>(
  key: string,
  fetcher: () => Promise<TData>,
): CachedResult<TData> => {
  const [data, setData] = useState<TData | null>(
    () => (store.get(key) as TData | undefined) ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await fetcherRef.current();
      store.set(key, fresh);
      persist();
      setData(fresh);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در بارگذاری');
    } finally {
      setRefreshing(false);
    }
  }, [key]);

  useEffect(() => {
    setData((store.get(key) as TData | undefined) ?? null);
    void refresh();
  }, [key, refresh]);

  return { data, error, refreshing, refresh };
};
