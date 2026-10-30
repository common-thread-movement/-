
/*
 * ISS FIELD PDA
 * Offline Service Worker v1
 */

const CACHE_NAME = "iss-pda-shell-v1";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json"
];

// Cache app files during installation.
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

// Remove outdated application caches.
self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();

      await Promise.all(
        names
          .filter(name =>
            name.startsWith("iss-pda-shell-") &&
            name !== CACHE_NAME
          )
          .map(name => caches.delete(name))
      );

      await self.clients.claim();
    })()
  );
});

// Serve same-origin application files offline.
self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  // App navigation: try network, then cached entry.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);

        return (
          await cache.match(request) ||
          await cache.match("./index.html") ||
          Response.error()
        );
      })
    );

    return;
  }

  // Application assets: use local cache first.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);

      if (cached) return cached;

      return fetch(request);
    })()
  );
});
