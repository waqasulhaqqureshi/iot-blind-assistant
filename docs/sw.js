/* Service worker: makes the app load without a connection once it has been opened online.
 *
 * - App shell: cached on install.
 * - Everything else (CDN scripts, model weights): cached the first time it is fetched,
 *   then served from the cache. Bump CACHE to force a refresh after an update. */
const CACHE = "iot-blind-assistant-v1";
const SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/announcer.mjs",
  "./js/proximity.mjs",
  "./js/motion.mjs",
  "./js/ocr-clean.mjs",
  "./js/sensor-ble.mjs",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          // Keep good responses and opaque cross-origin script responses (status 0).
          if (response.ok || response.type === "opaque") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});
