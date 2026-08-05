import { useEffect, useState } from 'react';

// Minimal hash router: routes look like "#/today", "#/lead/<id>",
// "#/lead/<id>/chat", optionally followed by a query string
// ("#/leads?stage=NEW_LEAD") that carries list filters and upload tokens.
export type Route = {
  path: string;
  parts: string[];
  query: string;
};

const parseHash = (): Route => {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const queryAt = raw.indexOf('?');
  const pathname = queryAt === -1 ? raw : raw.slice(0, queryAt);
  const query = queryAt === -1 ? '' : raw.slice(queryAt + 1);
  const parts = pathname.split('/').filter(Boolean);
  return { path: pathname, parts, query };
};

export const useRoute = (): Route => {
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
};

export const navigate = (to: string) => {
  window.location.hash = to.startsWith('/') ? `#${to}` : `#/${to}`;
};

// Rewrites only the query half of the current hash, in place. It uses
// replaceState rather than assigning to location.hash so that typing in a
// filter doesn't bury the previous screen under a stack of history entries --
// and, because replaceState fires no hashchange, so that the screen owning the
// filter isn't re-rendered from the router on every keystroke.
export const replaceQuery = (query: string) => {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const pathname = raw.split('?')[0];
  const next = `#/${pathname}${query ? `?${query}` : ''}`;
  if (window.location.hash !== next) {
    window.history.replaceState(null, '', next);
  }
};

export const goBack = () => {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    navigate('/today');
  }
};

// history.length counts entries the app never created -- a deep link opened in
// a tab that has been used before still reports a long history -- so back() can
// leave the app where it was. Watch the hash and fall back when nothing moved.
export const goBackOr = (fallback: string, timeoutMs = 150) => {
  const before = window.location.hash;
  goBack();
  window.setTimeout(() => {
    if (window.location.hash === before) navigate(fallback);
  }, timeoutMs);
};
