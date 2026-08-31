const CACHE_NAME = "feedalot-worker-v3";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/db.js",
  "./js/xlsx-patch.js",
  "./js/master.js",
  "./js/vendor/fflate.min.js",
  "./js/xlsx-export.js",
  "./js/numeric_input.js",
  "./js/formulation.js",
  "./js/templates.js",
  "./js/app.js",
  "./js/vendor/xlsx.full.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Never cache anything from the sync server - a stale group file would be
  // worse than no answer at all.
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/feedlot/")) return;
  // Network-first: an updated file is picked up on the next load instead of
  // a phone staying on an old build indefinitely, with the cache as the
  // offline fallback.
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
