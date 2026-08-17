/*
EGGSACT Worker - service worker

Caches the app shell (HTML/CSS/JS, including the vendored xlsx library)
on first load, so every load AFTER that works with zero internet. This
is what makes "brief connection once, then fully offline" actually true.

Bump CACHE_NAME when you change any cached file, so returning users get
the update instead of a stale cached copy.
*/

const CACHE_NAME = "eggsact-worker-v2";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/db.js",
  "./js/xlsx-export.js",
  "./js/sync.js",
  "./js/app.js",
  "./js/vendor/xlsx.full.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Cache-first for the app shell: works offline. Anything not in the
  // shell (like a sync POST to the server) just goes to the network
  // normally - this worker never intercepts those.
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
