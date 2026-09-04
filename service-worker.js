const CACHE = 'shaded-runtime-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/shaded.svg',
  './file_00000000974871f49fe71f6b456f9579.png',
  './file_00000000974871f49fe71f6b456f9579_depth.png',
  './file_00000000c84071f4bcd6ff9afdba7246.png',
  './runtime/shaded-engine.mjs',
  './runtime/dialogue-engine.mjs',
  './runtime/actor-bridge.mjs',
  './runtime/weather-particles.mjs',
  './runtime/player-fire.mjs',
  './runtime/world-sandbox-reference.mjs',
  './runtime/world-sandbox-webgpu.mjs',
  './runtime/world-sandbox-camera.mjs',
  './runtime/world-sandbox-cpu-backend.mjs',
  './runtime/world-sandbox-browser-backend.mjs',
  './runtime/world-sandbox-runtime.mjs',
  './integrations/scene-runtime-facade.js',
  './integrations/headless-orchestrator.js',
  './integrations/world-sandbox-runtime.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('shaded-') && key !== CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isCode = /\.(?:js|mjs|css)$/.test(url.pathname);
  if (request.mode === 'navigate' || isCode) {
    event.respondWith(networkFirst(request).catch(async () => {
      if (request.mode === 'navigate') return (await caches.match(request)) || caches.match('./index.html');
      return Response.error();
    }));
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
