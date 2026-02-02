// Service Worker: caches app shell for offline use
const CACHE_NAME = "cdlta-tracker-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./idb.js",
  "./manifest.webmanifest",
  // Cache scanner lib once fetched
  "./html5-qrcode.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // network-first for API calls, cache-first for everything else
  const url = new URL(req.url);

  // Let API calls go through normally (don’t cache API responses here)
  if (url.origin.includes("script.google.com")) {
    event.respondWith(fetch(req).catch(() => new Response(JSON.stringify({ ok: false, error: "offline" }), {
      headers: { "Content-Type": "application/json" },
    })));
    return;
  }

  // Cache-first for app shell + libs
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return resp;
      });
    })
  );
});

