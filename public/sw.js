const CACHE_NAME = 'aprice-shell-v1';
const OFFLINE_URL = '/aprice/offline.html';
const SHELL_URLS = [
  '/aprice/',
  '/aprice/scan/',
  '/aprice/login/',
  '/aprice/me/',
  '/aprice/offline.html',
  '/aprice/manifest.webmanifest',
  '/aprice/app-icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(OFFLINE_URL)) || Response.error();
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (!response || response.status !== 200 || response.type !== 'basic') {
        return response;
      }
      const cloned = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned)).catch(() => {});
      return response;
    })),
  );
});
