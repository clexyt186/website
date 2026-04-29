/* CLEXYT Service Worker — v2 */
'use strict';

const CACHE = 'clexyt-v2';

// Pages to pre-cache so they work offline
const PRECACHE = [
  'games.html',
  'index.html',
  'portfolio.html',
  'style.css',
  'script.js',
];

// Install: cache key pages
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).catch(() => {})
  );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for precached files, network-first for everything else
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  const isCached = PRECACHE.some(p => url.pathname.endsWith(p));

  if (isCached) {
    // Cache-first: serve from cache, update in background
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(event.request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
  // All other requests: network with cache fallback
  else {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});
