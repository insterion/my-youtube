/* My YouTube PWA 1.3.8 — resilient offline navigation.
   Only fixed app assets are cached. YouTube videos and API responses are never cached.
   Keep Share Receiver navigation working offline, including Android Share query parameters. */
const CACHE_NAME = 'my-youtube-shell-20261103-channels-1-4-5';
const BASE = new URL(self.registration.scope);
const OFFLINE_PAGE = new URL('index.html', BASE).href;
const SHARE_PAGE = new URL('share.html', BASE).href;
const NAVIGATION_TIMEOUT_MS = 12000;
const SHELL = [
  './',
  './index.html',
  './share.html',
  './style.css',
  './youtube-utils.js?v=20261102-maintenance-1-3-6',
  './youtube-api.js?v=20261102-maintenance-1-3-6',
  './library-storage.js?v=20261102-maintenance-1-3-6',
  './backup-manager.js?v=20261102-maintenance-1-3-6',
  './ui-navigation.js?v=20261103-saved-1-4-3',
  './app.js?v=20261103-channels-1-4-5',
  './pwa.js?v=20261102-maintenance-1-3-6',
  './manifest.webmanifest?v=20261102-pwa2',
  './icon-192.png',
  './icon-512.png'
].map(path => new URL(path, BASE).href);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL);
    // Do not skipWaiting automatically; the user can choose when to restart.
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith('my-youtube-shell-') && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function unavailableResponse() {
  return new Response(
    'This My YouTube page is not available offline. Reconnect and try again.',
    { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  );
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS);
      try {
        // Network-first: always prefer the current published page when reachable.
        const response = await fetch(request, { signal: controller.signal });
        if (response.ok && url.search === '' &&
            (url.pathname === BASE.pathname || url.pathname === new URL('index.html', BASE).pathname)) {
          const cache = await caches.open(CACHE_NAME);
          // Cache only the canonical Home HTML, never URLs containing shared links.
          try { await cache.put(OFFLINE_PAGE, response.clone()); }
          catch (error) { console.warn('Could not refresh the offline Home page:', error); }
        }
        return response;
      } catch (error) {
        const cache = await caches.open(CACHE_NAME);
        // Android Share targets often include ?title=&text=&url=. Match the
        // cached receiver by PATH, preserving the original URL's query for JS.
        if (url.pathname === new URL('share.html', BASE).pathname) {
          return (await cache.match(SHARE_PAGE)) || unavailableResponse();
        }
        // Only the Home entry points may fall back to the app shell. Serving
        // index.html for Diagnostics or a missing URL would be misleading.
        if (url.pathname === BASE.pathname ||
            url.pathname === new URL('index.html', BASE).pathname) {
          return (await cache.match(OFFLINE_PAGE)) ||
            (await cache.match(BASE.href)) || unavailableResponse();
        }
        return (await cache.match(request, { ignoreSearch: true })) || unavailableResponse();
      } finally {
        clearTimeout(timeout);
      }
    })());
    return;
  }
  // Only cache the fixed app shell, never arbitrary URLs or credentials.
  if (!SHELL.includes(url.href)) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(request)) || Response.error();
    }
  })());
});
