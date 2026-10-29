const CACHE_VERSION = 'actlog-static-v13';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './pickers.js',
  './auth.js',
  './config.js',
  './firestore.js',
  './manifest.json',
  './favicon.svg',
  './icon-192.svg',
  './icon-512.svg',
  './icon-maskable-192.svg',
  './icon-maskable-512.svg',
  './icons/favicon-16.png',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith('actlog-static-') && cacheName !== CACHE_VERSION)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const responseCopy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, responseCopy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        // The shell fallback is a document. Handing it to an asset request (the
        // .xlsx template, a JSON call) makes the caller parse HTML as its own
        // payload, so offline failures stay real errors instead.
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }

        return Response.error();
      }))
  );
});
