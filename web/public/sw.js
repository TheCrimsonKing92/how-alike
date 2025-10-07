const CACHE_NAME = 'howalike-shell-v1';
const SHELL_URLS = ['/', '/health/detector', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => k !== CACHE_NAME && caches.delete(k))))
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Network-first for navigation; cache-first for others
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/'))
    );
  } else {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req))
    );
  }
});

