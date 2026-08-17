const CACHE = 'shaded-shell-v13';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './runtime/install.js',
  './runtime/install.js?v=8',
  './runtime/spatial-viewer.js',
  './runtime/spatial-navigation.mjs',
  './runtime/spatial-reconstruction.mjs',
  './runtime/sparse-voxel-world.mjs',
  './runtime/surface-world-simulation.mjs',
  './runtime/spatial-solid-runtime.js?v=7',
  './icons/shaded.svg',
  './file_00000000974871f49fe71f6b456f9579.png',
  './file_00000000974871f49fe71f6b456f9579_depth.png',
  './file_00000000c84071f4bcd6ff9afdba7246.png',
  './editor/index.html',
  './editor/editor.css?v=7',
  './editor/viewport-first.css?v=7',
  './editor/drawer-handle.css?v=1',
  './editor/world-studio.css?v=1',
  './editor/world-studio-shell.css?v=1',
  './editor/world-studio-imports.css?v=1',
  './editor/app.js',
  './editor/ui-shell.js',
  './editor/app.js?v=8',
  './editor/ui-shell.js?v=7',
  './editor/ux-fixes.js?v=7',
  './editor/world-room-gate.js?v=1',
  './editor/drawer-handle.js?v=1',
  './editor/world-studio.js?v=3',
  './editor/world-studio-bridge-settings.js?v=1',
  './editor/material-preview-live.js?v=1',
  './editor/world-studio-expert.js?v=1',
  './editor/facade.js',
  './editor/markerPainter.js',
  './editor/actorPlacer.js'
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

  const isCode = /\.(?:js|mjs|css)$/.test(url.pathname) || url.pathname.startsWith('/editor/');
  if (request.mode === 'navigate' || isCode) {
    event.respondWith(networkFirst(request).catch(async () => {
      if (request.mode === 'navigate') return (await caches.match(request)) || caches.match('./editor/index.html') || caches.match('./index.html');
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