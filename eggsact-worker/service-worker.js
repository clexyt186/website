/*
EGGSACT Worker - service worker

Caches the app shell (HTML/CSS/JS, including the vendored xlsx library)
on first load, so every load AFTER that works with zero internet. This
is what makes "brief connection once, then fully offline" actually true.

Bump CACHE_NAME when you change any cached file, so returning users get
the update instead of a stale cached copy.
*/

const CACHE_NAME = "eggsact-worker-v4";
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

  // Never serve a cached copy of anything from the sync server - a stale
  // master file or a stale login response would be worse than no answer.
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/sync/")) return;

  // App shell: try the network first so an updated file is picked up on the
  // next load, falling back to cache the moment there's no signal. The old
  // cache-first rule meant a phone could keep running an old build forever.
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
