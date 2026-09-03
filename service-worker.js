const CACHE = 'shaded-shell-v26';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './runtime/install.js',
  './runtime/install.js?v=9',
  './runtime/spatial-viewer.js',
  './runtime/spatial-point-cloud.mjs',
  './runtime/spatial-navigation.mjs',
  './runtime/spatial-reconstruction.mjs',
  './runtime/sparse-voxel-world.mjs',
  './runtime/surface-world-simulation.mjs',
  './runtime/spatial-solid-runtime.js?v=7',
  './icons/shaded.svg',
  './file_00000000974871f49fe71f6b456f9579.png',
  './file_00000000974871f49fe71f6b456f9579_depth.png',
  './file_00000000c84071f4bcd6ff9afdba7246.png',
  './editor/editor.css?v=9',
  './editor/viewport-first.css?v=8',
  './editor/drawer-handle.css?v=2',
  './editor/world-studio.css?v=1',
  './editor/world-studio-shell.css?v=2',
  './editor/workspace-extra-themes.css?v=1',
  './editor/world-studio-imports.css?v=1',
  './editor/engine-shell.css?v=1',
  './editor/app.js?v=9',
  './editor/ui-shell.js?v=10',
  './editor/ux-fixes.js?v=10',
  './editor/world-room-gate.js?v=2',
  './editor/drawer-handle.js?v=3',
  './editor/world-studio.js?v=4',
  './editor/sandbox.html',
  './editor/sandbox.css?v=1',
  './editor/sandbox.js?v=1',
  './editor/sandbox-ui-fixes.js?v=1',
  './editor/sandbox-granular.css?v=1',
  './editor/sandbox-granular.js?v=1',
  './editor/sandbox-coast.css?v=1',
  './editor/sandbox-coast.js?v=1',
  './editor/world-sandbox.css?v=2',
  './editor/world-sandbox.js?v=3',
  './runtime/world-sandbox-reference.mjs',
  './runtime/world-sandbox-webgpu.mjs',
  './editor/world-studio-v4.js?v=1',
  './editor/world-studio-bridge-settings.js?v=1',
  './editor/material-preview-live.js?v=1',
  './editor/world-studio-expert.js?v=2',
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
