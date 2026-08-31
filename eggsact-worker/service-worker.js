/*
EGGSACT Worker - service worker

Caches the app shell (HTML/CSS/JS, including the vendored libraries) so every
load after the first works with zero internet.

v5: adds js/templates.js to the shell. It was missing, so a phone that
installed while offline had no embedded house layouts and Export had nothing
to write into. Bump CACHE_NAME whenever a shell file changes.
*/

const CACHE_NAME = "eggsact-worker-v5";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/db.js",
  "./js/xlsx-patch.js",
  "./js/master.js",
  "./js/autocorrect.js",
  "./js/vendor/fflate.min.js",
  "./js/xlsx-export.js",
  "./js/sync.js",
  "./js/templates.js",
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
  if (event.request.method !== "GET") return;

  // Never serve a cached copy of anything from the sync server - a stale
  // master file or a stale login response would be worse than no answer.
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/sync/")) return;

  // Network-first so an updated file is picked up on the next load, falling
  // back to cache the moment there's no signal. The old cache-first rule
  // meant a phone could keep running an old build forever.
  event.respondWith(
    fetch(event.request)
      .then((resp) => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
        }
        return resp;
      })
      .catch(() => caches.match(event.request))
  );
});
