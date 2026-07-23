import { useCallback, useEffect, useRef, useState } from 'react';

// Tiny stale-while-revalidate cache: views render instantly from the last
// known data and refresh in the background. Sellers switching between tabs
// all day never see a loading flash after the first visit.

const store = new Map<string, unknown>();

export const invalidateCache = (prefix?: string) => {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
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
