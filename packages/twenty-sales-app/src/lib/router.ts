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
