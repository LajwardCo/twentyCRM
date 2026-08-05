/* Sales App service worker.
 *
 * Served from /sales/sw.js, so its default scope is exactly the app's base
 * path — it never sees requests belonging to the main Twenty front-end.
 *
 * Caching policy, deliberately conservative because this app shows live CRM
 * data over a shared session:
 *   - API traffic (/graphql, /metadata, /rest, /public) is NEVER cached and
 *     never served from cache. Stale pipeline numbers are worse than an error.
 *   - Navigations are network-first with the cached app shell as the offline
 *     fallback, so a seller who loses signal still gets the UI (and the UI's
 *     own error states) instead of the browser's dinosaur.
 *   - Hashed build assets are stale-while-revalidate: instant launch, with the
 *     new bundle picked up in the background for the next start.
 */

const VERSION = 'v3';
const SHELL_CACHE = `sales-shell-${VERSION}`;
const ASSET_CACHE = `sales-assets-${VERSION}`;
const SHELL_URL = '/sales/index.html';

// Enough to boot the UI offline; everything else is filled in as it is used.
const PRECACHE_URLS = [
  SHELL_URL,
  '/sales/',
  '/sales/manifest.webmanifest',
  '/sales/icon-192.png',
  '/sales/icon-512.png',
];

// Any path under these prefixes is live data or an authenticated mutation.
const API_PREFIXES = ['/graphql', '/metadata', '/rest', '/public/'];

const isApiRequest = (url) =>
  API_PREFIXES.some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(prefix),
  );

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // One bad URL must not fail the whole install.
      await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('sales-') && key !== SHELL_CACHE && key !== ASSET_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

// The page posts this after the user accepts an update prompt.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') void self.skipWaiting();
});

const networkFirstShell = async (request) => {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      void cache.put(SHELL_URL, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(SHELL_URL, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
};

const staleWhileRevalidate = async (request) => {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      // Opaque/error responses would poison the cache for the next launch.
      if (response.ok && response.type === 'basic') {
        void cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) return cached;

  const response = await network;
  if (response) return response;
  throw new Error('offline and not cached');
};

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (isApiRequest(url)) return;
  if (!url.pathname.startsWith('/sales/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
