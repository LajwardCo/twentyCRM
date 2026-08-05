import { useEffect, useState } from 'react';

// Minimal hash router: routes look like "#/today", "#/lead/<id>", "#/lead/<id>/chat".
export type Route = {
  path: string;
  parts: string[];
};

const parseHash = (): Route => {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  return { path: raw, parts };
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
