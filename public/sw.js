// Minimal service worker — forces fresh content on every navigation
// No offline caching. Just cache-busting.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Let all requests go to the network — no caching
  return;
});
