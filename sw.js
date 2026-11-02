/* My YouTube PWA 1.3 — GitHub Pages compatible offline shell.
   Only app files are stored in Cache Storage. YouTube videos and API responses are not cached. */
const CACHE_NAME = 'my-youtube-shell-20261102-smart-share-v4';
const BASE = new URL(self.registration.scope);
const OFFLINE_PAGE = new URL('index.html', BASE).href;
const SHELL = [
  './',
  './index.html',
  './share.html',
  './style.css',
  './app.js?v=20261101-smart-feed-2-2',
  './pwa.js?v=20261102-smart-share-v4',
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

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        // Prevent cached share URLs with private data or old HTML.
        const response = await fetch(request);
        if (response.ok && url.search === '' && (url.pathname === BASE.pathname || url.pathname.endsWith('/index.html'))) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(OFFLINE_PAGE, response.clone());
        }
        return response;
      } catch (error) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(request)) || (await cache.match(OFFLINE_PAGE)) || (await cache.match(BASE.href)) ||
          new Response('My YouTube is not yet available offline. Open it once while online.',
            {status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
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
