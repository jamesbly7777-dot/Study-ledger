self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.registration.unregister().then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", () => {
  // no caching for now
});
