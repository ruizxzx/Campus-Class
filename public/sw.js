/* CampusClass 2.0: privacy-first service worker.
 * NEVER cache authenticated HTML, API responses, PDFs or student records.
 * The previous v1 worker cached dashboards and must be purged on upgrade. */
const CACHE_NAME = "campusclass-public-v2";
const STATIC_ASSETS = ["/offline.html", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
  ).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    // Never persist personalized pages, even on successful network responses.
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }
  const safeStatic = url.pathname.startsWith("/_next/static/")
    || STATIC_ASSETS.includes(url.pathname);
  if (!safeStatic) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)
    .then((response) => {
      if (response.ok && (response.type === "basic" || response.type === "default")) {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    })));
});
