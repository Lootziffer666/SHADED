const CACHE = 'shaded-shell-v4';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './runtime/install.js',
  './runtime/spatial-viewer.js',
  './runtime/spatial-navigation.mjs',
  './runtime/spatial-reconstruction.mjs',
  './runtime/sparse-voxel-world.mjs',
  './runtime/surface-world-simulation.mjs',
  './icons/shaded.svg',
  './file_00000000974871f49fe71f6b456f9579.png',
  './file_00000000974871f49fe71f6b456f9579_depth.png',
  './file_00000000c84071f4bcd6ff9afdba7246.png',
  './editor/index.html',
  './editor/editor.css',
  './editor/app.js',
  './editor/facade.js',
  './editor/markerPainter.js',
  './editor/actorPlacer.js',
  './editor/storyboardTimeline.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('shaded-shell-') && key !== CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Documents prefer fresh code, but retain the exact cached editor/runtime page
  // when offline. Static shell modules use stale-while-revalidate.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request)
      .then((response) => {
        if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
        return response;
      })
      .catch(async () => (await caches.match(request)) || caches.match('./index.html')));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => {
    const update = fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    });
    return cached || update;
  }));
});
